import SQL from "sql-template-strings"
import { ethers } from "ethers"
import { IConfigComponent, ILoggerComponent } from "@well-known-components/interfaces"
import { IPgComponent } from "@well-known-components/pg-component"
import { ISubgraphComponent } from "@well-known-components/thegraph-component"
import { createConfigComponent } from "@well-known-components/env-config-provider"
import {
  ChainId,
  Network,
  NFTCategory,
  RentalListingCreation,
  RentalsListingsFilterByCategory,
  RentalsListingSortDirection,
  RentalsListingsSortBy,
  RentalStatus,
} from "@dcl/schemas"
import * as rentalsLogic from "../../src/logic/rentals"
import {
  IndexerRental,
  createRentalsComponent,
  DBGetRentalListing,
  InvalidSignature,
  IRentalsComponent,
  NFT,
  NFTNotFound,
  RentalAlreadyExists,
  RentalNotFound,
  UnauthorizedToRent,
  DBRental,
  DBRentalListing,
  IndexerIndexesHistoryUpdate,
  IndexerIndexUpdateType,
  IndexUpdateEventType,
  InvalidEstate,
  RentalAlreadyExpired,
  DBGetRentalListingsPrice,
} from "../../src/ports/rentals"
import { fromMillisecondsToSeconds } from "../../src/adapters/rentals"
import { createTestConsoleLogComponent, createTestDbComponent, createTestSubgraphComponent } from "../components"

jest.mock("../../src/logic/rentals")

const mockedRentalsLogic = jest.mocked(rentalsLogic, true)

let dbQueryMock: jest.Mock
let dbClientQueryMock: jest.Mock
let dbClientReleaseMock: jest.Mock
let database: IPgComponent
let marketplaceSubgraphQueryMock: jest.Mock
let marketplaceSubgraph: ISubgraphComponent
let rentalsSubgraphQueryMock: jest.Mock
let rentalsSubgraph: ISubgraphComponent
let rentalsComponent: IRentalsComponent
let rentalListingCreation: RentalListingCreation
let lessor: string
let logs: ILoggerComponent
let config: IConfigComponent
const aDay = 24 * 60 * 60 * 1000

const mockDefaultSubgraphNonces = () => {
  return rentalsSubgraphQueryMock.mockResolvedValueOnce({
    contract: [{ newIndex: 0 }],
    signer: [{ newIndex: 0 }],
    asset: [{ newIndex: 0 }],
  })
}

afterEach(() => {
  jest.resetAllMocks()
})

describe("when creating a rental listing", () => {
  beforeEach(async () => {
    mockedRentalsLogic.verifyRentalsListingSignature.mockResolvedValueOnce(true)
    dbQueryMock = jest.fn()
    dbClientQueryMock = jest.fn()
    dbClientReleaseMock = jest.fn()
    database = createTestDbComponent({
      query: dbQueryMock,
      getPool: jest
        .fn()
        .mockReturnValue({ connect: () => ({ query: dbClientQueryMock, release: dbClientReleaseMock }) }),
    })
    marketplaceSubgraphQueryMock = jest.fn()
    marketplaceSubgraph = createTestSubgraphComponent({ query: marketplaceSubgraphQueryMock })
    rentalsSubgraphQueryMock = jest.fn()
    rentalsSubgraph = createTestSubgraphComponent({ query: rentalsSubgraphQueryMock })
    logs = createTestConsoleLogComponent()
    config = createConfigComponent({ CHAIN_NAME: "Goerli", MAX_CONCURRENT_RENTAL_UPDATES: "5" })
    lessor = "0x705C1a693cB6a63578451D52E182a02Bc8cB2dEB"
    rentalListingCreation = {
      network: Network.ETHEREUM,
      chainId: ChainId.ETHEREUM_GOERLI,
      rentalContractAddress: "0x0",
      contractAddress: "0x0",
      tokenId: "0",
      expiration: Date.now() + 2000000,
      nonces: ["0", "0", "0"],
      periods: [
        {
          pricePerDay: "10000",
          maxDays: 30,
          minDays: 30,
        },
      ],
      signature:
        "0x38fbaabfdf15b5b0ccc66c6eaab45a525fc03ff7590ed28da5894365e4bfee16008e28064a418203b0e3186ff3bce4cccb58b06bac2519b9ca73cdc13ecc3cea1b",
      target: ethers.constants.AddressZero,
    }
    rentalsComponent = await createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs, config })
  })

  describe("and the rental listings has already expired", () => {
    beforeEach(() => {
      rentalListingCreation.expiration = Date.now() - 2000000
    })

    it("should throw a rental already expired error", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new RentalAlreadyExpired(
          rentalListingCreation.contractAddress,
          rentalListingCreation.tokenId,
          rentalListingCreation.expiration
        )
      )
    })
  })

  describe("and the signature is not valid", () => {
    beforeEach(() => {
      mockedRentalsLogic.verifyRentalsListingSignature.mockReset().mockResolvedValueOnce(false)
    })

    describe("and it's not valid due to having a V as 0 or 1", () => {
      beforeEach(() => {
        rentalListingCreation.signature = rentalListingCreation.signature.slice(0, -2) + "00"
      })

      it("should throw an invalid signature error with the reason", () => {
        return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
          new InvalidSignature("The server does not accept ECDSA signatures with V as 0 or 1")
        )
      })
    })

    describe("and it's not valid due to another error", () => {
      it("should throw an invalid signature error", () => {
        return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
          new InvalidSignature()
        )
      })
    })
  })

  describe("and a rental listing already exists in the blockchain", () => {
    beforeEach(() => {
      rentalsSubgraphQueryMock.mockResolvedValueOnce({
        rentals: [
          {
            id: "rentalId",
            contractAddress: "contractAddress",
            tokenId: "aTokenId",
            lessor: "0x0",
            tenant: "0x0",
            operator: "0x0",
            rentalDays: "2",
            startedAt: ((Date.now() - aDay) * 1000).toString(),
            endsAt: ((Date.now() + aDay) * 1000).toString(),
            pricePerDay: "1",
            sender: "0x0",
            isExtension: false,
            ownerHasClaimedAsset: false,
          },
        ],
      })
    })

    it("should throw a rental already exists error", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new RentalAlreadyExists(rentalListingCreation.contractAddress, rentalListingCreation.tokenId)
      )
    })
  })

  describe("and the NFT of the LAND doesn't exist", () => {
    beforeEach(() => {
      rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [] })
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({ nfts: [] })
    })

    it("should throw a NFT not found error", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new NFTNotFound(rentalListingCreation.contractAddress, rentalListingCreation.tokenId)
      )
    })
  })

  describe("and the creator of the rental is not the owner of the LAND", () => {
    let walletAddress: string
    beforeEach(() => {
      walletAddress = "0x705C1a693cB6a63578451D52E182a02Bc8cB2dEB"
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({
        nfts: [
          {
            owner: "0xeE50142b7D76d4d549f2209813eefc11073d874a",
          },
        ],
      })
    })

    describe("and a rental doesn't exist", () => {
      beforeEach(() => {
        rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [] })
      })

      it("should throw an unauthorized to rent error", () => {
        return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
          new UnauthorizedToRent(rentalListingCreation.contractAddress, rentalListingCreation.tokenId)
        )
      })
    })

    describe("and the LAND is not owned through the rental contract", () => {
      beforeEach(() => {
        rentalsSubgraphQueryMock.mockResolvedValueOnce({
          rentals: [
            {
              id: "rentalId",
              contractAddress: "contractAddress",
              tokenId: "aTokenId",
              lessor: "0x0",
              tenant: "0x0",
              operator: "0x0",
              rentalDays: "2",
              startedAt: fromMillisecondsToSeconds(Date.now()).toString(),
              endsAt: fromMillisecondsToSeconds(Date.now()).toString(),
              pricePerDay: "1",
              sender: "0x0",
              rentalContractAddress: walletAddress,
              isExtension: false,
              ownerHasClaimedAsset: false,
            },
          ],
        })
      })

      it("should throw an unauthorized to rent error", () => {
        return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
          new UnauthorizedToRent(rentalListingCreation.contractAddress, rentalListingCreation.tokenId)
        )
      })
    })
  })

  describe("and the land is an Estate of size 0", () => {
    beforeEach(() => {
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({
        nfts: [
          {
            owner: {
              address: lessor,
            },
            category: NFTCategory.ESTATE,
            searchEstateSize: 0,
            contractAddress: rentalListingCreation.contractAddress,
            tokenId: rentalListingCreation.tokenId,
          },
        ],
      })
      rentalsSubgraphQueryMock.mockResolvedValueOnce({
        rentals: [
          {
            id: "rentalId",
            contractAddress: rentalListingCreation.contractAddress,
            tokenId: rentalListingCreation.tokenId,
            lessor,
            tenant: null,
            operator: "0x0",
            rentalDays: "2",
            startedAt: fromMillisecondsToSeconds(Date.now()).toString(),
            endsAt: fromMillisecondsToSeconds(Date.now()).toString(),
            pricePerDay: "1",
            sender: "0x0",
            rentalContractAddress: "0x1",
            isExtension: false,
            ownerHasClaimedAsset: false,
          },
        ],
      })
    })

    it("should throw an invalid estate error", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new InvalidEstate(rentalListingCreation.contractAddress, rentalListingCreation.tokenId)
      )
    })
  })

  describe("and one of the queries to create the rental listing fails with an unknown error", () => {
    beforeEach(() => {
      rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [] })
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({
        nfts: [
          {
            id: "someId",
            category: NFTCategory.PARCEL,
            owner: {
              address: lessor,
            },
            searchText: "someText",
          },
        ],
      })
      dbClientQueryMock.mockRejectedValueOnce(new Error("Database error"))
    })

    it("should throw an error and rollback the query", async () => {
      await expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new Error("Error creating rental")
      )

      expect(dbClientQueryMock).toHaveBeenCalledWith(SQL`ROLLBACK`)
    })
  })

  describe("and one of the queries to create the rental listing fails with an already exists error", () => {
    beforeEach(async () => {
      rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [] })
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({
        nfts: [
          {
            id: "someId",
            category: NFTCategory.PARCEL,
            owner: {
              address: lessor,
            },
            searchText: "someText",
          },
        ],
      })
      dbClientQueryMock.mockRejectedValueOnce({ constraint: "rentals_token_id_contract_address_status_unique_index" })
    })

    it("should throw an error and rollback the query", async () => {
      await expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new RentalAlreadyExists(rentalListingCreation.contractAddress, rentalListingCreation.tokenId)
      )

      expect(dbClientQueryMock).toHaveBeenCalledWith(SQL`ROLLBACK`)
    })
  })

  describe("and the creation of the rental listing is successful", () => {
    let expiration: Date
    let created_at: Date
    let rentalId: string

    beforeEach(() => {
      expiration = new Date()
      rentalId = "rentalId"
      rentalsSubgraphQueryMock.mockResolvedValueOnce({
        rentals: [
          {
            id: "blockchainRentalId",
            contractAddress: "contractAddress",
            tokenId: "aTokenId",
            lessor: "0x0",
            tenant: "0x0",
            operator: "0x0",
            rentalDays: "2",
            startedAt: fromMillisecondsToSeconds(Date.now()).toString(),
            endsAt: fromMillisecondsToSeconds(Date.now()).toString(),
            pricePerDay: "1",
            sender: "0x0",
            ownerHasClaimedAsset: false,
          },
        ],
      })
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({
        nfts: [
          {
            id: "someNftId",
            category: NFTCategory.PARCEL,
            owner: {
              address: lessor,
            },
            searchText: "someText",
            created_at,
          },
        ],
      })
      dbClientQueryMock
        // Begin
        .mockResolvedValueOnce(undefined)
        // Metadata insert
        .mockResolvedValueOnce({
          rows: [
            {
              id: "ids",
              category: NFTCategory.PARCEL,
              search_text: "aSearchText",
              created_at,
            },
          ],
        })
        // Rental insert
        .mockResolvedValueOnce({
          rows: [
            {
              id: rentalId,
              metadata_id: "someNftId",
              network: rentalListingCreation.network,
              chain_id: rentalListingCreation.chainId,
              expiration,
              signature: rentalListingCreation.signature,
              nonces: rentalListingCreation.nonces,
              token_id: rentalListingCreation.tokenId,
              contract_address: rentalListingCreation.contractAddress,
              rental_contract_address: rentalListingCreation.rentalContractAddress,
              status: RentalStatus.OPEN,
            },
          ],
        })
        // Rental listing
        .mockResolvedValueOnce({
          rows: [
            {
              id: rentalId,
              lessor,
              tenant: null,
            },
          ],
        })
        // Periods
        .mockResolvedValueOnce({
          rows: [
            {
              id: "aPeriodId",
              rental_id: rentalId,
              min_days: rentalListingCreation.periods[0].minDays,
              max_days: rentalListingCreation.periods[0].maxDays,
              price_per_day: rentalListingCreation.periods[0].pricePerDay,
            },
          ],
        })
        // Commit
        .mockResolvedValueOnce(undefined)
    })

    it("should return the created rental", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).resolves.toEqual({
        id: rentalId,
        lessor,
        tenant: null,
        metadata_id: "someNftId",
        category: NFTCategory.PARCEL,
        search_text: "aSearchText",
        periods: [
          {
            id: "aPeriodId",
            rental_id: rentalId,
            min_days: rentalListingCreation.periods[0].minDays,
            max_days: rentalListingCreation.periods[0].maxDays,
            price_per_day: rentalListingCreation.periods[0].pricePerDay,
          },
        ],
        network: rentalListingCreation.network,
        chain_id: rentalListingCreation.chainId,
        expiration,
        signature: rentalListingCreation.signature,
        nonces: rentalListingCreation.nonces,
        token_id: rentalListingCreation.tokenId,
        contract_address: rentalListingCreation.contractAddress,
        rental_contract_address: rentalListingCreation.rentalContractAddress,
        status: RentalStatus.OPEN,
      })
    })
  })
})

