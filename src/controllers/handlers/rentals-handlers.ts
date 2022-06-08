import { NFTNotFound, UnauthorizedToRent } from "../../ports/rentals/errors"
import { HandlerContextWithPath, StatusCode } from "../../types"

// handlers arguments only type what they need, to make unit testing easier
export async function createRentalsHandler(
  context: Pick<HandlerContextWithPath<"rentals", "/rentals">, "url" | "request" | "components">
) {
  const {
    url,
    request,
    components: { rentals },
  } = context

  const body = await request.clone().json()

  try {
    const rental = await rentals.createRental(body, "anAddress")
    return {
      status: StatusCode.CREATED,
      body: {
        ok: true,
        data: rental,
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
    }

    throw error
  }
}
