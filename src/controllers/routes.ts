import { Router } from "@well-known-components/http-server"
import { RentalCreationSchema } from "../ports/rentals"
import { pingHandler } from "./handlers/ping-handler"
import { createRentalsHandler } from "./handlers/rentals-handlers"
import { withSchemaValidatorMiddleware } from "../logic/schema-validator-middleware"
import { GlobalContext } from "../types"

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(globalContext: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()

  router.get("/ping", pingHandler)
  router.post(
    "/rentals",
    withSchemaValidatorMiddleware(globalContext.components, RentalCreationSchema),
    createRentalsHandler
  )

  return router
}