describe("when getting rental listings", () => {
  let dbGetRentalListings: DBGetRentalListing[]

  beforeEach(async () => {
    dbQueryMock = jest.fn()
    database = createTestDbComponent({ query: dbQueryMock })
    marketplaceSubgraphQueryMock = jest.fn()
    marketplaceSubgraph = createTestSubgraphComponent({ query: marketplaceSubgraphQueryMock })
    rentalsSubgraphQueryMock = jest.fn()
    rentalsSubgraph = createTestSubgraphComponent({ query: rentalsSubgraphQueryMock })
    logs = createTestConsoleLogComponent()
    config = createConfigComponent({ CHAIN_NAME: "Goerli", MAX_CONCURRENT_RENTAL_UPDATES: "5" })
    rentalsComponent = await createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs, config })
  })

  describe("and the query throws an error", () => {
    const errorMessage = "Something went wrong while querying the database"
    beforeEach(() => {
      dbQueryMock.mockRejectedValueOnce(new Error("Something went wrong while querying the database"))
    })

    it("should propagate the error", () => {
      expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: null,
        })
      ).rejects.toThrowError(errorMessage)
    })
  })

  describe("and the minPricePerDay filter is set", () => {
    let minPricePerDay: string
    beforeEach(() => {
      minPricePerDay = "10000000"
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the min price condition", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            minPricePerDay,
          },
        })
      ).resolves.toEqual(dbGetRentalListings)
      expect(dbQueryMock.mock.calls[0][0].text).toEqual(
        expect.stringContaining(`HAVING max(periods.price_per_day) >= $1`)
      )
      expect(dbQueryMock.mock.calls[0][0].values).toEqual([minPricePerDay, 10, 0])
    })
  })

  describe("and the maxPricePerDay filter is set", () => {
    let maxPricePerDay: string
    beforeEach(() => {
      maxPricePerDay = "10000000"
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the max price condition", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            maxPricePerDay,
          },
        })
      ).resolves.toEqual(dbGetRentalListings)
      expect(dbQueryMock.mock.calls[0][0].text).toEqual(
        expect.stringContaining(`HAVING min(periods.price_per_day) <= $1`)
      )
      expect(dbQueryMock.mock.calls[0][0].values).toEqual([maxPricePerDay, 10, 0])
    })
  })

  describe("and the category filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the category condition", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            category: RentalsListingsFilterByCategory.PARCEL,
          },
        })
      ).resolves.toEqual(dbGetRentalListings)
      expect(dbQueryMock.mock.calls[0][0].text).toEqual(expect.stringContaining("AND metadata.category = $1"))
      expect(dbQueryMock.mock.calls[0][0].values).toEqual(["parcel", 10, 0])
    })
  })

  describe("and the status filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    describe("and there is only one status to filter by", () => {
      it("should have made the query to get the listings with the status condition", async () => {
        await expect(
          rentalsComponent.getRentalsListings({
            offset: 0,
            limit: 10,
            sortBy: null,
            sortDirection: null,
            filterBy: {
              status: [RentalStatus.EXECUTED],
            },
          })
        ).resolves.toEqual(dbGetRentalListings)

        expect(dbQueryMock.mock.calls[0][0].text).toEqual(expect.stringContaining("AND rentals.status = ANY($1)"))
        expect(dbQueryMock.mock.calls[0][0].values).toEqual([[RentalStatus.EXECUTED], 10, 0])
      })
    })

    describe("and there are multiple statuses to filter by", () => {
      it("should have made the query to get the listings with the multiple statuses condition", async () => {
        await expect(
          rentalsComponent.getRentalsListings({
            offset: 0,
            limit: 10,
            sortBy: null,
            sortDirection: null,
            filterBy: {
              status: [RentalStatus.EXECUTED, RentalStatus.CLAIMED],
            },
          })
        ).resolves.toEqual(dbGetRentalListings)

        expect(dbQueryMock.mock.calls[0][0].text).toEqual(expect.stringContaining("AND rentals.status = ANY($1)"))
        expect(dbQueryMock.mock.calls[0][0].values).toEqual([[RentalStatus.EXECUTED, RentalStatus.CLAIMED], 10, 0])
      })
    })
  })

  describe("and the lessor filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the lessor condition", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            lessor: "0x0",
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock.mock.calls[0][0].text).toEqual(expect.stringContaining("AND rentals_listings.lessor = $1"))
      expect(dbQueryMock.mock.calls[0][0].values).toEqual(["0x0", 10, 0])
    })
  })

  describe("and the tenant filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the tenant condition", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            tenant: "0x0",
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock.mock.calls[0][0].text).toEqual(expect.stringContaining("AND rentals_listings.tenant = $1"))
      expect(dbQueryMock.mock.calls[0][0].values).toEqual(["0x0", 10, 0])
    })
  })

  describe("and the text filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the text condition", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            text: "someText",
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock.mock.calls[0][0].text).toEqual(
        expect.stringContaining("AND metadata.search_text ILIKE '%' || ")
      )
      expect(dbQueryMock.mock.calls[0][0].values).toEqual(["someText", 10, 0])
    })
  })

  describe("and the tokenId filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the tokenId condition", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            tokenId: "aTokenId",
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("AND rentals.token_id = ")]),
          values: ["aTokenId", 10, 0],
        })
      )
    })
  })

  describe("and the contract addresses filter is set", () => {
    let contractAddresses: string[]
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    describe("and the filter is set with an empty array of addresses", () => {
      beforeEach(() => {
        contractAddresses = []
      })

      it("should not have made the query to get the listings with the contract addresses condition", async () => {
        await expect(
          rentalsComponent.getRentalsListings({
            offset: 0,
            limit: 10,
            sortBy: null,
            sortDirection: null,
            filterBy: {
              contractAddresses,
            },
          })
        ).resolves.toEqual(dbGetRentalListings)

        expect(dbQueryMock).not.toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining("AND rentals.contract_address = ANY(")]),
          })
        )
      })
    })

    describe("and the filter is set with addresses", () => {
      beforeEach(() => {
        contractAddresses = ["aContractAddress", "anotherContractAddress"]
      })

      it("should have made the query to get the listings with the contract addresses condition", async () => {
        await expect(
          rentalsComponent.getRentalsListings({
            offset: 0,
            limit: 10,
            sortBy: null,
            sortDirection: null,
            filterBy: {
              contractAddresses: ["aContractAddress", "anotherContractAddress"],
            },
          })
        ).resolves.toEqual(dbGetRentalListings)

        expect(dbQueryMock).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining("AND rentals.contract_address = ANY(")]),
            values: [["aContractAddress", "anotherContractAddress"], 10, 0],
          })
        )
      })
    })
  })

  describe("and the network filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the network condition", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            network: Network.ETHEREUM,
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("AND rentals.network = ")]),
          values: [Network.ETHEREUM, 10, 0],
        })
      )
    })
  })

  describe("and there are no filters to query for", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should not include any filters in the query", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: null,
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock.mock.calls[0][0].text).not.toEqual(expect.stringContaining("AND rentals_listings.lessor = "))
      expect(dbQueryMock.mock.calls[0][0].text).not.toEqual(expect.stringContaining("AND rentals_listings.tenant = "))
      expect(dbQueryMock.mock.calls[0][0].text).not.toEqual(expect.stringContaining("AND rentals.status = "))
      expect(dbQueryMock.mock.calls[0][0].text).not.toEqual(expect.stringContaining("AND rentals.target = "))
      expect(dbQueryMock.mock.calls[0][0].text).not.toEqual(expect.stringContaining("AND rentals.updated_at > "))
      expect(dbQueryMock.mock.calls[0][0].text).not.toEqual(expect.stringContaining("AND rentals_listings.lessor = "))
      expect(dbQueryMock.mock.calls[0][0].text).not.toEqual(expect.stringContaining("AND metadata.search_text ILIKE %"))
    })
  })

  describe("and there's no order nor order direction specified", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should include the default order and order direction in the query", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: null,
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock.mock.calls[0][0].text).toEqual(expect.stringContaining("ORDER BY rentals.created_at asc"))
    })
  })

  describe("and there's no order specified but there's order direction", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should include the default order and the specified order direction in the query", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: RentalsListingSortDirection.DESC,
          filterBy: null,
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock.mock.calls[0][0].text).toEqual(expect.stringContaining("ORDER BY rentals.created_at desc"))
    })
  })

  describe("and the order is set to name", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should include the search by text order in the query", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: RentalsListingsSortBy.NAME,
          sortDirection: null,
          filterBy: null,
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock.mock.calls[0][0].text).toEqual(expect.stringContaining("ORDER BY metadata.search_text asc"))
    })
  })

  describe("and the order is set to the rental listing creation date", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should include the created_at order in the query", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: RentalsListingsSortBy.RENTAL_LISTING_DATE,
          sortDirection: null,
          filterBy: null,
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock.mock.calls[0][0].text).toEqual(expect.stringContaining("ORDER BY rentals.created_at asc"))
    })
  })

  describe("and the order is set to the max rental listing price", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should include the max_price_per_day order in the query", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: RentalsListingsSortBy.MAX_RENTAL_PRICE,
          sortDirection: null,
          filterBy: null,
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock.mock.calls[0][0].text).toEqual(
        expect.stringContaining("ORDER BY rentals.max_price_per_day asc")
      )
    })
  })

  describe("and the order is set to the min rental listing price", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should include the min_price_per_day order in the query", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: RentalsListingsSortBy.MIN_RENTAL_PRICE,
          sortDirection: null,
          filterBy: null,
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock.mock.calls[0][0].text).toEqual(
        expect.stringContaining("ORDER BY rentals.min_price_per_day asc")
      )
    })
  })

  describe("and the target filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the target condition", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            target: "0x0",
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("AND rentals.target = ")]),
          values: ["0x0", 10, 0],
        })
      )
    })
  })

  describe("and the updated after filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the updated after", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            updatedAfter: 1000000,
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("AND rentals.updated_at > ")]),
          values: [new Date(1000000), 10, 0],
        })
      )
    })
  })

  describe("and the minDistanceToPlaza filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the correct distance to a plaza", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            minDistanceToPlaza: 10,
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("AND metadata.distance_to_plaza >= ")]),
          values: [10, 10, 0],
        })
      )
    })
  })

  describe("and the maxDistanceToPlaza filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the correct distance to a plaza", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            maxDistanceToPlaza: 10,
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("AND metadata.distance_to_plaza <= ")]),
          values: [10, 10, 0],
        })
      )
    })
  })

  describe("and the minEstateSize filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    describe("and minEstateSize is more or equal to 0", () => {
      it("should have made the query to get the listings with the correct estate size", async () => {
        await expect(
          rentalsComponent.getRentalsListings({
            offset: 0,
            limit: 10,
            sortBy: null,
            sortDirection: null,
            filterBy: {
              minEstateSize: 10,
            },
          })
        ).resolves.toEqual(dbGetRentalListings)

        expect(dbQueryMock).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining("AND metadata.estate_size >= ")]),
            values: [10, 10, 0],
          })
        )
      })
    })

    describe("and minEstateSize is less than 0", () => {
      it("should not set minEstateSize filter in listings query", async () => {
        await expect(
          rentalsComponent.getRentalsListings({
            offset: 0,
            limit: 10,
            sortBy: null,
            sortDirection: null,
            filterBy: {
              minEstateSize: -1,
            },
          })
        ).resolves.toEqual(dbGetRentalListings)

        expect(dbQueryMock).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.not.stringContaining("AND metadata.estate_size >= ")]),
            values: [10, 0],
          })
        )
      })
    })
  })

  describe("and the maxEstateSize filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the correct estate size", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            maxEstateSize: 10,
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("AND metadata.estate_size <= ")]),
          values: [10, 10, 0],
        })
      )
    })
  })

  describe("and the adjacentToRoad filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should have made the query to get the listings with the adjacentToRoad as true", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            adjacentToRoad: true,
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("AND metadata.adjacent_to_road = ")]),
          values: [true, 10, 0],
        })
      )
    })

    it("should have made the query to get the listings with the adjacentToRoad as false", async () => {
      await expect(
        rentalsComponent.getRentalsListings({
          offset: 0,
          limit: 10,
          sortBy: null,
          sortDirection: null,
          filterBy: {
            adjacentToRoad: false,
          },
        })
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("AND metadata.adjacent_to_road = ")]),
          values: [false, 10, 0],
        })
      )
    })
  })

  describe("and getHistoricData flag is on", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should only retrieve one rental for each nft (metadata_id)", async () => {
      await expect(
        rentalsComponent.getRentalsListings(
          {
            offset: 0,
            limit: 10,
            sortBy: null,
            sortDirection: null,
            filterBy: {},
          },
          true
        )
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.not.stringContaining("DISTINCT ON (rentals.metadata_id)")]),
          values: [10, 0],
        })
      )
    })
  })

  describe("and getHistoricData flag is off", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    it("should only retrieve one rental for each nft (metadata_id)", async () => {
      await expect(
        rentalsComponent.getRentalsListings(
          {
            offset: 0,
            limit: 10,
            sortBy: null,
            sortDirection: null,
            filterBy: {},
          },
          false
        )
      ).resolves.toEqual(dbGetRentalListings)

      expect(dbQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("DISTINCT ON (rentals.metadata_id)")]),
          values: [10, 0],
        })
      )
    })
  })

  describe("and the rentalDays filter is set", () => {
    beforeEach(() => {
      dbGetRentalListings = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListings })
    })

    describe("when there is only one day", () => {
      it("should join rental days select", async () => {
        await expect(
          rentalsComponent.getRentalsListings(
            {
              offset: 0,
              limit: 10,
              sortBy: null,
              sortDirection: null,
              filterBy: { rentalDays: [1] },
            },
            false
          )
        ).resolves.toEqual(dbGetRentalListings)

        expect(dbQueryMock).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([
              expect.stringContaining("SELECT DISTINCT rental_id FROM periods WHERE (min_days <= "),
              expect.stringContaining("AND max_days >= "),
              expect.stringContaining("AND rental_days_periods.rental_id = rentals.id"),
            ]),
            values: [1, 1, 10, 0],
          })
        )
      })
    })

    describe("when there is more than one day", () => {
      it("should join rental days select", async () => {
        await expect(
          rentalsComponent.getRentalsListings(
            {
              offset: 0,
              limit: 10,
              sortBy: null,
              sortDirection: null,
              filterBy: { rentalDays: [1, 7] },
            },
            false
          )
        ).resolves.toEqual(dbGetRentalListings)

        expect(dbQueryMock).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([
              expect.stringContaining("SELECT DISTINCT rental_id FROM periods WHERE (min_days <= "),
              expect.stringContaining("AND max_days >= "),
              expect.stringContaining("OR (min_days <= "),
              expect.stringContaining("AND max_days >= "),
              expect.stringContaining("AND rental_days_periods.rental_id = rentals.id"),
            ]),
            values: [1, 1, 7, 7, 10, 0],
          })
        )
      })
    })
  })
})

