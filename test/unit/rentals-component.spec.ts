import SQL from "sql-template-strings"
import { ethers } from "ethers"
import { IConfigComponent, ILoggerComponent } from "@well-known-components/interfaces"
import { IPgComponent } from "@dcl/pg-component"
import { ISubgraphComponent } from "@dcl/thegraph-component"
import { createConfigComponent } from "@well-known-components/env-config-provider"
import {
  ChainId,
  Network,
  NFTCategory,
  RentalListingCreation,
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
  IndexUpdateEventType,
  InvalidEstate,
  InvalidRentalContractAddress,
  RentalAlreadyExpired,
  UnsupportedChain,
} from "../../src/ports/rentals"
import { fromMillisecondsToSeconds } from "../../src/adapters/rentals"
import { createTestConsoleLogComponent, createTestDbComponent, createTestSubgraphComponent } from "../components"

// Only the two functions that reach outside are stubbed. Auto mocking the whole module would also
// replace its pure helpers, silently turning every address comparison into undefined.
jest.mock("../../src/logic/rentals", () => ({
  ...jest.requireActual("../../src/logic/rentals"),
  verifyRentalsListingSignature: jest.fn(),
  getRentalsContract: jest.fn(),
}))

const mockedRentalsLogic = jest.mocked(rentalsLogic, { shallow: true })

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
  let rentalsContractAddress: string

  beforeEach(async () => {
    rentalsContractAddress = "0x09305998a531fade369ebe30adf868c96a34e813"
    mockedRentalsLogic.verifyRentalsListingSignature.mockResolvedValueOnce(true)
    mockedRentalsLogic.getRentalsContract.mockReturnValue({
      abi: [],
      address: rentalsContractAddress,
      name: "Rentals",
      version: "1",
      chainId: ChainId.ETHEREUM_GOERLI,
    })
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
      rentalContractAddress: rentalsContractAddress,
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

  describe("and the chain id is not the one supported by the server", () => {
    beforeEach(() => {
      rentalListingCreation.chainId = ChainId.ETHEREUM_MAINNET
    })

    it("should throw an unsupported chain error", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new UnsupportedChain(rentalListingCreation.chainId, rentalListingCreation.network)
      )
    })
  })

  describe("and the network is not the one supported by the server", () => {
    beforeEach(() => {
      rentalListingCreation.network = Network.MATIC
    })

    it("should throw an unsupported chain error", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new UnsupportedChain(rentalListingCreation.chainId, rentalListingCreation.network)
      )
    })
  })

  describe("and the rental contract address is not the Rentals contract of the chain", () => {
    let forgedRentalContractAddress: string

    beforeEach(() => {
      forgedRentalContractAddress = "0x1111111111111111111111111111111111111111"
      rentalListingCreation.rentalContractAddress = forgedRentalContractAddress
    })

    it("should throw an invalid rental contract address error", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new InvalidRentalContractAddress(forgedRentalContractAddress, rentalsContractAddress)
      )
    })
  })

  describe("and the signature is not a 65 bytes hex encoded ECDSA signature", () => {
    beforeEach(() => {
      rentalListingCreation.signature = "not-a-signature"
    })

    it("should throw an invalid signature error describing the expected format", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new InvalidSignature("The signature is not a 65 bytes hex encoded ECDSA signature")
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
      created_at = new Date()
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
      return expect(
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
})

describe("when refreshing rental listings", () => {
  let rentalFromDb: {
    id: string
    contract_address: string
    rental_contract_address: string
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
      rental_contract_address: "aRentalContractAddress",
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

      describe("and the rentals contract holds the asset on behalf of the lessor", () => {
        beforeEach(() => {
          marketplaceSubgraphQueryMock.mockResolvedValueOnce({
            nfts: [
              {
                ...nftFromIndexer,
                owner: {
                  address: rentalFromDb.rental_contract_address,
                },
                createdAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
                updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
              },
            ],
          })
          mockDefaultSubgraphNonces()
          rentalsSubgraphQueryMock.mockResolvedValueOnce({
            rentals: [{ ...rentalFromIndexer, lessor: rentalFromDb.lessor }],
          })
          dbQueryMock.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
            rows: [result],
            rowCount: 1,
          })
        })

        it("should not cancel the listing, as the lessor can still rent the asset out", async () => {
          await expect(rentalsComponent.refreshRentalListing("an id")).resolves.toEqual(result)
          expect(dbQueryMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
              text: expect.stringContaining("UPDATE rentals SET status"),
              values: expect.arrayContaining([RentalStatus.CANCELLED]),
            })
          )
        })
      })

      describe("and the rentals contract holds the asset on behalf of a different lessor", () => {
        beforeEach(() => {
          marketplaceSubgraphQueryMock.mockResolvedValueOnce({
            nfts: [
              {
                ...nftFromIndexer,
                owner: {
                  address: rentalFromDb.rental_contract_address,
                },
                createdAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
                updatedAt: (Math.round(rentalFromDb.updated_at.getTime() / 1000) + 10000).toString(),
              },
            ],
          })
          mockDefaultSubgraphNonces()
          rentalsSubgraphQueryMock.mockResolvedValueOnce({
            rentals: [{ ...rentalFromIndexer, lessor: "aDifferentLessor" }],
          })
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
              text: expect.stringContaining("UPDATE rentals SET status"),
              values: expect.arrayContaining([RentalStatus.CANCELLED]),
            })
          )
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

describe("when getting rental listings prices", () => {
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
      return expect(rentalsComponent.getRentalListingsPrices()).rejects.toThrowError(errorMessage)
    })
  })
})
