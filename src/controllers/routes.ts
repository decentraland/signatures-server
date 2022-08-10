import { RentalListingCreation } from "@dcl/schemas"
import { Router } from "@well-known-components/http-server"
import * as authorizationMiddleware from "decentraland-crypto-middleware"
import { GlobalContext } from "../types"
import { pingHandler } from "./handlers/ping-handler"
import {
  refreshRentalListingHandler,
  rentalsListingsCreationHandler,
  getRentalsListingsHandler,
} from "./handlers/rentals-handlers"

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(
  globalContext: GlobalContext
): Promise<Router<GlobalContext & authorizationMiddleware.DecentralandSignatureContext>> {
  const router = new Router<GlobalContext & authorizationMiddleware.DecentralandSignatureContext>()
  const { components } = globalContext

  router.get("/ping", pingHandler)
  router.post(
    "/v1/rentals-listings",
    authorizationMiddleware.wellKnownComponents({ optional: false }),
    components.schemaValidator.withSchemaValidatorMiddleware(RentalListingCreation.schema),
    rentalsListingsCreationHandler
  )
  router.get("/v1/rentals-listings", getRentalsListingsHandler)
  router.patch("/v1/rentals-listings/:id", refreshRentalListingHandler)

  return router
}