describe("when refreshing rental listings", () => {
  let rentalFromDb: {
    id: string
    contract_address: string
    token_id: string
    updated_at: Date
    metadata_updated_at: Date
    metadata_id: string
    signature: string
    nonces: string[]
    status: RentalStatus
    lessor: string
  }
  let nftFromIndexer: NFT
  let rentalFromIndexer: IndexerRental
  let result: DBGetRentalListing

  beforeEach(async () => {
    dbQueryMock = jest.fn()
    database = createTestDbComponent({ query: dbQueryMock })
    marketplaceSubgraphQueryMock = jest.fn()
    marketplaceSubgraph = createTestSubgraphComponent({ query: marketplaceSubgraphQueryMock })
    rentalsSubgraphQueryMock = jest.fn()
    rentalsSubgraph = createTestSubgraphComponent({ query: rentalsSubgraphQueryMock })
    logs = createTestConsoleLogComponent()
    config = createConfigComponent({ CHAIN_NAME: "Goerli", MAX_CONCURRENT_RENTAL_UPDATES: "5" })
    rentalsComponent = await createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs, config })
    rentalFromDb = {
      id: "an id",
      lessor: "anAddress",
      contract_address: "aContractAddress",
      token_id: "aTokenId",
      updated_at: new Date(Math.round(Date.now() / 1000) * 1000),
      metadata_updated_at: new Date(Math.round(Date.now() / 1000) * 1000),
      metadata_id: "metadataId",
      signature:
        "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf51b",
      nonces: ["0", "0", "0"],
      status: RentalStatus.OPEN,
    }
    nftFromIndexer = {
      id: rentalFromDb.metadata_id,
      category: NFTCategory.PARCEL,
      contractAddress: rentalFromDb.contract_address,
      tokenId: rentalFromDb.token_id,
      owner: {
        address: "anAddress",
      },
      searchText: "aSearchText",
      searchEstateSize: null,
      searchIsLand: true,
      searchAdjacentToRoad: true,
      searchDistanceToPlaza: 3,
      createdAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
      updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
    }
    rentalFromIndexer = {
      id: "aRentalId",
      contractAddress: rentalFromDb.contract_address,
      tokenId: rentalFromDb.token_id,
      lessor: "aLessor",
      tenant: "aTenant",
      operator: "aLessor",
      rentalDays: "20",
      startedAt: Math.round(rentalFromDb.updated_at.getTime() / 1000).toString(),
      endsAt: Math.round(rentalFromDb.updated_at.getTime() / 1000 + 100000000).toString(),
      updatedAt: Math.round(rentalFromDb.updated_at.getTime() / 1000).toString(),
      pricePerDay: "23423423423",
      sender: "aLessor",
      ownerHasClaimedAsset: false,
      rentalContractAddress: "aRentalContractAddress",
      isExtension: false,
      signature: rentalFromDb.signature,
    }
    result = {
      id: "resultantRental",
    } as DBGetRentalListing
  })

  describe("and there's no rental with the given id in the database", () => {
    beforeEach(() => {
      dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    })

    it("should reject with a rental not found error", () => {
      return expect(rentalsComponent.refreshRentalListing("id")).rejects.toEqual(new RentalNotFound("id"))
    })
  })

  describe("and there's no NFT for the given rental", () => {
    beforeEach(() => {
      dbQueryMock.mockResolvedValueOnce({
        rows: [rentalFromDb],
        rowCount: 1,
      })
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({ nfts: [] })
      rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [] })
    })

    it("should reject with an nft not found error", () => {
      return expect(rentalsComponent.refreshRentalListing("an id")).rejects.toEqual(
        new NFTNotFound("aContractAddress", "aTokenId")
      )
    })
  })

  describe("and there's an NFT for the given result", () => {
    beforeEach(() => {
      dbQueryMock.mockResolvedValueOnce({
        rows: [rentalFromDb],
        rowCount: 1,
      })
      rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [] })
    })

    describe("and it was updated before the one in the database", () => {
      beforeEach(() => {
        marketplaceSubgraphQueryMock.mockResolvedValueOnce({
          nfts: [
            {
              ...nftFromIndexer,
              createdAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
              updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
            },
          ],
        })
        mockDefaultSubgraphNonces()
        dbQueryMock.mockResolvedValueOnce({
          rows: [result],
          rowCount: 1,
        })
      })

      it("should not update the metadata in the database and return the rental", async () => {
        await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
        expect(dbQueryMock.mock.calls[1][0].text).not.toEqual(expect.stringContaining("UPDATE metadata SET"))
      })

      describe("and the forceRefreshMetadata is set to true", () => {
        beforeEach(() => {
          marketplaceSubgraphQueryMock.mockResolvedValueOnce({
            nfts: [
              {
                ...nftFromIndexer,
                createdAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
                updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
              },
            ],
          })
          mockDefaultSubgraphNonces()
          dbQueryMock.mockResolvedValueOnce({
            rows: [result],
            rowCount: 1,
          })
        })

        it("should update the metadata in the database and return the rental", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id", true)).resolves.toEqual(result)
          expect(dbQueryMock.mock.calls[1][0].text).toEqual(expect.stringContaining("UPDATE metadata SET"))
        })
      })
    })

    describe("and it was updated at the same time than the one in the database", () => {
      beforeEach(() => {
        marketplaceSubgraphQueryMock.mockResolvedValueOnce({
          nfts: [
            {
              ...nftFromIndexer,
              createdAt: Math.round(rentalFromDb.updated_at.getTime() / 1000).toString(),
              updatedAt: Math.round(rentalFromDb.updated_at.getTime() / 1000).toString(),
            },
          ],
        })
        mockDefaultSubgraphNonces()
        dbQueryMock.mockResolvedValueOnce({
          rows: [result],
          rowCount: 1,
        })
      })

      it("should not update the metadata in the database and return the rental", async () => {
        await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
        expect(dbQueryMock).toHaveBeenCalledWith(
          expect.objectContaining({ text: expect.not.stringContaining("UPDATE metadata SET") })
        )
      })
    })

    describe("and it was updated after the one in the database", () => {
      describe("and the owner has not changed", () => {
        beforeEach(() => {
          marketplaceSubgraphQueryMock.mockResolvedValueOnce({
            nfts: [
              {
                ...nftFromIndexer,
                createdAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
                updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
              },
            ],
          })
          mockDefaultSubgraphNonces()
          dbQueryMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
            rows: [result],
            rowCount: 1,
          })
        })
        it("should update the metadata in the database and return the rental", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock.mock.calls[1][0].text).toEqual(expect.stringContaining("UPDATE metadata SET"))
        })
      })

      describe("and the owner has changed", () => {
        beforeEach(() => {
          marketplaceSubgraphQueryMock.mockResolvedValueOnce({
            nfts: [
              {
                ...nftFromIndexer,
                owner: {
                  address: "aNewOwner",
                },
                createdAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
                updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
              },
            ],
          })
          mockDefaultSubgraphNonces()
          dbQueryMock
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({
              rows: [result],
              rowCount: 1,
            })
        })
        it("should cancel the listing and return it updated", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock.mock.calls[2][0].text).toEqual(expect.stringContaining(`UPDATE rentals SET status`))
          expect(dbQueryMock.mock.calls[2][0].values).toEqual(expect.arrayContaining([RentalStatus.CANCELLED]))
        })
      })

      describe("and the Estate has been dissolved", () => {
        beforeEach(() => {
          marketplaceSubgraphQueryMock.mockResolvedValueOnce({
            nfts: [
              {
                ...nftFromIndexer,
                category: NFTCategory.ESTATE,
                searchEstateSize: 0,
                createdAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
                updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
              },
            ],
          })
          mockDefaultSubgraphNonces()
          dbQueryMock
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({
              rows: [result],
              rowCount: 1,
            })
        })
        it("should cancel the listing and return it updated", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              text: expect.stringContaining(`UPDATE rentals SET status`),
              values: expect.arrayContaining([RentalStatus.CANCELLED]),
            })
          )
        })
      })
    })
  })

  describe("and there's no rental in the blockchain for the signature", () => {
    beforeEach(() => {
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({
        nfts: [
          {
            ...nftFromIndexer,
            createdAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
            updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
          },
        ],
      })
      rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [] })
      mockDefaultSubgraphNonces()
    })

    describe("and the signature has a V of value 27 or 28", () => {
      beforeEach(() => {
        dbQueryMock
          .mockResolvedValueOnce({
            rows: [rentalFromDb],
            rowCount: 1,
          })
          .mockResolvedValueOnce({
            rows: [result],
            rowCount: 1,
          })
      })

      it("should not update the database entry for the rental and return the rental unchanged", async () => {
        await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
        expect(dbQueryMock.mock.calls[1][0].text).not.toEqual(expect.stringContaining("UPDATE rentals SET"))
        expect(dbQueryMock.mock.calls[1][0].text).not.toEqual(expect.stringContaining("UPDATE rentals_listings SET"))
      })
    })

    describe("and the signature does not have a V of value 27 or 28", () => {
      beforeEach(() => {
        rentalFromDb.signature =
          "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf500"
      })

      describe("and the rental is open", () => {
        beforeEach(() => {
          rentalFromDb.status = RentalStatus.OPEN
          dbQueryMock
            .mockResolvedValueOnce({
              rows: [rentalFromDb],
              rowCount: 1,
            })
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({
              rows: [result],
              rowCount: 1,
            })
        })

        it("should update the rental signature and return the updated rental", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({ strings: expect.arrayContaining(["UPDATE rentals SET signature = "]) })
          )
        })
      })

      describe("and the rental is not open", () => {
        beforeEach(() => {
          rentalFromDb.status = RentalStatus.EXECUTED
          dbQueryMock
            .mockResolvedValueOnce({
              rows: [rentalFromDb],
              rowCount: 1,
            })
            .mockResolvedValueOnce({
              rows: [result],
              rowCount: 1,
            })
        })

        it("should not update the database entry for the rental and return the rental unchanged", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock.mock.calls[1][0].text).not.toEqual(expect.stringContaining("UPDATE rentals SET"))
          expect(dbQueryMock.mock.calls[1][0].text).not.toEqual(expect.stringContaining("UPDATE rentals_listings SET"))
        })
      })
    })
  })

  describe("and there's a rental in the blockchain for the signature", () => {
    beforeEach(() => {
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({
        nfts: [
          {
            ...nftFromIndexer,
            createdAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
            updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
          },
        ],
      })
      dbQueryMock.mockResolvedValueOnce({
        rows: [rentalFromDb],
        rowCount: 1,
      })
    })

    describe("and the rental has been invalidated by a nonce bump", () => {
      beforeEach(() => {
        rentalsSubgraphQueryMock.mockResolvedValueOnce({
          rentals: [rentalFromIndexer],
        })
        dbQueryMock.mockResolvedValueOnce({
          rows: [result],
          rowCount: 1,
        })
        dbQueryMock.mockResolvedValueOnce({
          rows: [result],
          rowCount: 1,
        })
      })

      describe("and the index bump was of type contract", () => {
        beforeEach(() => {
          rentalsSubgraphQueryMock.mockResolvedValueOnce({
            contract: [{ newIndex: 1 }],
            signer: [],
            asset: [],
          })
        })
        it("should update the rental listing with status cancelled", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock.mock.calls[1][0].text).toEqual(expect.stringContaining("UPDATE rentals SET"))
          expect(dbQueryMock.mock.calls[1][0].values[1]).toEqual(RentalStatus.CANCELLED)
        })
      })

      describe("and the index bump was of type signer", () => {
        beforeEach(() => {
          rentalsSubgraphQueryMock.mockResolvedValueOnce({
            contract: [],
            signer: [{ newIndex: 1 }],
            asset: [],
          })
        })
        it("should update the rental listing with status cancelled", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock.mock.calls[1][0].text).toEqual(expect.stringContaining("UPDATE rentals SET"))
          expect(dbQueryMock.mock.calls[1][0].values[1]).toEqual(RentalStatus.CANCELLED)
        })
      })
      describe("and the index bump was of type asset", () => {
        describe("and it was due to a RENT action", () => {
          beforeEach(() => {
            rentalsSubgraphQueryMock.mockResolvedValueOnce({
              contract: [],
              signer: [],
              asset: [{ newIndex: 1, type: IndexUpdateEventType.RENT }],
            })
          })
          it("should not update the rental listing with status cancelled", async () => {
            await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
            expect(dbQueryMock.mock.calls[1][0].text).not.toEqual(expect.stringContaining("UPDATE rentals SET"))
            expect(dbQueryMock.mock.calls[1][0].values[1]).not.toEqual(RentalStatus.CANCELLED)
          })
        })
        describe("and it was due to a CANCEL action", () => {
          beforeEach(() => {
            rentalsSubgraphQueryMock.mockResolvedValueOnce({
              contract: [],
              signer: [],
              asset: [{ newIndex: 1, type: IndexUpdateEventType.CANCEL }],
            })
          })
          it("should update the rental listing with status cancelled", async () => {
            await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
            expect(dbQueryMock.mock.calls[1][0].text).toEqual(expect.stringContaining("UPDATE rentals SET"))
            expect(dbQueryMock.mock.calls[1][0].values[1]).toEqual(RentalStatus.CANCELLED)
          })
        })
      })
    })

    describe("and the rental signed index was not bumped", () => {
      describe("and the rental is older than the one in the database", () => {
        beforeEach(() => {
          rentalsSubgraphQueryMock.mockResolvedValueOnce({
            rentals: [
              {
                ...rentalFromIndexer,
                updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) - 10000).toString(),
              },
            ],
          })
          mockDefaultSubgraphNonces()
          dbQueryMock.mockResolvedValueOnce({
            rows: [result],
            rowCount: 1,
          })
        })

        it("should not update the database entry for the rental and return the rental unchanged", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock.mock.calls[1][0].text).not.toEqual(expect.stringContaining("UPDATE rentals SET"))
          expect(dbQueryMock.mock.calls[1][0].text).not.toEqual(expect.stringContaining("UPDATE rentals_listings SET"))
        })
      })

      describe("and the rental has the same date as the one in the database", () => {
        beforeEach(() => {
          rentalsSubgraphQueryMock.mockResolvedValueOnce({
            rentals: [
              {
                ...rentalFromIndexer,
                updatedAt: Math.round(rentalFromDb.updated_at.getTime() / 1000).toString(),
              },
            ],
          })
          mockDefaultSubgraphNonces()
          dbQueryMock.mockResolvedValueOnce({
            rows: [result],
            rowCount: 1,
          })
        })

        it("should not update the database entry for the rental and return the rental unchanged", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock.mock.calls[1][0].text).not.toEqual(expect.stringContaining("UPDATE rentals SET"))
          expect(dbQueryMock.mock.calls[1][0].text).not.toEqual(expect.stringContaining("UPDATE rentals_listings SET"))
        })
      })

      describe("and the rental is newer than the one in the database", () => {
        beforeEach(() => {
          rentalsSubgraphQueryMock.mockResolvedValueOnce({
            rentals: [
              {
                ...rentalFromIndexer,
                updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
              },
            ],
          })
          mockDefaultSubgraphNonces()
          dbQueryMock
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({
              rows: [result],
              rowCount: 1,
            })
        })

        it("should update the database entry for the rental and return the rental", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock.mock.calls[1][0].text).toEqual(expect.stringContaining("UPDATE rentals SET"))
          expect(dbQueryMock.mock.calls[2][0].text).toEqual(expect.stringContaining("UPDATE rentals_listings SET"))
        })
      })
    })

    describe("and the LAND has been claimed by the owner", () => {
      beforeEach(() => {
        rentalsSubgraphQueryMock.mockResolvedValueOnce({
          rentals: [
            {
              ...rentalFromIndexer,
              ownerHasClaimedAsset: true,
              updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
            },
          ],
        })
        mockDefaultSubgraphNonces()
        dbQueryMock
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            rows: [{ result, status: RentalStatus.CLAIMED }],
            rowCount: 1,
          })
      })

      it("should update the database entry for the rental with the status changed to CLAIMED and return the rental", async () => {
        await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual({
          result,
          status: RentalStatus.CLAIMED,
        })
        expect(dbQueryMock.mock.calls[1][0].text).toEqual(expect.stringContaining("UPDATE rentals SET"))
        expect(dbQueryMock.mock.calls[1][0].values).toContainEqual(RentalStatus.CLAIMED)
      })
    })

    describe("and the LAND has not been claimed by the owner", () => {
      beforeEach(() => {
        rentalsSubgraphQueryMock.mockResolvedValueOnce({
          rentals: [
            {
              ...rentalFromIndexer,
              ownerHasClaimedAsset: false,
              updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
            },
          ],
        })
        mockDefaultSubgraphNonces()
        dbQueryMock
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            rows: [{ result, status: RentalStatus.EXECUTED }],
            rowCount: 1,
          })
      })

      it("should update the database entry for the rental with the status changed to EXECUTED and return the rental", async () => {
        await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual({
          result,
          status: RentalStatus.EXECUTED,
        })
        expect(dbQueryMock.mock.calls[1][0].text).toEqual(expect.stringContaining("UPDATE rentals SET"))
        expect(dbQueryMock.mock.calls[1][0].values).toContainEqual(RentalStatus.EXECUTED)
      })
    })

    describe("and the signature in the DB has a V with value 0 or 1", () => {
      let newSignature: string

      beforeEach(async () => {
        rentalFromDb.signature =
          "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf501"
        newSignature =
          "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf51c"
        rentalsSubgraphQueryMock.mockResolvedValueOnce({
          rentals: [
            {
              ...rentalFromIndexer,
              signature: newSignature,
              ownerHasClaimedAsset: false,
              updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
            },
          ],
        })
        mockDefaultSubgraphNonces()
        dbQueryMock
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce(undefined)
          .mockResolvedValueOnce({
            rows: [{ result, status: RentalStatus.EXECUTED }],
            rowCount: 1,
          })

        await rentalsComponent.refreshRentalListing("an id")
      })

      it("should update the database entry for the rental with the a signature with a valid V", () => {
        expect(dbQueryMock).toHaveBeenCalledWith(
          expect.objectContaining({
            text: expect.stringContaining("UPDATE rentals SET"),
            values: expect.arrayContaining([newSignature]),
          })
        )
      })

      it("should have queried the graph with a signature based on the original that contains a valid V", () => {
        expect(rentalsSubgraphQueryMock).toHaveBeenCalledWith(expect.anything(), { signature: newSignature })
      })
    })
  })
})

