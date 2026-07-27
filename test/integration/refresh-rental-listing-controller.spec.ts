import { NFTCategory, RentalStatus } from "@dcl/schemas"
import { fromMillisecondsToSeconds } from "../../src/adapters/rentals"
import { StatusCode } from "../../src/types"
import { test } from "../components"
import { createDbHelper, DbHelper, SeededListing } from "../utils/db-helper"
import { resetToUnexpected } from "../utils/mocks"

test("when refreshing a rental listing through the API", function ({ components, stubComponents }) {
  let dbHelper: DbHelper
  let listing: SeededListing
  let lessor: string
  let rentalContractAddress: string
  let seededAt: Date
  let indexerNFT: Record<string, unknown>

  beforeEach(async () => {
    resetToUnexpected(stubComponents.marketplaceSubgraph.query, "marketplaceSubgraph.query")
    resetToUnexpected(stubComponents.rentalsSubgraph.query, "rentalsSubgraph.query")

    dbHelper = createDbHelper(components.database)
    await dbHelper.clear()

    lessor = "0x705c1a693cb6a63578451d52e182a02bc8cb2deb"
    rentalContractAddress = "0x92159c78f0f4523b9c60382bb888f30f10a46b3b"
    seededAt = new Date(Math.round(Date.now() / 1000) * 1000)
    listing = await dbHelper.seedListing({ lessor, rentalContractAddress, updatedAt: seededAt })

    // Updated after the stored metadata, so the refresh enters the branch that may cancel
    indexerNFT = {
      id: listing.metadataId,
      category: NFTCategory.PARCEL,
      contractAddress: listing.contractAddress,
      tokenId: listing.tokenId,
      owner: { address: lessor },
      searchText: "10,20",
      searchIsLand: true,
      searchEstateSize: 0,
      searchDistanceToPlaza: 3,
      searchAdjacentToRoad: true,
      createdAt: (fromMillisecondsToSeconds(seededAt.getTime()) + 10000).toString(),
      updatedAt: (fromMillisecondsToSeconds(seededAt.getTime()) + 10000).toString(),
    }
  })

  afterEach(async () => {
    await dbHelper.clear()
  })

  describe("and there is no listing with the given id", () => {
    let response: Response

    beforeEach(async () => {
      response = await components.localFetch.fetch("/v1/rentals-listings/5884c820-2612-409c-bb9e-a01e8d3569e9", {
        method: "PATCH",
      })
    })

    it("should respond with a 404", async () => {
      expect(response.status).toBe(StatusCode.NOT_FOUND)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        message: "The rental was not found",
        data: { id: "5884c820-2612-409c-bb9e-a01e8d3569e9" },
      })
    })
  })

  describe("and the Rentals contract holds the asset on behalf of the lessor", () => {
    let response: Response

    beforeEach(async () => {
      indexerNFT.owner = { address: rentalContractAddress }
      stubComponents.rentalsSubgraph.query
        // No on chain rental for the stored signature
        .mockResolvedValueOnce({ rentals: [] })
        // No index bumps
        .mockResolvedValueOnce({ contract: [], signer: [], asset: [] })
        // The rental the asset is held for, still owned by the same lessor
        .mockResolvedValueOnce({ rentals: [{ lessor }] })
      stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({ nfts: [indexerNFT] })

      response = await components.localFetch.fetch(`/v1/rentals-listings/${listing.id}`, { method: "PATCH" })
    })

    it("should respond with a 200 and the listing still open", async () => {
      expect(response.status).toBe(StatusCode.OK)
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ ok: true, data: expect.objectContaining({ status: RentalStatus.OPEN }) })
      )
    })

    it("should leave the listing open in the database", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.OPEN)
    })
  })

  describe("and the Rentals contract holds the asset on behalf of a different lessor", () => {
    let response: Response

    beforeEach(async () => {
      indexerNFT.owner = { address: rentalContractAddress }
      stubComponents.rentalsSubgraph.query
        .mockResolvedValueOnce({ rentals: [] })
        .mockResolvedValueOnce({ contract: [], signer: [], asset: [] })
        .mockResolvedValueOnce({ rentals: [{ lessor: "0x1111111111111111111111111111111111111111" }] })
      stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({ nfts: [indexerNFT] })

      response = await components.localFetch.fetch(`/v1/rentals-listings/${listing.id}`, { method: "PATCH" })
      await response.body?.cancel().catch(() => undefined)
    })

    it("should respond with a 200", () => {
      expect(response.status).toBe(StatusCode.OK)
    })

    it("should cancel the listing in the database", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
    })
  })

  describe("and the asset was transferred away from the lessor", () => {
    let response: Response

    beforeEach(async () => {
      indexerNFT.owner = { address: "0x2222222222222222222222222222222222222222" }
      stubComponents.rentalsSubgraph.query
        .mockResolvedValueOnce({ rentals: [] })
        .mockResolvedValueOnce({ contract: [], signer: [], asset: [] })
      stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({ nfts: [indexerNFT] })

      response = await components.localFetch.fetch(`/v1/rentals-listings/${listing.id}`, { method: "PATCH" })
      await response.body?.cancel().catch(() => undefined)
    })

    it("should respond with a 200", () => {
      expect(response.status).toBe(StatusCode.OK)
    })

    it("should cancel the listing in the database", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
    })
  })

  describe("and the signer bumped their index on chain", () => {
    let response: Response

    beforeEach(async () => {
      stubComponents.rentalsSubgraph.query
        .mockResolvedValueOnce({ rentals: [] })
        .mockResolvedValueOnce({ contract: [], signer: [{ newIndex: "1" }], asset: [] })
      stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({ nfts: [indexerNFT] })

      response = await components.localFetch.fetch(`/v1/rentals-listings/${listing.id}`, { method: "PATCH" })
      await response.body?.cancel().catch(() => undefined)
    })

    it("should respond with a 200", () => {
      expect(response.status).toBe(StatusCode.OK)
    })

    it("should cancel the listing in the database", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
    })
  })

  describe("and the caller asks to force a metadata refresh", () => {
    let response: Response

    beforeEach(async () => {
      indexerNFT.owner = { address: rentalContractAddress }
      // Not newer than the stored metadata, so nothing should make the refresh update it
      indexerNFT.createdAt = fromMillisecondsToSeconds(seededAt.getTime()).toString()
      indexerNFT.updatedAt = fromMillisecondsToSeconds(seededAt.getTime()).toString()
      stubComponents.rentalsSubgraph.query
        .mockResolvedValueOnce({ rentals: [] })
        .mockResolvedValueOnce({ contract: [], signer: [], asset: [] })
      stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({ nfts: [indexerNFT] })

      response = await components.localFetch.fetch(`/v1/rentals-listings/${listing.id}?forceMetadataRefresh=true`, {
        method: "PATCH",
      })
    })

    it("should ignore the parameter and leave the listing untouched", async () => {
      expect(response.status).toBe(StatusCode.OK)
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          ok: true,
          // The search text of the indexer NFT was never written to the metadata
          data: expect.objectContaining({ status: RentalStatus.OPEN, searchText: "0,0" }),
        })
      )
    })
  })
})
