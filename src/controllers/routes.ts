import { Router } from "@well-known-components/http-server"
// import * as authorizationMiddleware from "decentraland-crypto-middleware"
import { RentalCreationSchema } from "../ports/rentals"
import { withSchemaValidatorMiddleware } from "../logic/schema-validator-middleware"
import { GlobalContext } from "../types"
import { pingHandler } from "./handlers/ping-handler"
import { createRentalsHandler } from "./handlers/rentals-handlers"

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(globalContext: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()

  router.get("/ping", pingHandler)
  router.post(
    "/rentals",
    // authorizationMiddleware.wellKnownComponents({}),
    withSchemaValidatorMiddleware(globalContext.components, RentalCreationSchema),
    createRentalsHandler
  )

  return router
}