describe("when updating the metadata", () => {
  let nftFromIndexer: NFT
  let startDate: Date

  beforeEach(async () => {
    startDate = new Date()
    dbQueryMock = jest.fn()
    dbClientQueryMock = jest.fn()
    dbClientReleaseMock = jest.fn()
    database = createTestDbComponent({
      query: dbQueryMock,
      getPool: jest
        .fn()
        .mockReturnValue({ connect: () => ({ query: dbClientQueryMock, release: dbClientReleaseMock }) }),
    })
    marketplaceSubgraphQueryMock = jest.fn()
    marketplaceSubgraph = createTestSubgraphComponent({ query: marketplaceSubgraphQueryMock })
    rentalsSubgraphQueryMock = jest.fn()
    rentalsSubgraph = createTestSubgraphComponent({ query: rentalsSubgraphQueryMock })
    logs = createTestConsoleLogComponent()
    config = createConfigComponent({ CHAIN_NAME: "Goerli", MAX_CONCURRENT_RENTAL_UPDATES: "5" })
    lessor = "0x705C1a693cB6a63578451D52E182a02Bc8cB2dEB"
    rentalsComponent = await createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs, config })
    dbQueryMock.mockResolvedValueOnce({ rows: [{ updated_at: new Date() }] })
    dbClientQueryMock.mockResolvedValueOnce(undefined)
    jest.spyOn(Date, "now").mockReturnValueOnce(startDate.getTime())
  })

  describe("and there are no updated NFTs", () => {
    beforeEach(() => {
      dbClientQueryMock.mockResolvedValueOnce({ rows: [] })
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({ nfts: [] })
    })

    it("should not update metadata nor rental entries and update the time the last update was performed", async () => {
      await rentalsComponent.updateMetadata()
      expect(dbQueryMock).toHaveBeenCalledTimes(1)
      expect(dbClientQueryMock).toHaveBeenCalledTimes(3)
      expect(dbClientQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
          values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
        })
      )
    })
  })

  describe("and there's a metadata to update in the indexer", () => {
    beforeEach(() => {
      nftFromIndexer = {
        id: "aMetadataId",
        category: NFTCategory.PARCEL,
        contractAddress: "aContractAddress",
        tokenId: "aTokenId",
        owner: { address: lessor },
        searchEstateSize: null,
        searchText: "0,0",
        createdAt: "100000",
        updatedAt: "200000",
        searchIsLand: true,
        searchAdjacentToRoad: true,
        searchDistanceToPlaza: 3,
      }
      dbQueryMock.mockResolvedValueOnce({ rows: [{ updated_at: new Date() }] })
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({
        nfts: [nftFromIndexer],
      })
    })

    describe("and the metadata is not in the database", () => {
      beforeEach(async () => {
        dbClientQueryMock.mockResolvedValueOnce({ rowCount: 0 }).mockResolvedValueOnce({ rows: [] })
        await rentalsComponent.updateMetadata()
      })

      it("should only try to update the metadata failing to do so", () => {
        expect(dbClientQueryMock).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining("UPDATE metadata SET")]),
            values: expect.arrayContaining([NFTCategory.PARCEL]),
          })
        )
      })

      it("update the time the last update was performed", () => {
        expect(dbClientQueryMock).toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
            values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
          })
        )
      })

      it("should release the client", () => {
        expect(dbClientReleaseMock).toHaveBeenCalled()
      })
    })

    describe("and the metadata entry is in the database", () => {
      beforeEach(() => {
        dbClientQueryMock.mockResolvedValueOnce({ rowCount: 1 })
      })

      describe("and there's no open rental for the metadata entry", () => {
        beforeEach(async () => {
          dbClientQueryMock.mockResolvedValueOnce({ rows: [] })
          await rentalsComponent.updateMetadata()
        })

        it("should only update the metadata and", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE metadata SET")]),
              values: expect.arrayContaining([NFTCategory.PARCEL]),
            })
          )
        })

        it("update the time the last update was performed", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
              values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
            })
          )
        })
      })

      describe("and there's an open rental for the metadata entry", () => {
        let openRental: Pick<
          DBRental & DBRentalListing,
          "id" | "lessor" | "rental_contract_address" | "contract_address" | "token_id"
        >

        beforeEach(() => {
          openRental = {
            id: "someId",
            lessor,
            rental_contract_address: "aRentalAddress",
            contract_address: "aContractAddress",
            token_id: "aTokenId",
          }
          dbClientQueryMock.mockResolvedValueOnce({
            rows: [openRental],
          })
        })

        describe("and the owner is different and is not the rental contract", () => {
          beforeEach(async () => {
            nftFromIndexer.owner.address = "aDifferentAddress"
            await rentalsComponent.updateMetadata()
          })

          it("should update the metadata", () => {
            expect(dbClientQueryMock).toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE metadata SET")]),
                values: expect.arrayContaining([NFTCategory.PARCEL]),
              })
            )
          })

          it("should cancel the open rental", () => {
            expect(dbClientQueryMock).toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals SET status")]),
                values: expect.arrayContaining([RentalStatus.CANCELLED, openRental.id]),
              })
            )
          })

          it("should update the time the last update was performed", () => {
            expect(dbClientQueryMock).toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
                values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
              })
            )
          })

          it("should release the client", () => {
            expect(dbClientReleaseMock).toHaveBeenCalled()
          })
        })

        describe("and the owner is different and is the rental contract", () => {
          beforeEach(() => {
            nftFromIndexer.owner.address = openRental.rental_contract_address
          })

          describe("and the rental has a different lessor", () => {
            beforeEach(async () => {
              rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [{ lessor: "anotherLessor" }] })
              await rentalsComponent.updateMetadata()
            })

            it("should update the metadata", () => {
              expect(dbClientQueryMock).toHaveBeenCalledWith(
                expect.objectContaining({
                  strings: expect.arrayContaining([expect.stringContaining("UPDATE metadata SET")]),
                  values: expect.arrayContaining([NFTCategory.PARCEL]),
                })
              )
            })

            it("should cancel the open rental", () => {
              expect(dbClientQueryMock).toHaveBeenCalledWith(
                expect.objectContaining({
                  strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals SET status")]),
                  values: expect.arrayContaining([RentalStatus.CANCELLED, openRental.id]),
                })
              )
            })

            it("and update the time the last update was performed", () => {
              expect(dbClientQueryMock).toHaveBeenCalledWith(
                expect.objectContaining({
                  strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
                  values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
                })
              )
            })

            it("should release the client", () => {
              expect(dbClientReleaseMock).toHaveBeenCalled()
            })
          })

          describe("and the rental has the same lessor", () => {
            beforeEach(async () => {
              rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [{ lessor }] })
              await rentalsComponent.updateMetadata()
            })

            it("should only update the metadata and", () => {
              expect(dbClientQueryMock).toHaveBeenCalledWith(
                expect.objectContaining({
                  strings: expect.arrayContaining([expect.stringContaining("UPDATE metadata SET")]),
                  values: expect.arrayContaining([NFTCategory.PARCEL]),
                })
              )
            })

            it("update the time the last update was performed", () => {
              expect(dbClientQueryMock).toHaveBeenCalledWith(
                expect.objectContaining({
                  strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
                  values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
                })
              )
            })

            it("should release the client", () => {
              expect(dbClientReleaseMock).toHaveBeenCalled()
            })
          })
        })

        describe("and the estate has been dissolved", () => {
          beforeEach(async () => {
            nftFromIndexer.category = NFTCategory.ESTATE
            nftFromIndexer.searchEstateSize = 0
            await rentalsComponent.updateMetadata()
          })

          it("should update the metadata", () => {
            expect(dbClientQueryMock).toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE metadata SET")]),
                values: expect.arrayContaining([NFTCategory.ESTATE]),
              })
            )
          })

          it("should cancel the open rental", () => {
            expect(dbClientQueryMock).toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals SET status")]),
                values: expect.arrayContaining([RentalStatus.CANCELLED, openRental.id]),
              })
            )
          })

          it("should update the time the last update was performed", () => {
            expect(dbClientQueryMock).toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
                values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
              })
            )
          })

          it("should release the client", () => {
            expect(dbClientReleaseMock).toHaveBeenCalled()
          })
        })

        describe("and the owner is the same", () => {
          beforeEach(async () => {
            await rentalsComponent.updateMetadata()
          })

          it("should only update the metadata", () => {
            expect(dbClientQueryMock).toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE metadata SET")]),
                values: expect.arrayContaining([NFTCategory.PARCEL]),
              })
            )
          })

          it("update the time the last update was performed", () => {
            expect(dbClientQueryMock).toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
                values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
              })
            )
          })

          it("should release the client", () => {
            expect(dbClientReleaseMock).toHaveBeenCalled()
          })
        })
      })
    })

    describe("and an error occurs updating the metadata", () => {
      beforeEach(async () => {
        dbClientQueryMock.mockRejectedValueOnce(new Error("An error occurred"))
        await rentalsComponent.updateMetadata()
      })

      it("should stop the update, not propagate the error and rollback", () => {
        expect(dbClientQueryMock).toHaveBeenCalledWith("ROLLBACK")
      })

      it("should release the client", () => {
        expect(dbClientReleaseMock).toHaveBeenCalled()
      })
    })
  })
})

