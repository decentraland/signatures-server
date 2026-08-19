import { RentalListingCreation } from "@dcl/schemas"
import { Router } from "@dcl/http-server"
import * as authorizationMiddleware from "@dcl/crypto-middleware"
import { GlobalContext } from "../types"
import { pingHandler } from "./handlers/ping-handler"
import {
  refreshRentalListingHandler,
  rentalsListingsCreationHandler,
  getRentalsListingsHandler,
  getRentalListingsPricesHandler
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
    authorizationMiddleware.wellKnownComponents({
      optional: false,
      expiration: 5 * 60 * 1000, // 5 minutes
      // Listings are created by the wallet owner, never by a scene acting on their behalf. The
      // predicate refuses a non-canonical signer rather than folding it, so a re-spelled value
      // cannot read as absent and slip past the gate, and it runs before signature verification.
      metadataValidator: authorizationMiddleware.rejectIfSigner("decentraland-kernel-scene"),
    }),
    components.schemaValidator.withSchemaValidatorMiddleware(RentalListingCreation.schema),
    rentalsListingsCreationHandler
  )
  // The read endpoints below are intentionally unauthenticated: rental listings are public data consumed by
  // the marketplace, the atlas and the nft servers without a user identity.
  router.get("/v1/rentals-listings", getRentalsListingsHandler)
  // Intentionally unauthenticated: it only re-syncs a listing against the indexers, which the periodic jobs
  // do anyway, and the marketplace polls it while waiting for a transaction to be mined. It must never apply
  // a state change that the caller could not obtain by waiting for those jobs.
  router.patch("/v1/rentals-listings/:id", refreshRentalListingHandler)
  router.get("/v1/rental-listings/prices", getRentalListingsPricesHandler)

  return router
}
