import { ethers } from "ethers"
import { ChainId, Network, NFTCategory, RentalListing, RentalStatus } from "@dcl/schemas"
import * as authorizationMiddleware from "decentraland-crypto-middleware"
import { fromDBInsertedRentalListingToRental } from "../../src/adapters/rentals"
import {
  getRentalsListingsHandler,
  refreshRentalListingHandler,
  rentalsListingsCreationHandler,
} from "../../src/controllers/handlers/rentals-handlers"
import {
  DBGetRentalListing,
  DBInsertedRentalListing,
  InvalidSignature,
  NFTNotFound,
  RentalAlreadyExists,
  RentalNotFound,
  UnauthorizedToRent,
} from "../../src/ports/rentals"
import { AppComponents, HandlerContextWithPath, StatusCode } from "../../src/types"
import { createTestRentalsComponent } from "../components"

describe("when creating a new rental listing", () => {
  let components: Pick<AppComponents, "rentals">
  let verification: authorizationMiddleware.DecentralandSignatureData | undefined
  let request: HandlerContextWithPath<"rentals", "/rentals-listing">["request"]

  beforeEach(() => {
    components = {
      rentals: createTestRentalsComponent(),
    }
    verification = { auth: "0x0", authMetadata: {} }
    request = {
      clone: jest.fn().mockReturnValue({
        json: () => ({ aTestProp: "someValue" }),
      }),
    } as any
  })

  describe("and the request is not authenticated", () => {
    beforeEach(() => {
      verification = undefined
    })

    it("should return an unauthorized response", async () => {
      return expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
        status: StatusCode.UNAUTHORIZED,
        body: {
          ok: false,
          message: "Unauthorized",
          data: undefined,
        },
      })
    })
  })

  describe("and the listing creation fails with a NFT not found error", () => {
    let contractAddress: string
    let tokenId: string

    beforeEach(() => {
      contractAddress = "0x1"
      tokenId = "0"
      components = {
        rentals: createTestRentalsComponent({
          createRentalListing: jest.fn().mockRejectedValueOnce(new NFTNotFound(contractAddress, tokenId)),
        }),
      }
    })

    it("should return a response with a not found status code and a message signaling that the NFT was not found", () => {
      return expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
        status: StatusCode.NOT_FOUND,
        body: {
          ok: false,
          message: "The NFT was not found",
          data: {
            tokenId,
            contractAddress,
          },
        },
      })
    })
  })

  describe("and the listing creation fails with an unauthorized to rent error", () => {
    let ownerAddress: string
    let lessorAddress: string

    beforeEach(() => {
      ownerAddress = "0x1"
      lessorAddress = "0x02"
      components = {
        rentals: createTestRentalsComponent({
          createRentalListing: jest.fn().mockRejectedValueOnce(new UnauthorizedToRent(ownerAddress, lessorAddress)),
        }),
      }
    })

    it("should return a response with an unauthorized status code and a message signaling that the user is not authorized to rent the asset", () => {
      return expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
        status: StatusCode.UNAUTHORIZED,
        body: {
          ok: false,
          message: "The owner of the token is not the lessor, it can't rent the token",
          data: {
            ownerAddress,
            lessorAddress,
          },
        },
      })
    })
  })

  describe("and the listing creation fails with a rental already exists error", () => {
    let contractAddress: string
    let tokenId: string

    beforeEach(() => {
      contractAddress = "0x1"
      tokenId = "1"
      components = {
        rentals: createTestRentalsComponent({
          createRentalListing: jest.fn().mockRejectedValueOnce(new RentalAlreadyExists(contractAddress, tokenId)),
        }),
      }
    })

    it("should return a response with a conflict status code and a message signaling that there's already a rental for the asset", () => {
      return expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
        status: StatusCode.CONFLICT,
        body: {
          ok: false,
          message: "An open rental already exists for this token",
          data: {
            contractAddress,
            tokenId,
          },
        },
      })
    })
  })

  describe("and the listing creation fails with an invalid signature error", () => {
    beforeEach(() => {
      components = {
        rentals: createTestRentalsComponent({
          createRentalListing: jest.fn().mockRejectedValueOnce(new InvalidSignature()),
        }),
      }
    })

    it("should return a response with a bad request status code and a message signaling that there's wrong signature in the creation request", () => {
      return expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: "The provided signature is invalid",
        },
      })
    })
  })

  describe("and the listing creation fails with an unknown error", () => {
    beforeEach(() => {
      components = {
        rentals: createTestRentalsComponent({
          createRentalListing: jest.fn().mockRejectedValueOnce(new Error("An unknown error")),
        }),
      }
    })

    it("should propagate the error", () => {
      return expect(rentalsListingsCreationHandler({ components, verification, request })).rejects.toThrowError(
        "An unknown error"
      )
    })
  })

  describe("and the listing creation is successful", () => {
    let createdListing: DBInsertedRentalListing
    let returnedListing: RentalListing

    beforeEach(() => {
      createdListing = {
        id: "5884c820-2612-409c-bb9e-a01e8d3569e9",
        category: NFTCategory.PARCEL,
        search_text: "someText",
        metadata_id: "someId",
        network: Network.ETHEREUM,
        chain_id: ChainId.ETHEREUM_GOERLI,
        expiration: new Date(),
        signature: "0x0",
        nonces: ["0x0", "0x1", "0x2"],
        token_id: "1",
        contract_address: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
        rental_contract_address: "0x09305998a531fade369ebe30adf868c96a34e813",
        lessor: "0x9abdcb8825696cc2ef3a0a955f99850418847f5d",
        tenant: null,
        status: RentalStatus.OPEN,
        created_at: new Date("2022-06-13T22:56:36.755Z"),
        updated_at: new Date("2022-06-13T22:56:36.755Z"),
        started_at: null,
        periods: [
          {
            row: "(0, 30, 1000000, 5884c820-2612-409c-bb9e-a01e8d3569e9)",
          },
        ],
        target: ethers.constants.AddressZero,
        rented_days: null,
        period_chosen: null,
      }
      returnedListing = fromDBInsertedRentalListingToRental(createdListing)
      components = {
        rentals: createTestRentalsComponent({
          createRentalListing: jest.fn().mockResolvedValueOnce(createdListing),
        }),
      }
    })

    it("should return a response with a created status code with the created rental listing", () => {
      return expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
        status: StatusCode.CREATED,
        body: {
          ok: true,
          data: returnedListing,
        },
      })
    })
  })
})