describe("when updating the rental listings", () => {
  let nftFromIndexer: NFT
  let startDate: Date
  let rentalFromIndexer: IndexerRental

  beforeEach(async () => {
    startDate = new Date()
    dbQueryMock = jest.fn()
    dbClientQueryMock = jest.fn()
    dbClientReleaseMock = jest.fn()
    database = createTestDbComponent({
      query: dbQueryMock,
      getPool: jest
        .fn()
        .mockReturnValue({ connect: () => ({ query: dbClientQueryMock, release: dbClientReleaseMock }) }),
    })
    marketplaceSubgraphQueryMock = jest.fn()
    marketplaceSubgraph = createTestSubgraphComponent({ query: marketplaceSubgraphQueryMock })
    rentalsSubgraphQueryMock = jest.fn()
    rentalsSubgraph = createTestSubgraphComponent({ query: rentalsSubgraphQueryMock })
    logs = createTestConsoleLogComponent()
    config = createConfigComponent({ CHAIN_NAME: "Goerli", MAX_CONCURRENT_RENTAL_UPDATES: "5" })
    lessor = "0x705C1a693cB6a63578451D52E182a02Bc8cB2dEB"
    rentalsComponent = await createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs, config })
    dbQueryMock.mockResolvedValueOnce({ rows: [{ updated_at: new Date() }] })
    dbClientQueryMock.mockResolvedValueOnce(undefined)
    jest.spyOn(Date, "now").mockReturnValueOnce(startDate.getTime())
  })

  describe("and there are no updated rentals", () => {
    beforeEach(async () => {
      rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [] })
      await rentalsComponent.updateRentalsListings()
    })

    it("should not insert any rental", () => {
      expect(dbClientQueryMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ strings: expect.arrayContaining([expect.stringContaining("INSERT rentals")]) })
      )
    })

    it("should not insert any metadata", () => {
      expect(dbClientQueryMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ strings: expect.arrayContaining([expect.stringContaining("INSERT metadata")]) })
      )
    })

    it("should close all expired opened listings", () => {
      expect(dbClientQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals SET")]),
          values: expect.arrayContaining([RentalStatus.CANCELLED, RentalStatus.OPEN]),
        })
      )
    })

    it("should update the time the last update was performed", () => {
      expect(dbClientQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
          values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
        })
      )
    })

    it("should release the client", () => {
      expect(dbClientReleaseMock).toHaveBeenCalled()
    })
  })

  describe("and there are rentals to be updated", () => {
    let newSignature: string
    let oldSignature: string

    beforeEach(() => {
      newSignature =
        "0x38fbaabfdf15b5b0ccc66c6eaab45a525fc03ff7590ed28da5894365e4bfee16008e28064a418203b0e3186ff3bce4cccb58b06bac2519b9ca73cdc13ecc3cea1b"
      oldSignature = newSignature.slice(0, -2) + "00"
      rentalFromIndexer = {
        id: "aRentalId",
        contractAddress: "aContractAddress",
        tokenId: "aTokenId",
        lessor: "aLessor",
        tenant: "aTenant",
        operator: "aLessor",
        rentalDays: "20",
        startedAt: Math.round(new Date().getTime() / 1000).toString(),
        endsAt: Math.round(new Date().getTime() / 1000 + 100000000).toString(),
        updatedAt: Math.round(new Date().getTime() / 1000).toString(),
        pricePerDay: "23423423423",
        sender: "aLessor",
        ownerHasClaimedAsset: false,
        rentalContractAddress: "aRentalContractAddress",
        isExtension: false,
        signature: newSignature,
      }
    })

    describe("and the rentals to be updated exist in the database", () => {
      let dbRental: Pick<DBRental & DBRentalListing, "id" | "lessor" | "status" | "signature">

      describe("and the LAND has been claimed by its owner", () => {
        beforeEach(async () => {
          dbRental = {
            id: "rentalId",
            lessor: "aLessorAddress",
            status: RentalStatus.OPEN,
            signature: oldSignature,
          }
          rentalFromIndexer = { ...rentalFromIndexer, ownerHasClaimedAsset: true }
          dbClientQueryMock.mockResolvedValueOnce({ rows: [dbRental] })
          rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [rentalFromIndexer] })
          await rentalsComponent.updateRentalsListings()
        })

        it("should update the rental", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals")]),
              values: expect.arrayContaining([
                new Date(Math.floor(Number(rentalFromIndexer.startedAt) * 1000)),
                newSignature,
                RentalStatus.CLAIMED,
                dbRental.id,
              ]),
            })
          )
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals_listings")]),
              values: expect.arrayContaining([rentalFromIndexer.tenant, dbRental.id]),
            })
          )
        })

        it("should close all expired opened listings", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals SET")]),
              values: expect.arrayContaining([RentalStatus.CANCELLED, RentalStatus.OPEN]),
            })
          )
        })

        it("should update the time the last update was performed", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
              values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
            })
          )
        })
      })

      describe("and the LAND has not been claimed by its owner", () => {
        beforeEach(async () => {
          dbRental = {
            id: "rentalId",
            lessor: "aLessorAddress",
            status: RentalStatus.OPEN,
            signature:
              "0x38fbaabfdf15b5b0ccc66c6eaab45a525fc03ff7590ed28da5894365e4bfee16008e28064a418203b0e3186ff3bce4cccb58b06bac2519b9ca73cdc13ecc3cea1b",
          }
          rentalFromIndexer = { ...rentalFromIndexer, ownerHasClaimedAsset: false }
          dbClientQueryMock.mockResolvedValueOnce({ rows: [dbRental] })
          rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [rentalFromIndexer] })
          await rentalsComponent.updateRentalsListings()
        })

        it("should update the rental", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals")]),
              values: expect.arrayContaining([
                new Date(Math.floor(Number(rentalFromIndexer.startedAt) * 1000)),
                RentalStatus.EXECUTED,
                dbRental.id,
              ]),
            })
          )
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals_listings")]),
              values: expect.arrayContaining([rentalFromIndexer.tenant, dbRental.id]),
            })
          )
        })

        it("should close all expired opened listings", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals SET")]),
              values: expect.arrayContaining([RentalStatus.CANCELLED, RentalStatus.OPEN]),
            })
          )
        })

        it("should update the time the last update was performed", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
              values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
            })
          )
        })

        it("should release the client", () => {
          expect(dbClientReleaseMock).toHaveBeenCalled()
        })
      })
    })

    describe("and the rentals to be updated don't exist in the database", () => {
      let newRentalId: string
      beforeEach(() => {
        nftFromIndexer = {
          id: "aMetadataId",
          category: NFTCategory.PARCEL,
          contractAddress: "aContractAddress",
          tokenId: "aTokenId",
          owner: { address: lessor },
          searchEstateSize: null,
          searchText: "0,0",
          createdAt: "100000",
          updatedAt: "200000",
          searchIsLand: true,
          searchAdjacentToRoad: true,
          searchDistanceToPlaza: 3,
        }
        newRentalId = "aNewRentalId"
        rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [rentalFromIndexer] })
        dbClientQueryMock.mockResolvedValueOnce({ rows: [] })
        marketplaceSubgraphQueryMock.mockResolvedValueOnce({ nfts: [nftFromIndexer] })
      })

      describe("and the metadata doesn't exist in the database either", () => {
        beforeEach(async () => {
          dbClientQueryMock
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({ rows: [{ id: newRentalId }] })
          await rentalsComponent.updateRentalsListings()
        })

        it("should insert the new metadata", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("INSERT INTO metadata")]),
              values: expect.arrayContaining([
                nftFromIndexer.id,
                nftFromIndexer.category,
                nftFromIndexer.searchText,
                new Date(Number(nftFromIndexer.createdAt) * 1000),
                new Date(Number(nftFromIndexer.updatedAt) * 1000),
              ]),
            })
          )
        })

        it("should insert the rental", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("INSERT INTO rentals")]),
              values: expect.arrayContaining([
                nftFromIndexer.id,
                Network.ETHEREUM,
                ChainId.ETHEREUM_GOERLI,
                new Date(0),
                rentalFromIndexer.signature,
                ["0", "0", "0"],
                rentalFromIndexer.tokenId,
                rentalFromIndexer.contractAddress,
                rentalFromIndexer.rentalContractAddress,
                RentalStatus.EXECUTED,
                new Date(Number(rentalFromIndexer.startedAt) * 1000),
                new Date(Number(rentalFromIndexer.startedAt) * 1000),
                new Date(Number(rentalFromIndexer.startedAt) * 1000),
              ]),
            })
          )
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("INSERT INTO rentals_listings")]),
              values: expect.arrayContaining([newRentalId, rentalFromIndexer.lessor, rentalFromIndexer.tenant]),
            })
          )
        })

        it("should close all expired opened listings", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals SET")]),
              values: expect.arrayContaining([RentalStatus.CANCELLED, RentalStatus.OPEN]),
            })
          )
        })

        it("should update the time the last update was performed", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
              values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
            })
          )
        })

        it("should release the client", () => {
          expect(dbClientReleaseMock).toHaveBeenCalled()
        })
      })

      describe("and the metadata already exists in the database", () => {
        let metadataId: string
        beforeEach(async () => {
          metadataId = "aMetadataId"
          dbClientQueryMock
            .mockResolvedValueOnce({ rows: [{ id: metadataId }] })
            .mockResolvedValueOnce({ rows: [{ id: newRentalId }] })
          await rentalsComponent.updateRentalsListings()
        })

        it("should not insert the a new metadata entry", () => {
          expect(dbClientQueryMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("INSERT INTO metadata")]),
              values: expect.arrayContaining([
                nftFromIndexer.id,
                nftFromIndexer.category,
                nftFromIndexer.searchText,
                new Date(Number(nftFromIndexer.createdAt) * 1000),
                new Date(Number(nftFromIndexer.updatedAt) * 1000),
              ]),
            })
          )
        })

        it("should insert the rental", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("INSERT INTO rentals")]),
              values: expect.arrayContaining([
                nftFromIndexer.id,
                Network.ETHEREUM,
                ChainId.ETHEREUM_GOERLI,
                new Date(0),
                rentalFromIndexer.signature,
                ["0", "0", "0"],
                rentalFromIndexer.tokenId,
                rentalFromIndexer.contractAddress,
                rentalFromIndexer.rentalContractAddress,
                RentalStatus.EXECUTED,
                new Date(Number(rentalFromIndexer.startedAt) * 1000),
                new Date(Number(rentalFromIndexer.startedAt) * 1000),
                new Date(Number(rentalFromIndexer.startedAt) * 1000),
              ]),
            })
          )
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("INSERT INTO rentals_listings")]),
              values: expect.arrayContaining([newRentalId, rentalFromIndexer.lessor, rentalFromIndexer.tenant]),
            })
          )
        })

        it("should close all expired opened listings", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals SET")]),
              values: expect.arrayContaining([RentalStatus.CANCELLED, RentalStatus.OPEN]),
            })
          )
        })

        it("should update the time the last update was performed", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
              values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
            })
          )
        })

        it("should release the client", () => {
          expect(dbClientReleaseMock).toHaveBeenCalled()
        })
      })
    })

    describe("and the process to update the rentals fails", () => {
      beforeEach(async () => {
        dbClientQueryMock.mockRejectedValueOnce(new Error("An error occurred"))
        rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [rentalFromIndexer] })
        await rentalsComponent.updateRentalsListings()
      })

      it("should not perform any updates", () => {
        expect(dbClientQueryMock).not.toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining("UPDATE")]),
          })
        )
      })

      it("should not perform any inserts", () => {
        expect(dbClientQueryMock).not.toHaveBeenCalledWith(
          expect.objectContaining({
            strings: expect.arrayContaining([expect.stringContaining("INSERT")]),
          })
        )
      })

      it("should rollback any changes", () => {
        expect(dbClientQueryMock).toHaveBeenCalledWith("ROLLBACK")
      })

      it("should release the client", () => {
        expect(dbClientReleaseMock).toHaveBeenCalled()
      })
    })
  })
})

