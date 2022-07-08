import * as authorizationMiddleware from "decentraland-crypto-middleware"
import { fromDBGetRentalsListingsToRentalListings, fromDBInsertedRentalListingToRental } from "../../adapters/rentals"
import { getPaginationParams, getTypedStringQueryParameter, InvalidParameterError } from "../../logic/http"
import {
  FilterByCategory,
  NFTNotFound,
  RentalAlreadyExists,
  RentalNotFound,
  RentalsListingsSortBy,
  SortDirection,
  Status,
  UnauthorizedToRent,
} from "../../ports/rentals"
import { HandlerContextWithPath, StatusCode } from "../../types"

export async function getRentalsListingsHandler(
  context: Pick<HandlerContextWithPath<"rentals", "/rentals-listing">, "url" | "components"> &
    authorizationMiddleware.DecentralandSignatureContext
) {
  const {
    url,
    components: { rentals },
  } = context

  const { page, limit } = getPaginationParams(url.searchParams)

  try {
    const sortBy = getTypedStringQueryParameter(Object.values(RentalsListingsSortBy), url.searchParams, "sortBy")
    const sortDirection = getTypedStringQueryParameter(Object.values(SortDirection), url.searchParams, "sortDirection")
    const filterBy = {
      category:
        getTypedStringQueryParameter(Object.values(FilterByCategory), url.searchParams, "category") ?? undefined,
      text: url.searchParams.get("text") ?? undefined,
      lessor: url.searchParams.get("lessor") ?? undefined,
      tenant: url.searchParams.get("tenant") ?? undefined,
      status: getTypedStringQueryParameter(Object.values(Status), url.searchParams, "status") ?? undefined,
    }
    const rentalListings = await rentals.getRentalsListings({ sortBy, sortDirection, page, limit, filterBy })
    return {
      status: StatusCode.OK,
      body: {
        ok: true,
        data: {
          results: fromDBGetRentalsListingsToRentalListings(rentalListings),
          total: rentalListings.length > 0 ? Number(rentalListings[0].rentals_listings_count) : 0,
          page,
          pages: rentalListings.length > 0 ? Math.ceil(Number(rentalListings[0].rentals_listings_count) / limit) : 0,
          limit,
        },
      },
    }
  } catch (error) {
    if (error instanceof InvalidParameterError) {
      return {
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: error.message,
        },
      }
    }

    throw error
  }
}

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
  context: Pick<HandlerContextWithPath<"rentals", "/rentals-listing/:id">, "request" | "params" | "components">
) {
  const {
    components: { rentals },
    params: { id },
  } = context

  try {
    await rentals.refreshRentalListing("id")
    return {
      status: StatusCode.OK,
      body: {
        ok: true,
        data: "data",
      },
    }
  } catch (error) {
    if (error instanceof RentalNotFound) {
      return {
        status: StatusCode.NOT_FOUND,
        body: {
          ok: false,
          message: error.message,
          data: {
            id: error.id,
          },
        },
      }
    }
  }
}
