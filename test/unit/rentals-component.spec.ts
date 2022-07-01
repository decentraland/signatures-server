import SQL from "sql-template-strings"
import { Wallet } from "ethers"
import { ILoggerComponent } from "@well-known-components/interfaces"
import { IPgComponent } from "@well-known-components/pg-component"
import { ISubgraphComponent } from "@well-known-components/thegraph-component"
import { ChainId, Network, NFTCategory } from "@dcl/schemas"
import * as rentalsLogic from "../../src/logic/rentals"
import {
  createRentalsComponent,
  InvalidSignature,
  IRentalsComponent,
  NFTNotFound,
  RentalAlreadyExists,
  RentalListingCreation,
  Status,
  UnauthorizedToRent,
} from "../../src/ports/rentals"
import { fromMillisecondsToSeconds } from "../../src/adapters/rentals"
import { createTestConsoleLogComponent, createTestDbComponent, createTestSubgraphComponent } from "../components"

jest.mock("../../src/logic/rentals")

const mockedRentalsLogic = jest.mocked(rentalsLogic, true)

let dbQueryMock: jest.Mock
let database: IPgComponent
let marketplaceSubgraphQueryMock: jest.Mock
let marketplaceSubgraph: ISubgraphComponent
let rentalsSubgraphQueryMock: jest.Mock
let rentalsSubgraph: ISubgraphComponent
let rentalsComponent: IRentalsComponent
let logs: ILoggerComponent

describe("when creating a rental listing", () => {
  let rentalListingCreation: RentalListingCreation
  let lessor: string

  beforeEach(async () => {
    mockedRentalsLogic.verifyRentalsListingSignature.mockResolvedValueOnce(true)
    dbQueryMock = jest.fn()
    database = createTestDbComponent({ query: dbQueryMock })
    marketplaceSubgraphQueryMock = jest.fn()
    marketplaceSubgraph = createTestSubgraphComponent({ query: marketplaceSubgraphQueryMock })
    rentalsSubgraphQueryMock = jest.fn()
    rentalsSubgraph = createTestSubgraphComponent({ query: rentalsSubgraphQueryMock })
    logs = createTestConsoleLogComponent()
    lessor = await Wallet.createRandom().getAddress()
    rentalListingCreation = {
      network: Network.ETHEREUM,
      chainId: ChainId.ETHEREUM_GOERLI,
      rentalContractAddress: "0x0",
      contractAddress: "0x0",
      tokenId: "0",
      expiration: Date.now() + 2000000,
      nonces: ["0x0", "0x0", "0x0"],
      periods: [
        {
          pricePerDay: "10000",
          maxDays: 30,
          minDays: 30,
        },
      ],
      signature:
        "0x38fbaabfdf15b5b0ccc66c6eaab45a525fc03ff7590ed28da5894365e4bfee16008e28064a418203b0e3186ff3bce4cccb58b06bac2519b9ca73cdc13ecc3cea1b",
    }
  })

  describe("and the signature is not valid", () => {
    beforeEach(() => {
      mockedRentalsLogic.verifyRentalsListingSignature.mockReset().mockResolvedValueOnce(false)
      rentalsComponent = createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs })
    })

    it("should throw an invalid signature error", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new InvalidSignature()
      )
    })
  })

  describe("and a rental listing already exists in the blockchain and has not ended", () => {
    beforeEach(() => {
      const aDay = 24 * 60 * 60 * 1000
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
            ownerHasClaimedAsset: false,
          },
        ],
      })
      rentalsComponent = createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs })
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
      rentalsComponent = createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs })
    })

    it("should throw a NFT not found error", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new NFTNotFound(rentalListingCreation.contractAddress, rentalListingCreation.tokenId)
      )
    })
  })

  describe("and the creator of the rental is not the owner of the LAND", () => {
    beforeEach(async () => {
      rentalsSubgraphQueryMock.mockResolvedValueOnce({ rentals: [] })
      marketplaceSubgraphQueryMock.mockResolvedValueOnce({
        nfts: [
          {
            owner: await Wallet.createRandom().getAddress(),
          },
        ],
      })
      rentalsComponent = createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs })
    })

    it("should throw an unauthorized to rent error", () => {
      return expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new UnauthorizedToRent(rentalListingCreation.contractAddress, rentalListingCreation.tokenId)
      )
    })
  })

  describe("and one of the queries to create the rental listing fails with an unknown error", () => {
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
      dbQueryMock.mockRejectedValueOnce(new Error("Database error"))
      rentalsComponent = createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs })
    })

    it("should throw an error and rollback the query", async () => {
      await expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new Error("Error creating rental")
      )

      expect(dbQueryMock).toHaveBeenCalledWith(SQL`ROLLBACK`)
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
      dbQueryMock.mockRejectedValueOnce({ constraint: "rentals_token_id_contract_address_status_unique_index" })
      rentalsComponent = createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs })
    })

    it("should throw an error and rollback the query", async () => {
      await expect(rentalsComponent.createRentalListing(rentalListingCreation, lessor)).rejects.toEqual(
        new RentalAlreadyExists(rentalListingCreation.contractAddress, rentalListingCreation.tokenId)
      )

      expect(dbQueryMock).toHaveBeenCalledWith(SQL`ROLLBACK`)
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
      dbQueryMock
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
              status: Status.OPEN,
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
      rentalsComponent = createRentalsComponent({ database, marketplaceSubgraph, rentalsSubgraph, logs })
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
        status: Status.OPEN,
      })
    })
  })
})
