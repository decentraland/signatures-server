import {
  Network,
  RentalsListingsFilterBy,
  RentalsListingsFilterByCategory,
  RentalsListingSortDirection,
  RentalsListingsSortBy,
  RentalStatus,
} from "@dcl/schemas"
import * as authorizationMiddleware from "decentraland-crypto-middleware"
import { ethers } from "ethers"
import { fromDBGetRentalsListingsPricesToRentalListingsPrices, fromDBGetRentalsListingsToRentalListings, fromDBInsertedRentalListingToRental } from "../../adapters/rentals"
import {
  getBooleanParameter,
  getNumberParameter,
  getPaginationParams,
  getTypedArrayStringQueryParameter,
  getTypedStringQueryParameter,
  InvalidParameterError,
} from "../../logic/http"
import { ContractNotFound } from "../../logic/rentals/errors"
import {
  InvalidEstate,
  InvalidSignature,
  NFTNotFound,
  RentalAlreadyExists,
  RentalAlreadyExpired,
  RentalNotFound,
  UnauthorizedToRent,
} from "../../ports/rentals"
import { HandlerContextWithPath, StatusCode } from "../../types"

export async function getRentalsListingsHandler(
  context: Pick<HandlerContextWithPath<"rentals", "/v1/rentals-listing">, "url" | "components"> &
    authorizationMiddleware.DecentralandSignatureContext
) {
  const {
    url,
    components: { rentals },
  } = context

  const { limit, offset } = getPaginationParams(url.searchParams)
  try {
    const sortBy = getTypedStringQueryParameter(Object.values(RentalsListingsSortBy), url.searchParams, "sortBy")
    const sortDirection = getTypedStringQueryParameter(
      Object.values(RentalsListingSortDirection),
      url.searchParams,
      "sortDirection"
    )
    const getHistoricData = url.searchParams.get("history") === "true"
    const filterBy: RentalsListingsFilterBy = {
      category:
        getTypedStringQueryParameter(Object.values(RentalsListingsFilterByCategory), url.searchParams, "category") ??
        undefined,
      text: url.searchParams.get("text") ?? undefined,
      lessor: url.searchParams.get("lessor") ?? undefined,
      tenant: url.searchParams.get("tenant") ?? undefined,
      status: getTypedArrayStringQueryParameter(Object.values(RentalStatus), url.searchParams, "status"),
      tokenId: url.searchParams.get("tokenId") ?? undefined,
      contractAddresses: url.searchParams.getAll("contractAddresses"),
      nftIds: url.searchParams.getAll("nftIds"),
      network:
        (getTypedStringQueryParameter(Object.values(Network), url.searchParams, "network") as Network) ?? undefined,
      updatedAfter: url.searchParams.get("updatedAfter") ? Number(url.searchParams.get("updatedAfter")) : undefined,
      target: url.searchParams.get("target") ?? ethers.constants.AddressZero,
      minPricePerDay: url.searchParams.get("minPricePerDay") ?? undefined,
      maxPricePerDay: url.searchParams.get("maxPricePerDay") ?? undefined,
      minDistanceToPlaza: getNumberParameter("minDistanceToPlaza", url.searchParams.get("minDistanceToPlaza")),
      maxDistanceToPlaza: getNumberParameter("maxDistanceToPlaza", url.searchParams.get("maxDistanceToPlaza")),
      minEstateSize: getNumberParameter("minEstateSize", url.searchParams.get("minEstateSize")),
      maxEstateSize: getNumberParameter("maxEstateSize", url.searchParams.get("maxEstateSize")),
      adjacentToRoad: getBooleanParameter("adjacentToRoad", url.searchParams.get("adjacentToRoad")),
      rentalDays: url.searchParams.getAll("rentalDays").map((value) => getNumberParameter("rentalDays", value)).filter(Boolean) as number[]
    }
    const rentalListings = await rentals.getRentalsListings(
      {
        sortBy,
        sortDirection,
        offset,
        limit,
        filterBy,
      },
      getHistoricData
    )

    return {
      status: StatusCode.OK,
      body: {
        ok: true,
        data: {
          results: fromDBGetRentalsListingsToRentalListings(rentalListings),
          total: rentalListings.length > 0 ? Number(rentalListings[0].rentals_listings_count) : 0,
          page: Math.floor(offset / limit),
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
    } else if (error instanceof InvalidEstate) {
      return {
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: error.message,
          data: {
            contractAddress: error.contractAddress,
            tokenId: error.tokenId,
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
    } else if (error instanceof InvalidSignature) {
      return {
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: error.message,
        },
      }
    } else if (error instanceof ContractNotFound) {
      return {
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: error.message,
          data: {
            contractName: error.contractName,
            chainId: error.chainId,
          },
        },
      }
    } else if (error instanceof RentalAlreadyExpired) {
      return {
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: error.message,
          data: {
            contractAddress: error.contractAddress,
            tokenId: error.tokenId,
            expiration: error.expiration,
          },
        },
      }
    }

    throw error
  }
}

export async function refreshRentalListingHandler(
  context: Pick<HandlerContextWithPath<"rentals", "/rentals-listing/:id">, "params" | "url" | "components">
) {
  const {
    url,
    components: { rentals },
    params: { id },
  } = context

  try {
    const forceMetadataRefresh = getBooleanParameter("forceMetadataRefresh", url.searchParams.get("forceMetadataRefresh"))
    const updatedRental = await rentals.refreshRentalListing(id, forceMetadataRefresh)
    return {
      status: StatusCode.OK,
      body: {
        ok: true,
        data: fromDBGetRentalsListingsToRentalListings([updatedRental])[0],
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
    } else if (error instanceof NFTNotFound) {
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
    } else if (error instanceof InvalidParameterError) {
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

export async function getRentalListingsPricesHandler(
  context: Pick<HandlerContextWithPath<"rentals", "/rentals-listing/prices">, "url" | "components">
) {
  const {
    url,
    components: { rentals },
  } = context

  try {
    const filters = {
      adjacentToRoad: getBooleanParameter('adjacentToRoad', url.searchParams.get('adjacentToRoad')),
      minDistanceToPlaza: getNumberParameter('minDistanceToPlaza', url.searchParams.get('minDistanceToPlaza')),
      maxDistanceToPlaza: getNumberParameter('maxDistanceToPlaza', url.searchParams.get('maxDistanceToPlaza')),
      minEstateSize: getNumberParameter('minEstateSize', url.searchParams.get('minEstateSize')),
      maxEstateSize: getNumberParameter('maxEstateSize', url.searchParams.get('maxEstateSize')),
    }

    const rentalListingsPrices = await rentals.getRentalListingsPrices(filters)
    return {
      status: StatusCode.OK,
      body: {
        ok: true,
        data: {
          results: fromDBGetRentalsListingsPricesToRentalListingsPrices(rentalListingsPrices)
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
