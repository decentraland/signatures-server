import { RentalListingCreation } from "@dcl/schemas"
import { Router } from "@well-known-components/http-server"
import * as authorizationMiddleware from "decentraland-crypto-middleware"
import { GlobalContext } from "../types"
import { pingHandler } from "./handlers/ping-handler"
import {
  refreshRentalListingHandler,
  rentalsListingsCreationHandler,
  getRentalsListingsHandler,
  getRentalListingsPricesHandler,
} from "./handlers/rentals-handlers"
import RequestError from "decentraland-crypto-middleware/lib/errors"

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(
  globalContext: GlobalContext
): Promise<Router<GlobalContext & authorizationMiddleware.DecentralandSignatureContext>> {
  const router = new Router<GlobalContext & authorizationMiddleware.DecentralandSignatureContext>()
  const { components } = globalContext

  router.get("/ping", pingHandler)
  router.post(
    "/v1/rentals-listings",
    authorizationMiddleware.wellKnownComponents({
      optional: false,
      expiration: 5 * 60 * 1000, // 5 minutes,
      verifyMetadataContent: (authMetadata: Record<string, any> | undefined) => {
        if (authMetadata && authMetadata.signer === "decentraland-kernel-scene") {
          throw new RequestError("Invalid signer", 400)
        }
        return true
      },
    }),
    components.schemaValidator.withSchemaValidatorMiddleware(RentalListingCreation.schema),
    rentalsListingsCreationHandler
  )
  router.get("/v1/rentals-listings", getRentalsListingsHandler)
  router.patch("/v1/rentals-listings/:id", refreshRentalListingHandler)
  router.get("/v1/rental-listings/prices", getRentalListingsPricesHandler)

  return router
}
