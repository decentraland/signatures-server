import { ChainId, Network, NFTCategory } from "@dcl/schemas"
import { IHttpServerComponent } from "@well-known-components/interfaces"
import { fromDBInsertedRentalListingToRental, RentalListing } from "../../src/adapters/rentals"
import {
  getRentalsListingsHandler,
  refreshRentalListingHandler,
  rentalsListingsCreationHandler,
} from "../../src/controllers/handlers/rentals-handlers"
import {
  DBGetRentalListing,
  DBInsertedRentalListing,
  NFTNotFound,
  RentalAlreadyExists,
  RentalNotFound,
  Status,
  UnauthorizedToRent,
} from "../../src/ports/rentals"
import { StatusCode } from "../../src/types"
import { test } from "../components"

function mockedRequest(json: any): IHttpServerComponent.IRequest {
  const req = {
    clone() {
      return req
    },
    json() {
      return json
    },
  } as any
  return req
}

describe("when creating a new rental listing", () => {
  // params
  const contractAddress: string = "0x1"
  const tokenId: string = "1"
  const verification = { auth: "0x0", authMetadata: {} }
  const request = mockedRequest({ aTestProp: "someValue" })

  test("and the request is not authenticated", ({ components, stubComponents }) => {
    it("should return an unauthorized response", async () => {
      return expect(rentalsListingsCreationHandler({ components, verification: undefined, request })).resolves.toEqual({
        status: StatusCode.UNAUTHORIZED,
        body: {
          ok: false,
          message: "Unauthorized",
          data: undefined,
        },
      })
    })
  })

  test("and the listing creation fails with a NFT not found error", ({ stubComponents, components }) => {
    it("should return a response with a not found status code and a message signaling that the NFT was not found", async () => {
      // setup
      stubComponents.rentals.createRentalListing.rejects(new NFTNotFound(contractAddress, tokenId))

      // assert
      await expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
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

  test("and the listing creation fails with a NFT not found error", ({ stubComponents, components }) => {
    it("should return a response with an unauthorized status code and a message signaling that the user is not authorized to rent the asset", async () => {
      // params
      const ownerAddress: string = "0x1"
      const lessorAddress: string = "0x02"

      // setup
      stubComponents.rentals.createRentalListing.rejects(new UnauthorizedToRent(ownerAddress, lessorAddress))

      // assert
      await expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
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

  test("and the listing creation fails with a rental already exists error", ({ components, stubComponents }) => {
    it("should return a response with a conflict status code and a message signaling that there's already a rental for the asset", async () => {
      // setup
      stubComponents.rentals.createRentalListing.rejects(new RentalAlreadyExists(contractAddress, tokenId))

      // assert
      await expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
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

  test("and the listing creation fails with an unknown error", ({ components, stubComponents }) => {
    it("should propagate the error", async () => {
      // setup
      stubComponents.rentals.createRentalListing.rejects(new Error("An unknown error"))

      // assert
      await expect(rentalsListingsCreationHandler({ components, verification, request })).rejects.toThrowError(
        "An unknown error"
      )
    })
  })

  test("and the listing creation is successful", ({ components, stubComponents }) => {
    it("should return a response with a created status code with the created rental listing", async () => {
      // params
      const createdListing: DBInsertedRentalListing = {
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
        status: Status.OPEN,
        created_at: new Date("2022-06-13T22:56:36.755Z"),
        updated_at: new Date("2022-06-13T22:56:36.755Z"),
        started_at: null,
        periods: [
          {
            min_days: 0,
            max_days: 30,
            price_per_day: "1000000",
            rental_id: "5884c820-2612-409c-bb9e-a01e8d3569e9",
          },
        ],
      }
      const returnedListing = fromDBInsertedRentalListingToRental(createdListing)

      // setup
      stubComponents.rentals.createRentalListing.resolves(createdListing)

      // assert
      await expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
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
  test("and the request was done with a sort by that doesn't match the ones available", ({
    stubComponents,
    components,
  }) => {
    it("should return a response with a bad request status code and a message saying that the parameter has an invalid value", () => {
      // params
      const wrongValue = "SomeWrongValue"
      const url = new URL(`http://localhost/v1/rental-listing?sortBy=${wrongValue}`)

      // setup
      stubComponents.rentals.getRentalsListings.resolves([])
      // assert
      return expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: `The value of the sortBy parameter is invalid: ${wrongValue}`,
        },
      })
    })
  })

  test("and the request was done with a sort direction that doesn't match the ones available", ({ components }) => {
    it("should return a response with a bad request status code and a message saying that the parameter has an invalid value", () => {
      // params
      const wrongValue = "SomeWrongValue"
      const url = new URL(`http://localhost/v1/rental-listing?sortDirection=${wrongValue}`)

      // assert
      return expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: `The value of the sortDirection parameter is invalid: ${wrongValue}`,
        },
      })
    })
  })

  test("and the request was done with a category filter that doesn't match the ones available", ({ components }) => {
    it("should return a response with a bad request status code and a message saying that the parameter has an invalid value", () => {
      // params
      const wrongValue = "SomeWrongValue"
      const url = new URL(`http://localhost/v1/rental-listing?category=${wrongValue}`)

      // assert
      return expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: `The value of the category parameter is invalid: ${wrongValue}`,
        },
      })
    })
  })

  test("and the request was done with a status filter that doesn't match the ones available", ({ components }) => {
    it("should return a response with a bad request status code and a message saying that the parameter has an invalid value", () => {
      // params
      const wrongValue = "SomeWrongValue"
      const url = new URL(`http://localhost/v1/rental-listing?status=${wrongValue}`)

      // assert
      return expect(getRentalsListingsHandler({ components, url })).resolves.toEqual({
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: `The value of the status parameter is invalid: ${wrongValue}`,
        },
      })
    })
  })

  test("and the process to get the listings fails with an unknown error", ({ components, stubComponents }) => {
    it("should propagate the error", () => {
      // params
      const errorMessage = "Something wrong happened"
      const url = new URL("http://localhost/v1/rental-listing")

      // setup
      stubComponents.rentals.getRentalsListings.rejects(new Error(errorMessage))

      // assert
      return expect(getRentalsListingsHandler({ components, url })).rejects.toThrowError(errorMessage)
    })
  })

  test("and the process to get the listing is successful", ({ components, stubComponents }) => {
    it("should return a response with an ok status code and the listings", () => {
      // params
      const url = new URL("http://localhost/v1/rental-listing")
      const dbRentalListings: DBGetRentalListing[] = [
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
          status: Status.OPEN,
          created_at: new Date("2022-06-13T22:56:36.755Z"),
          updated_at: new Date("2022-06-13T22:56:36.755Z"),
          started_at: null,
          periods: [["30", "50", "1000000000"]],
          metadata_created_at: new Date(),
          rentals_listings_count: "1",
        },
      ]
      const rentalListings: RentalListing[] = [
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
        },
      ]

      // setup
      stubComponents.rentals.getRentalsListings.resolves(dbRentalListings)

      // assert
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
  const rentalId: string = "aRentalId"
  const params = { id: rentalId }

  test("and the process to refresh the listing fails with an unknown error", ({ components, stubComponents }) => {
    it("should propagate the error", () => {
      // params
      const errorMessage: string = "An error occurred"

      // setup
      stubComponents.rentals.refreshRentalListing.rejects(new Error(errorMessage))

      // assert
      return expect(refreshRentalListingHandler({ components, params })).rejects.toThrowError(errorMessage)
    })
  })

  test("and the process to refresh the listing fails with a rental not found error", ({
    components,
    stubComponents,
  }) => {
    it("should return a response with a not found status code and a message saying that the rental was not found", () => {
      // setup
      stubComponents.rentals.refreshRentalListing.rejects(new RentalNotFound(rentalId))
      // assert
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

  test("and the process to refresh the listing fails with a nft not found error", ({ stubComponents, components }) => {
    it("should return a response with a not found status code and a message saying that the nft was not found", () => {
      // params
      const contractAddress: string = "aContractAddress"
      const tokenId: string = "aTokenId"

      // setup
      stubComponents.rentals.refreshRentalListing.rejects(new NFTNotFound(contractAddress, tokenId))

      // assert
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

  test("and the process to refresh the listing is successful", ({ components, stubComponents }) => {
    const dbRentalListing: DBGetRentalListing = {
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
      status: Status.OPEN,
      created_at: new Date("2022-06-13T22:56:36.755Z"),
      updated_at: new Date("2022-06-13T22:56:36.755Z"),
      started_at: null,
      periods: [["30", "50", "1000000000"]],
      metadata_created_at: new Date(),
      rentals_listings_count: "1",
    }
    const rentalListing: RentalListing = {
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
    }

    it("should return a response with a not found status code and a message saying that the nft was not found", () => {
      // setup
      stubComponents.rentals.refreshRentalListing.resolves(dbRentalListing)

      // assert
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