describe("when getting rental listings", () => {
  let url: URL
  let components: Pick<AppComponents, "rentals">
  let getRentalsListingsMock: jest.Mock

  beforeEach(() => {
    getRentalsListingsMock = jest.fn()
    components = {
      rentals: createTestRentalsComponent({ getRentalsListings: getRentalsListingsMock }),
    }
  })

  describe("and the request was done with a sort by that doesn't match the ones available", () => {
    const wrongValue = "SomeWrongValue"
    beforeEach(() => {
      url = new URL(`http://localhost/v1/rental-listing?sortBy=${wrongValue}`)
    })

    it("should return a response with a bad request status code and a message saying that the parameter has an invalid value", () => {
      return expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: `The value of the sortBy parameter is invalid: ${wrongValue}`,
        },
      })
    })
  })

  describe("and the request was done with a sort direction that doesn't match the ones available", () => {
    const wrongValue = "SomeWrongValue"
    beforeEach(() => {
      url = new URL(`http://localhost/v1/rental-listing?sortDirection=${wrongValue}`)
    })

    it("should return a response with a bad request status code and a message saying that the parameter has an invalid value", () => {
      return expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: `The value of the sortDirection parameter is invalid: ${wrongValue}`,
        },
      })
    })
  })

  describe("and the request was done with a category filter that doesn't match the ones available", () => {
    const wrongValue = "SomeWrongValue"
    beforeEach(() => {
      url = new URL(`http://localhost/v1/rental-listing?category=${wrongValue}`)
    })

    it("should return a response with a bad request status code and a message saying that the parameter has an invalid value", () => {
      return expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: `The value of the category parameter is invalid: ${wrongValue}`,
        },
      })
    })
  })

  describe("and the request was done with a status filter that doesn't match the ones available", () => {
    const wrongValue = "SomeWrongValue"
    beforeEach(() => {
      url = new URL(`http://localhost/v1/rental-listing?status=${wrongValue}`)
    })

    it("should return a response with a bad request status code and a message saying that the parameter has an invalid value", () => {
      return expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: `The value of the status parameter is invalid: ${wrongValue}`,
        },
      })
    })
  })

  describe("and the process to get the listings fails with an unknown error", () => {
    const errorMessage = "Something wrong happened"
    beforeEach(() => {
      url = new URL("http://localhost/v1/rental-listing")
      getRentalsListingsMock.mockRejectedValueOnce(new Error(errorMessage))
    })

    it("should propagate the error", () => {
      return expect(getRentalsListingsHandler({ components, url })).rejects.toThrowError(errorMessage)
    })
  })

  describe("and the process was done with multiple statuses as filters", () => {
    beforeEach(() => {
      getRentalsListingsMock.mockResolvedValueOnce([])
      url = new URL("http://localhost/v1/rental-listing?status=executed&status=open")
    })

    it("should get the rental listings according to the multiple statuses being asked for", async () => {
      await expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.OK,
        body: {
          ok: true,
          data: {
            results: [],
            total: 0,
            page: 0,
            pages: 0,
            limit: 50,
          },
        },
      })

      expect(getRentalsListingsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          filterBy: expect.objectContaining({ status: [RentalStatus.EXECUTED, RentalStatus.OPEN] }),
        }),
        false
      )
    })
  })

  describe("and the process was done with a single status as filter", () => {
    beforeEach(() => {
      getRentalsListingsMock.mockResolvedValueOnce([])
      url = new URL("http://localhost/v1/rental-listing?status=executed")
    })

    it("should get the rental listings according to the single status being asked for", async () => {
      await expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.OK,
        body: {
          ok: true,
          data: {
            results: [],
            total: 0,
            page: 0,
            pages: 0,
            limit: 50,
          },
        },
      })

      expect(getRentalsListingsMock).toHaveBeenCalledWith(
        expect.objectContaining({ filterBy: expect.objectContaining({ status: [RentalStatus.EXECUTED] }) }),
        false
      )
    })
  })

  describe("and the process was done with history as a parameter", () => {
    let dbRentalListings: DBGetRentalListing[]
    let rentalListings: RentalListing[]

    beforeEach(() => {
      dbRentalListings = [
        {
          id: "5884c820-2612-409c-bb9e-a01e8d3569e9",
          category: NFTCategory.PARCEL,
          search_text: "someText",
          metadata_id: "someId",
          network: Network.ETHEREUM,
          chain_id: ChainId.ETHEREUM_GOERLI,
          expiration: new Date(),
          signature: "0x0",
          nonces: ["0x0", "0x1", "0x2"],
          token_id: "1",
          contract_address: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
          rental_contract_address: "0x09305998a531fade369ebe30adf868c96a34e813",
          lessor: "0x9abdcb8825696cc2ef3a0a955f99850418847f5d",
          tenant: null,
          status: RentalStatus.OPEN,
          created_at: new Date("2022-06-13T22:56:36.755Z"),
          updated_at: new Date("2022-06-13T22:56:36.755Z"),
          started_at: null,
          periods: [["30", "50", "1000000000"]],
          metadata_created_at: new Date(),
          rentals_listings_count: "1",
          target: ethers.constants.AddressZero,
          rented_days: null,
          period_chosen: null,
        },
      ]
      rentalListings = [
        {
          id: dbRentalListings[0].id,
          nftId: dbRentalListings[0].metadata_id,
          category: dbRentalListings[0].category,
          searchText: dbRentalListings[0].search_text,
          network: dbRentalListings[0].network,
          chainId: dbRentalListings[0].chain_id,
          expiration: dbRentalListings[0].expiration.getTime(),
          signature: dbRentalListings[0].signature,
          nonces: dbRentalListings[0].nonces,
          tokenId: dbRentalListings[0].token_id,
          contractAddress: dbRentalListings[0].contract_address,
          rentalContractAddress: dbRentalListings[0].rental_contract_address,
          lessor: dbRentalListings[0].lessor,
          tenant: dbRentalListings[0].tenant,
          status: dbRentalListings[0].status,
          createdAt: dbRentalListings[0].created_at.getTime(),
          updatedAt: dbRentalListings[0].updated_at.getTime(),
          startedAt: null,
          periods: [
            {
              minDays: Number(dbRentalListings[0].periods[0][0]),
              maxDays: Number(dbRentalListings[0].periods[0][1]),
              pricePerDay: dbRentalListings[0].periods[0][2],
            },
          ],
          target: ethers.constants.AddressZero,
          rentedDays: null,
        },
      ]
      getRentalsListingsMock.mockResolvedValueOnce(dbRentalListings)
    })

    describe("and the history parameter is set as false", () => {
      beforeEach(() => {
        url = new URL("http://localhost/v1/rental-listing?history=false")
      })

      it("should return a response with an ok status code and the listings history", async () => {
        await expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
          status: StatusCode.OK,
          body: {
            ok: true,
            data: {
              results: rentalListings,
              total: 1,
              page: 0,
              pages: 1,
              limit: 50,
            },
          },
        })
        expect(getRentalsListingsMock).toHaveBeenCalledWith(expect.anything(), false)
      })
    })

    describe("and the history parameter is set as true", () => {
      beforeEach(() => {
        url = new URL("http://localhost/v1/rental-listing?history=true")
      })

      it("should return a response with an ok status code and the historic listings", async () => {
        await expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
          status: StatusCode.OK,
          body: {
            ok: true,
            data: {
              results: rentalListings,
              total: 1,
              page: 0,
              pages: 1,
              limit: 50,
            },
          },
        })
        expect(getRentalsListingsMock).toHaveBeenCalledWith(expect.anything(), true)
      })
    })
  })

  describe("and the process to get the listing is successful", () => {
    let dbRentalListings: DBGetRentalListing[]
    let rentalListings: RentalListing[]

    beforeEach(() => {
      dbRentalListings = [
        {
          id: "5884c820-2612-409c-bb9e-a01e8d3569e9",
          category: NFTCategory.PARCEL,
          search_text: "someText",
          metadata_id: "someId",
          network: Network.ETHEREUM,
          chain_id: ChainId.ETHEREUM_GOERLI,
          expiration: new Date(),
          signature: "0x0",
          nonces: ["0x0", "0x1", "0x2"],
          token_id: "1",
          contract_address: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
          rental_contract_address: "0x09305998a531fade369ebe30adf868c96a34e813",
          lessor: "0x9abdcb8825696cc2ef3a0a955f99850418847f5d",
          tenant: null,
          status: RentalStatus.OPEN,
          created_at: new Date("2022-06-13T22:56:36.755Z"),
          updated_at: new Date("2022-06-13T22:56:36.755Z"),
          started_at: null,
          periods: [["30", "50", "1000000000"]],
          metadata_created_at: new Date(),
          rentals_listings_count: "1",
          target: ethers.constants.AddressZero,
          rented_days: null,
          period_chosen: null,
        },
      ]
      rentalListings = [
        {
          id: dbRentalListings[0].id,
          nftId: dbRentalListings[0].metadata_id,
          category: dbRentalListings[0].category,
          searchText: dbRentalListings[0].search_text,
          network: dbRentalListings[0].network,
          chainId: dbRentalListings[0].chain_id,
          expiration: dbRentalListings[0].expiration.getTime(),
          signature: dbRentalListings[0].signature,
          nonces: dbRentalListings[0].nonces,
          tokenId: dbRentalListings[0].token_id,
          contractAddress: dbRentalListings[0].contract_address,
          rentalContractAddress: dbRentalListings[0].rental_contract_address,
          lessor: dbRentalListings[0].lessor,
          tenant: dbRentalListings[0].tenant,
          status: dbRentalListings[0].status,
          createdAt: dbRentalListings[0].created_at.getTime(),
          updatedAt: dbRentalListings[0].updated_at.getTime(),
          startedAt: null,
          periods: [
            {
              minDays: Number(dbRentalListings[0].periods[0][0]),
              maxDays: Number(dbRentalListings[0].periods[0][1]),
              pricePerDay: dbRentalListings[0].periods[0][2],
            },
          ],
          target: ethers.constants.AddressZero,
          rentedDays: null,
        },
      ]
      getRentalsListingsMock.mockResolvedValueOnce(dbRentalListings)
    })

    it("should return a response with an ok status code and the listings", () => {
      return expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.OK,
        body: {
          ok: true,
          data: {
            results: rentalListings,
            total: 1,
            page: 0,
            pages: 1,
            limit: 50,
          },
        },
      })
    })
  })
})