describe("when cancelling the rental listings", () => {
  let startDate: Date
  let nonceUpdate: IndexerIndexesHistoryUpdate

  beforeEach(async () => {
    startDate = new Date()
    dbQueryMock = jest.fn()
    dbClientQueryMock = jest.fn()
    dbClientReleaseMock = jest.fn()
    database = createTestDbComponent({
      query: dbQueryMock,
      getPool: jest
        .fn()
        .mockReturnValue({ connect: () => ({ query: dbClientQueryMock, release: dbClientReleaseMock }) }),
    })
    marketplaceSubgraphQueryMock = jest.fn()
    marketplaceSubgraph = createTestSubgraphComponent({ query: marketplaceSubgraphQueryMock })
    rentalsSubgraphQueryMock = jest.fn()
    rentalsSubgraph = createTestSubgraphComponent({ query: rentalsSubgraphQueryMock })
    logs = createTestConsoleLogComponent()
    config = createConfigComponent({ CHAIN_NAME: "Goerli", MAX_CONCURRENT_RENTAL_UPDATES: "5" })
    rentalsComponent = await createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs, config })
    dbQueryMock.mockResolvedValueOnce({ rows: [{ updated_at: new Date() }] })
    jest.spyOn(Date, "now").mockReturnValueOnce(startDate.getTime())
  })

  describe("and there are no updated nonces since the latest job", () => {
    beforeEach(async () => {
      rentalsSubgraphQueryMock.mockResolvedValueOnce({ indexesUpdateHistories: [] })
      await rentalsComponent.cancelRentalsListings()
    })

    it("should not update any rental", () => {
      expect(dbClientQueryMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals")]) })
      )
    })

    it("should update the time the last update was performed", () => {
      expect(dbClientQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
          values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
        })
      )
    })

    it("should release the client", () => {
      expect(dbClientReleaseMock).toHaveBeenCalled()
    })
  })

  describe("and there are rentals to be updated", () => {
    describe("and the index bump was of type contract", () => {
      beforeEach(() => {
        nonceUpdate = {
          date: "",
          id: "1",
          sender: "0xsender",
          type: IndexerIndexUpdateType.CONTRACT,
          signerUpdate: null,
          assetUpdate: null,
          contractUpdate: {
            contractAddress: "0x123",
            id: "1",
            newIndex: "2",
          },
        }
        rentalsSubgraphQueryMock.mockResolvedValueOnce({ indexesUpdateHistories: [nonceUpdate] })
      })

      describe("and the rentals to be updated exist in the database", () => {
        beforeEach(async () => {
          await rentalsComponent.cancelRentalsListings()
        })

        it("should execute the UPDATE query for the correspoding contract and index", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals")]),
              values: expect.arrayContaining([
                RentalStatus.CANCELLED,
                nonceUpdate.contractUpdate?.newIndex,
                nonceUpdate.contractUpdate?.contractAddress,
              ]),
            })
          )
        })

        it("should update the time the last update was performed", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
              values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
            })
          )
        })

        it("should release the client", () => {
          expect(dbClientReleaseMock).toHaveBeenCalled()
        })
      })
    })

    describe("and the index bump was of type signer", () => {
      beforeEach(() => {
        nonceUpdate = {
          date: "",
          id: "1",
          sender: "0xsender",
          type: IndexerIndexUpdateType.SIGNER,
          signerUpdate: {
            id: "12",
            newIndex: "2",
            signer: "0xsigner",
          },
          assetUpdate: null,
          contractUpdate: null,
        }
        rentalsSubgraphQueryMock.mockResolvedValueOnce({ indexesUpdateHistories: [nonceUpdate] })
      })

      describe("and the rentals to be updated exist in the database", () => {
        beforeEach(async () => {
          await rentalsComponent.cancelRentalsListings()
        })

        it("should execute the UPDATE query for the correspoding contract and nonce", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals")]),
              values: expect.arrayContaining([
                RentalStatus.CANCELLED,
                nonceUpdate.signerUpdate?.newIndex,
                nonceUpdate.signerUpdate?.signer,
              ]),
            })
          )
        })

        it("should update the time the last update was performed", () => {
          expect(dbClientQueryMock).toHaveBeenCalledWith(
            expect.objectContaining({
              strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
              values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
            })
          )
        })

        it("should release the client", () => {
          expect(dbClientReleaseMock).toHaveBeenCalled()
        })
      })
    })

    describe("and the index bump was of type asset", () => {
      describe("and the rentals to be updated exist in the database", () => {
        describe("and the type of the index bump was is of type RENT", () => {
          beforeEach(async () => {
            nonceUpdate = {
              date: "",
              id: "1",
              sender: "0xsender",
              type: IndexerIndexUpdateType.ASSET,
              signerUpdate: null,
              contractUpdate: null,
              assetUpdate: {
                id: "1",
                tokenId: "3",
                newIndex: "2",
                contractAddress: "0xcontract",
                type: IndexUpdateEventType.RENT,
              },
            }
            rentalsSubgraphQueryMock.mockResolvedValueOnce({ indexesUpdateHistories: [nonceUpdate] })
            await rentalsComponent.cancelRentalsListings()
          })
          it("should not execute the UPDATE query for the corresponding asset and index", () => {
            expect(dbClientQueryMock).not.toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals")]),
                values: expect.arrayContaining([
                  RentalStatus.CANCELLED,
                  nonceUpdate.assetUpdate?.newIndex,
                  nonceUpdate.assetUpdate?.contractAddress,
                  nonceUpdate.assetUpdate?.tokenId,
                ]),
              })
            )
          })
        })

        describe("and the type of the index bump was is of type CANCEL", () => {
          beforeEach(async () => {
            nonceUpdate = {
              date: "",
              id: "1",
              sender: "0xsender",
              type: IndexerIndexUpdateType.ASSET,
              signerUpdate: null,
              contractUpdate: null,
              assetUpdate: {
                id: "1",
                tokenId: "3",
                newIndex: "2",
                contractAddress: "0xcontract",
                type: IndexUpdateEventType.CANCEL,
              },
            }
            rentalsSubgraphQueryMock.mockResolvedValueOnce({ indexesUpdateHistories: [nonceUpdate] })
            await rentalsComponent.cancelRentalsListings()
          })

          it("should execute the UPDATE query for the correspoding asset and index", () => {
            expect(dbClientQueryMock).toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE rentals")]),
                values: expect.arrayContaining([
                  RentalStatus.CANCELLED,
                  nonceUpdate.assetUpdate?.newIndex,
                  nonceUpdate.assetUpdate?.contractAddress,
                  nonceUpdate.assetUpdate?.tokenId,
                ]),
              })
            )
          })

          it("should update the time the last update was performed", () => {
            expect(dbClientQueryMock).toHaveBeenCalledWith(
              expect.objectContaining({
                strings: expect.arrayContaining([expect.stringContaining("UPDATE updates SET updated_at")]),
                values: expect.arrayContaining([new Date(Math.floor(startDate.getTime() / 1000) * 1000)]),
              })
            )
          })

          it("should release the client", () => {
            expect(dbClientReleaseMock).toHaveBeenCalled()
          })
        })
      })
    })
  })
})

