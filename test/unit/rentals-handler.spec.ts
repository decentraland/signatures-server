import { ChainId, Network } from "@dcl/schemas"
import * as authorizationMiddleware from "decentraland-crypto-middleware"
import { fromDBInsertedRentalListingToRental, RentalListing } from "../../src/adapters/rentals"
import { rentalsListingsCreationHandler } from "../../src/controllers/handlers/rentals-handlers"
import {
  DBInsertedRentalListing,
  NFTNotFound,
  RentalAlreadyExists,
  Status,
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
      expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
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
      expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
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
      expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
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
      expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
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

  describe("and the listing creation fails with an unknown error", () => {
    beforeEach(() => {
      components = {
        rentals: createTestRentalsComponent({
          createRentalListing: jest.fn().mockRejectedValueOnce(new Error("An unknown error")),
        }),
      }
    })

    it("should propagate the error", () => {
      expect(rentalsListingsCreationHandler({ components, verification, request })).rejects.toThrowError(
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
        metadata_id: "someId",
        network: Network.ETHEREUM,
        chain_id: ChainId.ETHEREUM_GOERLI,
        expiration: Date.now(),
        signature: "0x0",
        nonces: ["0x0", "0x1", "0x2"],
        token_id: "1",
        contract_address: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
        rental_contract_address: "0x09305998a531fade369ebe30adf868c96a34e813",
        lessor: "0x9abdcb8825696cc2ef3a0a955f99850418847f5d",
        tenant: null,
        status: Status.OPEN,
        created_at: "2022-06-13T22:56:36.755Z",
        updated_at: "2022-06-13T22:56:36.755Z",
        periods: [
          {
            id: "b0c2a829-0abb-4452-89f1-194b2b0c4706",
            min_days: 0,
            max_days: 30,
            price_per_day: "1000000",
            rental_id: "5884c820-2612-409c-bb9e-a01e8d3569e9",
          },
        ],
      }
      returnedListing = fromDBInsertedRentalListingToRental(createdListing)
      components = {
        rentals: createTestRentalsComponent({
          createRentalListing: jest.fn().mockResolvedValueOnce(createdListing),
        }),
      }
    })

    it("should return a response with a created status code with the created rental listing", () => {
      expect(rentalsListingsCreationHandler({ components, verification, request })).resolves.toEqual({
        status: StatusCode.CREATED,
        body: {
          ok: true,
          data: returnedListing,
        },
      })
    })
  })
})
