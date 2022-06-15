import { Router } from "@well-known-components/http-server"
import * as authorizationMiddleware from "decentraland-crypto-middleware"
import { RentalCreationSchema } from "../ports/rentals"
import { GlobalContext } from "../types"
import { pingHandler } from "./handlers/ping-handler"
import { rentalsListingsCreationHandler } from "./handlers/rentals-handlers"

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(
  globalContext: GlobalContext
): Promise<Router<GlobalContext & authorizationMiddleware.DecentralandSignatureContext>> {
  const router = new Router<GlobalContext & authorizationMiddleware.DecentralandSignatureContext>()
  const { components } = globalContext

  router.get("/ping", pingHandler)
  router.post(
    "/rentals-listings",
    authorizationMiddleware.wellKnownComponents({}),
    components.schemaValidator.withSchemaValidatorMiddleware(RentalCreationSchema),
    rentalsListingsCreationHandler
  )

  return router
}