describe("when getting rental listings prices", () => {
  let dbGetRentalListingsPrices: DBGetRentalListingsPrice[]

  beforeEach(async () => {
    dbQueryMock = jest.fn()
    database = createTestDbComponent({ query: dbQueryMock })
    marketplaceSubgraphQueryMock = jest.fn()
    marketplaceSubgraph = createTestSubgraphComponent({ query: marketplaceSubgraphQueryMock })
    rentalsSubgraphQueryMock = jest.fn()
    rentalsSubgraph = createTestSubgraphComponent({ query: rentalsSubgraphQueryMock })
    logs = createTestConsoleLogComponent()
    config = createConfigComponent({ CHAIN_NAME: "Goerli", MAX_CONCURRENT_RENTAL_UPDATES: "5" })
    rentalsComponent = await createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs, config })
  })

  describe("and the query throws an error", () => {
    const errorMessage = "Something went wrong while querying the database"
    beforeEach(() => {
      dbQueryMock.mockRejectedValueOnce(new Error("Something went wrong while querying the database"))
    })

    it("should propagate the error", () => {
      expect(rentalsComponent.getRentalListingsPrices({})).rejects.toThrowError(errorMessage)
    })
  })

  describe("and no filters are applied", () => {
    beforeEach(() => {
      dbGetRentalListingsPrices = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListingsPrices })
    })

    it("should get all rental prices with status opened", async () => {
      await expect(rentalsComponent.getRentalListingsPrices({})).resolves.toEqual(dbGetRentalListingsPrices)
      expect(dbQueryMock.mock.calls[0][0].text).toEqual(
        expect.stringContaining(
          `SELECT p.price_per_day FROM periods p, metadata m, rentals r WHERE p.rental_id = r.id AND m.id = r.metadata_id AND r.status = $1`
        )
      )
      expect(dbQueryMock.mock.calls[0][0].values).toEqual([RentalStatus.OPEN])
    })
  })

  describe.each([
    {
      filterName: "adjacentToRoad",
      filterValue: true,
      queryString: "AND m.adjacent_to_road = $2",
      queryValues: [true],
    },
    {
      filterName: "category",
      filterValue: RentalsListingsFilterByCategory.PARCEL,
      queryString: "AND m.category = $2",
      queryValues: [RentalsListingsFilterByCategory.PARCEL],
    },
    {
      filterName: "minDistanceToPlaza",
      filterValue: 1,
      queryString: "AND m.distance_to_plaza >= $2",
      queryValues: [1],
    },
    {
      filterName: "maxDistanceToPlaza",
      filterValue: 1,
      queryString: "AND m.distance_to_plaza <= $2",
      queryValues: [1],
    },
    { filterName: "minEstateSize", filterValue: 1, queryString: "AND m.estate_size >= $2", queryValues: [1] },
    { filterName: "maxEstateSize", filterValue: 1, queryString: "AND m.estate_size <= $2", queryValues: [1] },
    {
      filterName: "rentalDays",
      filterValue: [1],
      queryString: "AND ((p.min_days <= $2 AND p.max_days >= $3))",
      queryValues: [1, 1],
    },
    {
      filterName: "rentalDays",
      filterValue: [1, 30],
      queryString: "AND ((p.min_days <= $2 AND p.max_days >= $3) OR (p.min_days <= $4 AND p.max_days >= $5))",
      queryValues: [1, 1, 30, 30],
    },
  ])("and filter $filterName is applied", ({ filterName, filterValue, queryString, queryValues }) => {
    beforeEach(() => {
      dbGetRentalListingsPrices = []
      dbQueryMock.mockResolvedValueOnce({ rows: dbGetRentalListingsPrices })
    })

    it("should make the query with the correct $filterName value", () => {
      expect(rentalsComponent.getRentalListingsPrices({ [filterName]: filterValue })).resolves.toEqual(
        dbGetRentalListingsPrices
      )
      expect(dbQueryMock.mock.calls[0][0].text).toEqual(expect.stringContaining(queryString))
      expect(dbQueryMock.mock.calls[0][0].values).toEqual([RentalStatus.OPEN, ...queryValues])
    })
  })
})
