import { NFTCategory, RentalStatus } from "@dcl/schemas"
import { IndexerIndexUpdateType, IndexUpdateEventType } from "../../src/ports/rentals"
import { test } from "../components"
import { createDbHelper, DbHelper, SeededListing } from "../utils/db-helper"
import { resetToUnexpected } from "../utils/mocks"

/**
 * These suites run the periodic jobs against the real database. They are the ones that exercise the
 * statements the jobs build, which a mocked database cannot validate: a query that postgres refuses
 * to parse looks perfectly fine to a jest mock.
 */
test("when running the rental listing jobs", function ({ components, stubComponents }) {
  let dbHelper: DbHelper
  let lessor: string
  let rentalContractAddress: string

  beforeEach(async () => {
    resetToUnexpected(stubComponents.marketplaceSubgraph.query, "marketplaceSubgraph.query")
    resetToUnexpected(stubComponents.rentalsSubgraph.query, "rentalsSubgraph.query")

    dbHelper = createDbHelper(components.database)
    await dbHelper.clear()
    await dbHelper.setLastUpdate("indexes", new Date(0))
    await dbHelper.setLastUpdate("rentals", new Date(0))

    lessor = "0x705c1a693cb6a63578451d52e182a02bc8cb2deb"
    rentalContractAddress = "0x92159c78f0f4523b9c60382bb888f30f10a46b3b"
  })

  afterEach(async () => {
    await dbHelper.clear()
  })

  describe("and the rental contract bumped its index", () => {
    let listing: SeededListing
    let listingOfAnotherContract: SeededListing

    beforeEach(async () => {
      listing = await dbHelper.seedListing({ lessor, rentalContractAddress, nonces: ["0", "0", "0"] })
      listingOfAnotherContract = await dbHelper.seedListing({
        lessor,
        rentalContractAddress: "0x1111111111111111111111111111111111111111",
        nonces: ["0", "0", "0"],
      })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
        indexesUpdateHistories: [
          {
            id: "1",
            date: "1",
            type: IndexerIndexUpdateType.CONTRACT,
            contractUpdate: { id: "1", contractAddress: rentalContractAddress, newIndex: "1" },
          },
        ],
      })

      await components.rentals.cancelRentalsListings()
    })

    it("should cancel the listings signed against that rental contract", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
    })

    it("should leave the listings of other rental contracts open", async () => {
      await expect(dbHelper.getListingStatus(listingOfAnotherContract.id)).resolves.toBe(RentalStatus.OPEN)
    })

    it("should record that the update ran", async () => {
      const { rows } = await components.database.query<{ updated_at: Date }>(
        "SELECT updated_at FROM updates WHERE type = 'indexes'"
      )
      expect(rows[0].updated_at.getTime()).toBeGreaterThan(0)
    })
  })

  describe("and a signer bumped their index", () => {
    let listing: SeededListing
    let listingOfAnotherLessor: SeededListing

    beforeEach(async () => {
      listing = await dbHelper.seedListing({ lessor, nonces: ["0", "0", "0"] })
      listingOfAnotherLessor = await dbHelper.seedListing({
        lessor: "0x2222222222222222222222222222222222222222",
        nonces: ["0", "0", "0"],
      })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
        indexesUpdateHistories: [
          {
            id: "1",
            date: "1",
            type: IndexerIndexUpdateType.SIGNER,
            signerUpdate: { id: "1", signer: lessor, newIndex: "1" },
          },
        ],
      })

      await components.rentals.cancelRentalsListings()
    })

    it("should cancel the listings of that signer", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
    })

    it("should leave the listings of other signers open", async () => {
      await expect(dbHelper.getListingStatus(listingOfAnotherLessor.id)).resolves.toBe(RentalStatus.OPEN)
    })
  })

  describe("and an asset index was bumped by a cancellation", () => {
    let listing: SeededListing
    let listingOfAnotherAsset: SeededListing

    beforeEach(async () => {
      listing = await dbHelper.seedListing({ lessor, tokenId: "100", nonces: ["0", "0", "0"] })
      listingOfAnotherAsset = await dbHelper.seedListing({ lessor, tokenId: "200", nonces: ["0", "0", "0"] })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
        indexesUpdateHistories: [
          {
            id: "1",
            date: "1",
            type: IndexerIndexUpdateType.ASSET,
            assetUpdate: {
              id: "1",
              type: IndexUpdateEventType.CANCEL,
              contractAddress: listing.contractAddress,
              tokenId: "100",
              signer: lessor,
              newIndex: "1",
            },
          },
        ],
      })

      await components.rentals.cancelRentalsListings()
    })

    it("should cancel the listings of that asset", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
    })

    it("should leave the listings of other assets open", async () => {
      await expect(dbHelper.getListingStatus(listingOfAnotherAsset.id)).resolves.toBe(RentalStatus.OPEN)
    })
  })

  describe("and another signer bumped their own index for the asset", () => {
    let listing: SeededListing

    beforeEach(async () => {
      listing = await dbHelper.seedListing({ lessor, tokenId: "100", nonces: ["0", "0", "0"] })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
        indexesUpdateHistories: [
          {
            id: "1",
            date: "1",
            type: IndexerIndexUpdateType.ASSET,
            assetUpdate: {
              id: "1",
              type: IndexUpdateEventType.CANCEL,
              contractAddress: listing.contractAddress,
              tokenId: "100",
              signer: "0x4444444444444444444444444444444444444444",
              newIndex: "1",
            },
          },
        ],
      })

      await components.rentals.cancelRentalsListings()
    })

    it("should leave the listing of the lessor open", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.OPEN)
    })
  })

  describe("and an asset index was bumped by a rent starting", () => {
    let listing: SeededListing

    beforeEach(async () => {
      listing = await dbHelper.seedListing({ lessor, tokenId: "100", nonces: ["0", "0", "0"] })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
        indexesUpdateHistories: [
          {
            id: "1",
            date: "1",
            type: IndexerIndexUpdateType.ASSET,
            assetUpdate: {
              id: "1",
              type: IndexUpdateEventType.RENT,
              contractAddress: listing.contractAddress,
              tokenId: "100",
              signer: lessor,
              newIndex: "1",
            },
          },
        ],
      })

      await components.rentals.cancelRentalsListings()
    })

    it("should leave the listing open, as renting it does not invalidate it", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.OPEN)
    })
  })

  describe("and a listing was executed on chain", () => {
    let listing: SeededListing
    let startedAt: number

    beforeEach(async () => {
      startedAt = Math.round(Date.now() / 1000)
      listing = await dbHelper.seedListing({
        lessor,
        rentalContractAddress,
        updatedAt: new Date(0),
        periods: [{ minDays: 30, maxDays: 30, pricePerDay: "10000" }],
      })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
        rentals: [
          {
            id: "aRentalId",
            contractAddress: listing.contractAddress,
            rentalContractAddress,
            tokenId: listing.tokenId,
            lessor,
            tenant: "0x3333333333333333333333333333333333333333",
            operator: lessor,
            rentalDays: "30",
            startedAt: startedAt.toString(),
            endsAt: (startedAt + 100000).toString(),
            updatedAt: startedAt.toString(),
            pricePerDay: "10000",
            sender: lessor,
            signature: listing.signature,
            ownerHasClaimedAsset: false,
          },
        ],
      })

      await components.rentals.updateRentalsListings()
    })

    it("should mark the listing as executed", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.EXECUTED)
    })

    it("should record the period that was rented", async () => {
      const { rows } = await components.database.query<{ period_chosen: string; rented_days: number }>(
        `SELECT period_chosen, rented_days FROM rentals WHERE id = '${listing.id}'`
      )
      expect(rows[0]).toEqual(
        expect.objectContaining({ rented_days: 30, period_chosen: expect.any(String) })
      )
    })

    it("should record the tenant of the listing", async () => {
      const { rows } = await components.database.query<{ tenant: string }>(
        `SELECT tenant FROM rentals_listings WHERE id = '${listing.id}'`
      )
      expect(rows[0].tenant).toBe("0x3333333333333333333333333333333333333333")
    })
  })

  describe("and the metadata of an nft changed in the indexer", () => {
    let listing: SeededListing
    let indexerNFT: Record<string, unknown>

    /** Builds the indexer answer for the nft backing the seeded listing. */
    function buildIndexerNFT(overrides: Record<string, unknown> = {}) {
      return {
        id: listing.metadataId,
        category: NFTCategory.PARCEL,
        contractAddress: listing.contractAddress,
        tokenId: listing.tokenId,
        owner: { address: lessor },
        searchText: "10,20",
        searchIsLand: true,
        searchEstateSize: 0,
        searchDistanceToPlaza: 7,
        searchAdjacentToRoad: true,
        createdAt: "1000000",
        updatedAt: "2000000",
        ...overrides,
      }
    }

    beforeEach(async () => {
      await dbHelper.setLastUpdate("metadata", new Date(0))
      listing = await dbHelper.seedListing({ lessor, rentalContractAddress, searchText: "0,0" })
      indexerNFT = buildIndexerNFT()
    })

    describe("and the indexer has no updated nfts", () => {
      beforeEach(async () => {
        stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({ nfts: [] })
        await components.rentals.updateMetadata()
      })

      it("should leave the stored metadata untouched", async () => {
        await expect(dbHelper.getMetadata(listing.metadataId)).resolves.toEqual(
          expect.objectContaining({ search_text: "0,0" })
        )
      })

      it("should record that the update ran", async () => {
        await expect(dbHelper.getLastUpdate("metadata")).resolves.not.toEqual(new Date(0))
      })
    })

    describe("and the indexer reports a recent update timestamp", () => {
      let indexerUpdatedAtInSeconds: number

      beforeEach(async () => {
        indexerUpdatedAtInSeconds = Math.floor(new Date("2026-01-15T00:00:00.000Z").getTime() / 1000)
        stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
          nfts: [buildIndexerNFT({ updatedAt: indexerUpdatedAtInSeconds.toString() })],
        })
        await components.rentals.updateMetadata()
      })

      it("should store the update timestamp of the indexer", async () => {
        const metadata = await dbHelper.getMetadata(listing.metadataId)
        expect(metadata?.updated_at).toEqual(new Date(indexerUpdatedAtInSeconds * 1000))
      })
    })

    describe("and the nft is not stored", () => {
      beforeEach(async () => {
        stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
          nfts: [buildIndexerNFT({ id: "an-nft-that-is-not-stored" })],
        })
        await components.rentals.updateMetadata()
      })

      it("should not insert it", async () => {
        await expect(dbHelper.getMetadata("an-nft-that-is-not-stored")).resolves.toBeUndefined()
      })

      it("should leave the listing open", async () => {
        await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.OPEN)
      })
    })

    describe("and the owner of the asset did not change", () => {
      beforeEach(async () => {
        stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({ nfts: [indexerNFT] })
        await components.rentals.updateMetadata()
      })

      it("should update the stored metadata", async () => {
        await expect(dbHelper.getMetadata(listing.metadataId)).resolves.toEqual(
          expect.objectContaining({
            search_text: "10,20",
            distance_to_plaza: 7,
            adjacent_to_road: true,
          })
        )
      })

      it("should leave the listing open", async () => {
        await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.OPEN)
      })
    })

    describe("and the asset was transferred away from the lessor", () => {
      beforeEach(async () => {
        stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
          nfts: [buildIndexerNFT({ owner: { address: "0x9999999999999999999999999999999999999999" } })],
        })
        await components.rentals.updateMetadata()
      })

      it("should cancel the listing", async () => {
        await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
      })
    })

    describe("and the Rentals contract holds the asset on behalf of the lessor", () => {
      beforeEach(async () => {
        stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
          nfts: [buildIndexerNFT({ owner: { address: rentalContractAddress } })],
        })
        stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({ rentals: [{ lessor }] })
        await components.rentals.updateMetadata()
      })

      it("should leave the listing open, as the lessor can still rent the asset out", async () => {
        await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.OPEN)
      })

      it("should still update the stored metadata", async () => {
        await expect(dbHelper.getMetadata(listing.metadataId)).resolves.toEqual(
          expect.objectContaining({ search_text: "10,20" })
        )
      })
    })

    describe("and the Rentals contract holds the asset on behalf of a different lessor", () => {
      beforeEach(async () => {
        stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
          nfts: [buildIndexerNFT({ owner: { address: rentalContractAddress } })],
        })
        stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
          rentals: [{ lessor: "0x9999999999999999999999999999999999999999" }],
        })
        await components.rentals.updateMetadata()
      })

      it("should cancel the listing", async () => {
        await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
      })
    })

    describe("and the estate backing the listing was dissolved", () => {
      beforeEach(async () => {
        stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
          nfts: [buildIndexerNFT({ category: NFTCategory.ESTATE, searchEstateSize: 0 })],
        })
        await components.rentals.updateMetadata()
      })

      it("should cancel the listing", async () => {
        await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
      })
    })

    describe("and the nft has no open listing", () => {
      beforeEach(async () => {
        await dbHelper.clear()
        await dbHelper.setLastUpdate("metadata", new Date(0))
        listing = await dbHelper.seedListing({ lessor, status: RentalStatus.CANCELLED, searchText: "0,0" })
        stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({ nfts: [buildIndexerNFT()] })
        await components.rentals.updateMetadata()
      })

      it("should update its metadata anyway", async () => {
        await expect(dbHelper.getMetadata(listing.metadataId)).resolves.toEqual(
          expect.objectContaining({ search_text: "10,20" })
        )
      })
    })

    describe("and the indexer fails half way through the update", () => {
      beforeEach(async () => {
        stubComponents.marketplaceSubgraph.query.mockRejectedValueOnce(new Error("The indexer is down"))
        await components.rentals.updateMetadata()
      })

      it("should not propagate the error", () => {
        expect(true).toBe(true)
      })

      it("should roll the transaction back, leaving the last update untouched", async () => {
        await expect(dbHelper.getLastUpdate("metadata")).resolves.toEqual(new Date(0))
      })
    })
  })

  describe("and the asset of an executed listing was claimed back by its owner", () => {
    let listing: SeededListing
    let startedAt: number

    beforeEach(async () => {
      startedAt = Math.round(Date.now() / 1000)
      listing = await dbHelper.seedListing({ lessor, rentalContractAddress, updatedAt: new Date(0) })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
        rentals: [
          {
            id: "aRentalId",
            contractAddress: listing.contractAddress,
            rentalContractAddress,
            tokenId: listing.tokenId,
            lessor,
            tenant: "0x3333333333333333333333333333333333333333",
            operator: lessor,
            rentalDays: "30",
            startedAt: startedAt.toString(),
            endsAt: (startedAt + 100000).toString(),
            updatedAt: startedAt.toString(),
            pricePerDay: "10000",
            sender: lessor,
            signature: listing.signature,
            ownerHasClaimedAsset: true,
          },
        ],
      })

      await components.rentals.updateRentalsListings()
    })

    it("should mark the listing as claimed", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CLAIMED)
    })
  })

  describe("and the indexer reports a rental that is not stored", () => {
    let tokenId: string
    let contractAddress: string
    let indexerRental: Record<string, unknown>

    beforeEach(() => {
      tokenId = "987654"
      contractAddress = "0x959e104e1a4db6317fa58f8295f586e1a978c297"
      indexerRental = {
        id: "aRentalId",
        contractAddress,
        rentalContractAddress,
        tokenId,
        lessor,
        tenant: "0x3333333333333333333333333333333333333333",
        operator: lessor,
        rentalDays: "30",
        startedAt: Math.round(Date.now() / 1000).toString(),
        endsAt: Math.round(Date.now() / 1000 + 100000).toString(),
        updatedAt: Math.round(Date.now() / 1000).toString(),
        pricePerDay: "10000",
        sender: lessor,
        signature: `0x${"b".repeat(128)}1b`,
        ownerHasClaimedAsset: false,
      }
    })

    describe("and its metadata is not stored either", () => {
      beforeEach(async () => {
        stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({ rentals: [indexerRental] })
        stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
          nfts: [
            {
              id: "a-backfilled-nft",
              category: NFTCategory.PARCEL,
              contractAddress,
              tokenId,
              owner: { address: lessor },
              searchText: "30,40",
              searchIsLand: true,
              searchEstateSize: 0,
              searchDistanceToPlaza: 1,
              searchAdjacentToRoad: true,
              createdAt: "1000000",
              updatedAt: "2000000",
            },
          ],
        })

        await components.rentals.updateRentalsListings()
      })

      it("should backfill the metadata from the indexer", async () => {
        await expect(dbHelper.getMetadata("a-backfilled-nft")).resolves.toEqual(
          expect.objectContaining({ search_text: "30,40" })
        )
      })

      it("should store the rental as executed", async () => {
        const { rows } = await components.database.query<{ status: RentalStatus; metadata_id: string }>(
          `SELECT status, metadata_id FROM rentals WHERE token_id = '${tokenId}'`
        )
        expect(rows[0]).toEqual({ status: RentalStatus.EXECUTED, metadata_id: "a-backfilled-nft" })
      })

      it("should store the lessor and the tenant of the rental", async () => {
        const { rows } = await components.database.query<{ lessor: string; tenant: string }>(
          `SELECT rl.lessor, rl.tenant FROM rentals_listings rl, rentals r
           WHERE r.id = rl.id AND r.token_id = '${tokenId}'`
        )
        expect(rows[0]).toEqual({ lessor, tenant: "0x3333333333333333333333333333333333333333" })
      })
    })

    describe("and its metadata is already stored", () => {
      let existing: SeededListing

      beforeEach(async () => {
        existing = await dbHelper.seedListing({ lessor, contractAddress, tokenId, status: RentalStatus.CANCELLED })
        indexerRental.tokenId = existing.tokenId
        stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({ rentals: [indexerRental] })

        await components.rentals.updateRentalsListings()
      })

      it("should reuse the stored metadata instead of asking the indexer for it", async () => {
        const { rows } = await components.database.query<{ metadata_id: string }>(
          `SELECT metadata_id FROM rentals WHERE token_id = '${existing.tokenId}' AND status = 'executed'`
        )
        expect(rows[0].metadata_id).toBe(existing.metadataId)
      })
    })
  })

  describe("and the indexer fails while the rentals are being updated", () => {
    let listing: SeededListing

    beforeEach(async () => {
      listing = await dbHelper.seedListing({ lessor, expiration: new Date(Date.now() - 60 * 1000) })
      stubComponents.rentalsSubgraph.query.mockRejectedValueOnce(new Error("The indexer is down"))

      await components.rentals.updateRentalsListings()
    })

    it("should roll the transaction back, leaving the expired listing open", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.OPEN)
    })

    it("should leave the last update untouched", async () => {
      await expect(dbHelper.getLastUpdate("rentals")).resolves.toEqual(new Date(0))
    })
  })

  describe("and no index was bumped since the last run", () => {
    let listing: SeededListing

    beforeEach(async () => {
      listing = await dbHelper.seedListing({ lessor, rentalContractAddress })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({ indexesUpdateHistories: [] })

      await components.rentals.cancelRentalsListings()
    })

    it("should leave the listings untouched", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.OPEN)
    })

    it("should still record that the update ran", async () => {
      const lastUpdate = await dbHelper.getLastUpdate("indexes")
      expect(lastUpdate?.getTime()).toBeGreaterThan(0)
    })
  })

  describe("and the index update history is requested from the indexer", () => {
    let query: string

    beforeEach(async () => {
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({ indexesUpdateHistories: [] })
      await components.rentals.cancelRentalsListings()
      query = stubComponents.rentalsSubgraph.query.mock.calls[0][0]
    })

    // The subgraph schema names this field singerUpdate. A stubbed subgraph answers with whatever the
    // spec hands it, so the only way to pin the field the real query asks for is the query itself.
    it("should alias the misspelled signer field so the job can read signerUpdate", () => {
      expect(query.replace(/\s+/g, " ")).toEqual(expect.stringContaining("signerUpdate: singerUpdate {"))
    })
  })

  describe("and an index bump reaches listings that should not or should be matched", () => {
    let openListing: SeededListing
    let executedListing: SeededListing
    let claimedListing: SeededListing
    let seededAt: Date

    /** Answers the indexer with a single contract index bump to the given index. */
    function mockContractBump(newIndex: string) {
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
        indexesUpdateHistories: [
          {
            id: "1",
            date: "1",
            type: IndexerIndexUpdateType.CONTRACT,
            contractUpdate: { id: "1", contractAddress: rentalContractAddress, newIndex },
          },
        ],
      })
    }

    beforeEach(async () => {
      seededAt = new Date("2020-01-01T00:00:00.000Z")
      openListing = await dbHelper.seedListing({
        lessor,
        rentalContractAddress,
        nonces: ["0", "0", "0"],
        updatedAt: seededAt,
      })
      executedListing = await dbHelper.seedListing({
        lessor,
        rentalContractAddress,
        status: RentalStatus.EXECUTED,
        nonces: ["0", "0", "0"],
        updatedAt: seededAt,
      })
      claimedListing = await dbHelper.seedListing({
        lessor,
        rentalContractAddress,
        status: RentalStatus.CLAIMED,
        nonces: ["0", "0", "0"],
        updatedAt: seededAt,
      })
      mockContractBump("1")
      await components.rentals.cancelRentalsListings()
    })

    it("should cancel the open listing", async () => {
      await expect(dbHelper.getListingStatus(openListing.id)).resolves.toBe(RentalStatus.CANCELLED)
    })

    it("should not rewrite the executed listing, which is rental history", async () => {
      await expect(dbHelper.getListingStatus(executedListing.id)).resolves.toBe(RentalStatus.EXECUTED)
    })

    it("should not rewrite the claimed listing", async () => {
      await expect(dbHelper.getListingStatus(claimedListing.id)).resolves.toBe(RentalStatus.CLAIMED)
    })

    it("should advance the updated at of the cancelled listing, so updatedAfter consumers see it", async () => {
      const updatedAt = await dbHelper.getListingUpdatedAt(openListing.id)
      expect(updatedAt?.getTime()).toBeGreaterThan(seededAt.getTime())
    })
  })

  describe("and the stored nonce has fewer digits than the new index", () => {
    let listing: SeededListing

    beforeEach(async () => {
      listing = await dbHelper.seedListing({ lessor, rentalContractAddress, nonces: ["9", "0", "0"] })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
        indexesUpdateHistories: [
          {
            id: "1",
            date: "1",
            type: IndexerIndexUpdateType.CONTRACT,
            contractUpdate: { id: "1", contractAddress: rentalContractAddress, newIndex: "10" },
          },
        ],
      })

      await components.rentals.cancelRentalsListings()
    })

    it("should compare the nonces as numbers and cancel the listing", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
    })
  })

  describe("and the listing was stored with a checksummed casing", () => {
    let listing: SeededListing

    beforeEach(async () => {
      listing = await dbHelper.seedListing({
        lessor: lessor.toUpperCase().replace("0X", "0x"),
        rentalContractAddress: rentalContractAddress.toUpperCase().replace("0X", "0x"),
        nonces: ["0", "0", "0"],
      })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({
        indexesUpdateHistories: [
          {
            id: "1",
            date: "1",
            type: IndexerIndexUpdateType.SIGNER,
            signerUpdate: { id: "1", signer: lessor, newIndex: "1" },
          },
        ],
      })

      await components.rentals.cancelRentalsListings()
    })

    it("should still match the signer and cancel the listing", async () => {
      await expect(dbHelper.getListingStatus(listing.id)).resolves.toBe(RentalStatus.CANCELLED)
    })
  })

  describe("and a cancellation happens through the metadata job", () => {
    let listing: SeededListing
    let seededAt: Date

    beforeEach(async () => {
      seededAt = new Date("2020-01-01T00:00:00.000Z")
      await dbHelper.setLastUpdate("metadata", new Date(0))
      listing = await dbHelper.seedListing({ lessor, rentalContractAddress, updatedAt: seededAt })
      stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
        nfts: [
          {
            id: listing.metadataId,
            category: NFTCategory.PARCEL,
            contractAddress: listing.contractAddress,
            tokenId: listing.tokenId,
            owner: { address: "0x9999999999999999999999999999999999999999" },
            searchText: "10,20",
            searchIsLand: true,
            searchEstateSize: 0,
            searchDistanceToPlaza: 1,
            searchAdjacentToRoad: true,
            createdAt: "1000000",
            updatedAt: Math.floor(Date.now() / 1000).toString(),
          },
        ],
      })

      await components.rentals.updateMetadata()
    })

    it("should advance the updated at, so updatedAfter consumers see the cancellation", async () => {
      const updatedAt = await dbHelper.getListingUpdatedAt(listing.id)
      expect(updatedAt?.getTime()).toBeGreaterThan(seededAt.getTime())
    })
  })

  describe("and an expired listing is closed by the rentals job", () => {
    let expiredListing: SeededListing
    let seededAt: Date

    beforeEach(async () => {
      seededAt = new Date("2020-01-01T00:00:00.000Z")
      expiredListing = await dbHelper.seedListing({
        lessor,
        expiration: new Date(Date.now() - 60 * 1000),
        updatedAt: seededAt,
      })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({ rentals: [] })

      await components.rentals.updateRentalsListings()
    })

    it("should advance the updated at of the expired listing", async () => {
      const updatedAt = await dbHelper.getListingUpdatedAt(expiredListing.id)
      expect(updatedAt?.getTime()).toBeGreaterThan(seededAt.getTime())
    })
  })

  describe("and an open listing expired", () => {
    let expiredListing: SeededListing

    beforeEach(async () => {
      expiredListing = await dbHelper.seedListing({ lessor, expiration: new Date(Date.now() - 60 * 1000) })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({ rentals: [] })

      await components.rentals.updateRentalsListings()
    })

    it("should cancel the expired listing", async () => {
      await expect(dbHelper.getListingStatus(expiredListing.id)).resolves.toBe(RentalStatus.CANCELLED)
    })
  })
})
