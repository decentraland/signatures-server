import * as authorizationMiddleware from "decentraland-crypto-middleware"
import { fromDBInsertedRentalListingToRental } from "../../adapters/rentals"
import { NFTNotFound, RentalAlreadyExists, UnauthorizedToRent } from "../../ports/rentals"
import { HandlerContextWithPath, StatusCode } from "../../types"

// handlers arguments only type what they need, to make unit testing easier
export async function rentalsListingsCreationHandler(
  context: Pick<HandlerContextWithPath<"rentals", "/rentals-listing">, "request" | "components"> &
    authorizationMiddleware.DecentralandSignatureContext
) {
  const {
    request,
    components: { rentals },
    verification,
  } = context
  const body = await request.clone().json()
  const signerAddress: string | undefined = verification?.auth

  if (!signerAddress) {
    return {
      status: StatusCode.UNAUTHORIZED,
      body: {
        ok: false,
        message: "Unauthorized",
        data: undefined,
      },
    }
  }

  try {
    const rental = await rentals.createRentalListing(body, signerAddress)
    return {
      status: StatusCode.CREATED,
      body: {
        ok: true,
        data: fromDBInsertedRentalListingToRental(rental),
      },
    }
  } catch (error) {
    if (error instanceof NFTNotFound) {
      return {
        status: StatusCode.NOT_FOUND,
        body: {
          ok: false,
          message: error.message,
          data: {
            tokenId: error.tokenId,
            contractAddress: error.contractAddress,
          },
        },
      }
    } else if (error instanceof UnauthorizedToRent) {
      return {
        status: StatusCode.UNAUTHORIZED,
        body: {
          ok: false,
          message: error.message,
          data: {
            ownerAddress: error.ownerAddress,
            lessorAddress: error.lessorAddress,
          },
        },
      }
    } else if (error instanceof RentalAlreadyExists) {
      return {
        status: StatusCode.CONFLICT,
        body: {
          ok: false,
          message: error.message,
          data: {
            contractAddress: error.contractAddress,
            tokenId: error.tokenId,
          },
        },
      }
    }

    throw error
  }
}

export async function refreshRentalListingHandler(
  context: Pick<HandlerContextWithPath<"rentals", "/rentals-listing/:id">, "request" | "components">
) {
  const {
    components: { rentals },
  } = context
  // context.request.body

  try {
    const rental = await rentals.refreshRentalListing("id")
    return {
      status: StatusCode.CREATED,
      body: {
        ok: true,
        data: "data",
      },
    }
  } catch (error) {
    return {
      status: StatusCode.BAD_REQUEST,
      body: {
        ok: false,
        message: "Error",
      },
    }
  }
}