describe("when refreshing a rental listing", () => {
  let params: { id: string }
  let rentalId: string
  let components: Pick<AppComponents, "rentals">
  let refreshRentalListingMock: jest.Mock

  beforeEach(() => {
    refreshRentalListingMock = jest.fn()
    rentalId = "aRentalId"
    components = {
      rentals: createTestRentalsComponent({ refreshRentalListing: refreshRentalListingMock }),
    }
    params = { id: rentalId }
  })

  describe("and the process to refresh the listing fails with an unknown error", () => {
    let errorMessage: string
    beforeEach(() => {
      errorMessage = "An error occurred"
      refreshRentalListingMock.mockRejectedValueOnce(new Error(errorMessage))
    })

    it("should propagate the error", () => {
      return expect(refreshRentalListingHandler({ components, params })).rejects.toThrowError(errorMessage)
    })
  })

  describe("and the process to refresh the listing fails with a rental not found error", () => {
    beforeEach(() => {
      refreshRentalListingMock.mockRejectedValueOnce(new RentalNotFound(rentalId))
    })

    it("should return a response with a not found status code and a message saying that the rental was not found", () => {
      return expect(refreshRentalListingHandler({ components, params })).resolves.toEqual({
        status: StatusCode.NOT_FOUND,
        body: {
          ok: false,
          message: "The rental was not found",
          data: {
            id: rentalId,
          },
        },
      })
    })
  })

  describe("and the process to refresh the listing fails with a nft not found error", () => {
    let contractAddress: string
    let tokenId: string
    beforeEach(() => {
      contractAddress = "aContractAddress"
      tokenId = "aTokenId"
      refreshRentalListingMock.mockRejectedValueOnce(new NFTNotFound(contractAddress, tokenId))
    })

    it("should return a response with a not found status code and a message saying that the nft was not found", () => {
      return expect(refreshRentalListingHandler({ components, params })).resolves.toEqual({
        status: StatusCode.NOT_FOUND,
        body: {
          ok: false,
          message: "The NFT was not found",
          data: {
            contractAddress,
            tokenId,
          },
        },
      })
    })
  })

  describe("and the process to refresh the listing is successful", () => {
    let rentalListing: RentalListing
    let dbRentalListing: DBGetRentalListing
    beforeEach(() => {
      dbRentalListing = {
        id: "5884c820-2612-409c-bb9e-a01e8d3569e9",
        category: NFTCategory.PARCEL,
        search_text: "someText",
        metadata_id: "someId",
        network: Network.ETHEREUM,
        chain_id: ChainId.ETHEREUM_GOERLI,
        expiration: new Date(),
        signature: "0x0",
        nonces: ["0x0", "0x1", "0x2"],
        token_id: "1",
        contract_address: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
        rental_contract_address: "0x09305998a531fade369ebe30adf868c96a34e813",
        lessor: "0x9abdcb8825696cc2ef3a0a955f99850418847f5d",
        tenant: null,
        status: RentalStatus.OPEN,
        created_at: new Date("2022-06-13T22:56:36.755Z"),
        updated_at: new Date("2022-06-13T22:56:36.755Z"),
        started_at: null,
        periods: [["30", "50", "1000000000"]],
        metadata_created_at: new Date(),
        rentals_listings_count: "1",
        target: ethers.constants.AddressZero,
        rented_days: null,
        period_chosen: null,
      }
      rentalListing = {
        id: dbRentalListing.id,
        nftId: dbRentalListing.metadata_id,
        category: dbRentalListing.category,
        searchText: dbRentalListing.search_text,
        network: dbRentalListing.network,
        chainId: dbRentalListing.chain_id,
        expiration: dbRentalListing.expiration.getTime(),
        signature: dbRentalListing.signature,
        nonces: dbRentalListing.nonces,
        tokenId: dbRentalListing.token_id,
        contractAddress: dbRentalListing.contract_address,
        rentalContractAddress: dbRentalListing.rental_contract_address,
        lessor: dbRentalListing.lessor,
        tenant: dbRentalListing.tenant,
        status: dbRentalListing.status,
        createdAt: dbRentalListing.created_at.getTime(),
        updatedAt: dbRentalListing.updated_at.getTime(),
        startedAt: null,
        periods: [
          {
            minDays: Number(dbRentalListing.periods[0][0]),
            maxDays: Number(dbRentalListing.periods[0][1]),
            pricePerDay: dbRentalListing.periods[0][2],
          },
        ],
        target: ethers.constants.AddressZero,
        rentedDays: null,
      }
      refreshRentalListingMock.mockResolvedValueOnce(dbRentalListing)
    })

    it("should return a response with a not found status code and a message saying that the nft was not found", () => {
      return expect(refreshRentalListingHandler({ components, params })).resolves.toEqual({
        status: StatusCode.OK,
        body: {
          ok: true,
          data: rentalListing,
        },
      })
    })
  })
})
