import {
  Network,
  NFTCategory,
  RentalsListingsFilterBy,
  RentalsListingsFilterByCategory,
  RentalsListingSortDirection,
  RentalsListingsSortBy,
  RentalStatus,
} from "@dcl/schemas"
import { test } from "../components"
import { createDbHelper, DbHelper, SeededListing } from "../utils/db-helper"

/**
 * Filtering and sorting of the rental listings, run against the real database. These replace the
 * unit tests that asserted on the text of the generated statement: matching a fragment of SQL says
 * nothing about whether postgres accepts the query or returns the right rows.
 */
test("when getting rental listings from the database", function ({ components }) {
  let dbHelper: DbHelper
  let matching: SeededListing
  let other: SeededListing
  let results: string[]

  /** Runs the query with the given filters and returns the ids of the listings it matched. */
  async function getMatchedIds(
    filterBy: RentalsListingsFilterBy & { status?: RentalStatus[] },
    options: {
      sortBy?: RentalsListingsSortBy
      sortDirection?: RentalsListingSortDirection
      getHistoricData?: boolean
    } = {}
  ): Promise<string[]> {
    const listings = await components.rentals.getRentalsListings(
      {
        offset: 0,
        limit: 100,
        sortBy: options.sortBy ?? null,
        sortDirection: options.sortDirection ?? null,
        filterBy,
      },
      options.getHistoricData
    )
    return listings.map((listing) => listing.id)
  }

  beforeEach(async () => {
    dbHelper = createDbHelper(components.database)
    await dbHelper.clear()
  })

  afterEach(async () => {
    await dbHelper.clear()
  })

  describe("and the lessor filter is set", () => {
    beforeEach(async () => {
      matching = await dbHelper.seedListing({ lessor: "0x1111111111111111111111111111111111111111" })
      other = await dbHelper.seedListing({ lessor: "0x2222222222222222222222222222222222222222" })
      results = await getMatchedIds({ lessor: matching.lessor })
    })

    it("should only match the listings of that lessor", () => {
      expect(results).toEqual([matching.id])
    })
  })

  describe("and the tenant filter is set", () => {
    let tenant: string

    beforeEach(async () => {
      tenant = "0x3333333333333333333333333333333333333333"
      matching = await dbHelper.seedListing({ tenant, status: RentalStatus.EXECUTED })
      other = await dbHelper.seedListing({ tenant: "0x4444444444444444444444444444444444444444" })
      results = await getMatchedIds({ tenant })
    })

    it("should only match the listings of that tenant", () => {
      expect(results).toEqual([matching.id])
    })
  })

  describe("and the status filter is set", () => {
    describe("and there is a single status to filter by", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ status: RentalStatus.CANCELLED })
        other = await dbHelper.seedListing({ status: RentalStatus.OPEN })
        results = await getMatchedIds({ status: [RentalStatus.CANCELLED] })
      })

      it("should only match the listings in that status", () => {
        expect(results).toEqual([matching.id])
      })
    })

    describe("and there are multiple statuses to filter by", () => {
      let executed: SeededListing

      beforeEach(async () => {
        matching = await dbHelper.seedListing({ status: RentalStatus.CANCELLED })
        executed = await dbHelper.seedListing({ status: RentalStatus.EXECUTED })
        other = await dbHelper.seedListing({ status: RentalStatus.OPEN })
        results = await getMatchedIds({ status: [RentalStatus.CANCELLED, RentalStatus.EXECUTED] })
      })

      it("should match the listings in any of those statuses", () => {
        expect(results.sort()).toEqual([matching.id, executed.id].sort())
      })
    })
  })

  describe("and the category filter is set", () => {
    beforeEach(async () => {
      matching = await dbHelper.seedListing({ category: NFTCategory.ESTATE, estateSize: 4 })
      other = await dbHelper.seedListing({ category: NFTCategory.PARCEL })
      results = await getMatchedIds({ category: RentalsListingsFilterByCategory.ESTATE })
    })

    it("should only match the listings of that category", () => {
      expect(results).toEqual([matching.id])
    })
  })

  describe("and the text filter is set", () => {
    beforeEach(async () => {
      matching = await dbHelper.seedListing({ searchText: "next to a plaza" })
      other = await dbHelper.seedListing({ searchText: "somewhere else" })
      results = await getMatchedIds({ text: "plaza" })
    })

    it("should match the listings whose metadata contains the text", () => {
      expect(results).toEqual([matching.id])
    })
  })

  describe("and the tokenId filter is set", () => {
    beforeEach(async () => {
      matching = await dbHelper.seedListing({ tokenId: "100" })
      other = await dbHelper.seedListing({ tokenId: "200" })
      results = await getMatchedIds({ tokenId: "100" })
    })

    it("should only match the listings of that token", () => {
      expect(results).toEqual([matching.id])
    })
  })

  describe("and the contract addresses filter is set", () => {
    describe("and it is an empty array", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ contractAddress: "0x1111111111111111111111111111111111111111" })
        other = await dbHelper.seedListing({ contractAddress: "0x2222222222222222222222222222222222222222" })
        results = await getMatchedIds({ contractAddresses: [] })
      })

      it("should not filter the listings by contract address", () => {
        expect(results.sort()).toEqual([matching.id, other.id].sort())
      })
    })

    describe("and it has addresses", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ contractAddress: "0x1111111111111111111111111111111111111111" })
        other = await dbHelper.seedListing({ contractAddress: "0x2222222222222222222222222222222222222222" })
        results = await getMatchedIds({ contractAddresses: [matching.contractAddress] })
      })

      it("should only match the listings of those contracts", () => {
        expect(results).toEqual([matching.id])
      })
    })
  })

  describe("and the nftIds filter is set", () => {
    beforeEach(async () => {
      matching = await dbHelper.seedListing({ metadataId: "a-matching-nft" })
      other = await dbHelper.seedListing({ metadataId: "another-nft" })
      results = await getMatchedIds({ nftIds: [matching.metadataId] })
    })

    it("should only match the listings of those nfts", () => {
      expect(results).toEqual([matching.id])
    })
  })

  describe("and the network filter is set", () => {
    beforeEach(async () => {
      matching = await dbHelper.seedListing({ network: Network.ETHEREUM })
      other = await dbHelper.seedListing({ network: Network.MATIC })
      results = await getMatchedIds({ network: Network.ETHEREUM })
    })

    it("should only match the listings of that network", () => {
      expect(results).toEqual([matching.id])
    })
  })

  describe("and the target filter is set", () => {
    let target: string

    beforeEach(async () => {
      target = "0x5555555555555555555555555555555555555555"
      matching = await dbHelper.seedListing({ target })
      other = await dbHelper.seedListing({})
      results = await getMatchedIds({ target })
    })

    it("should only match the listings aimed at that target", () => {
      expect(results).toEqual([matching.id])
    })
  })

  describe("and the updatedAfter filter is set", () => {
    let updatedAfter: number

    beforeEach(async () => {
      updatedAfter = Date.now() - 60 * 60 * 1000
      matching = await dbHelper.seedListing({ updatedAt: new Date() })
      other = await dbHelper.seedListing({ updatedAt: new Date(updatedAfter - 60 * 60 * 1000) })
      results = await getMatchedIds({ updatedAfter })
    })

    it("should only match the listings updated after that moment", () => {
      expect(results).toEqual([matching.id])
    })
  })

  describe("and the price filters are set", () => {
    describe("and only a minimum price is given", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ periods: [{ minDays: 7, maxDays: 7, pricePerDay: "5000" }] })
        other = await dbHelper.seedListing({ periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }] })
        results = await getMatchedIds({ minPricePerDay: "1000" })
      })

      it("should only match the listings at or above it", () => {
        expect(results).toEqual([matching.id])
      })
    })

    describe("and only a maximum price is given", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }] })
        other = await dbHelper.seedListing({ periods: [{ minDays: 7, maxDays: 7, pricePerDay: "5000" }] })
        results = await getMatchedIds({ maxPricePerDay: "1000" })
      })

      it("should only match the listings at or below it", () => {
        expect(results).toEqual([matching.id])
      })
    })

    describe("and both a minimum and a maximum price are given", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ periods: [{ minDays: 7, maxDays: 7, pricePerDay: "1000" }] })
        other = await dbHelper.seedListing({ periods: [{ minDays: 7, maxDays: 7, pricePerDay: "9000" }] })
        results = await getMatchedIds({ minPricePerDay: "500", maxPricePerDay: "2000" })
      })

      it("should only match the listings inside the range", () => {
        expect(results).toEqual([matching.id])
      })
    })
  })

  describe("and the distance to plaza filters are set", () => {
    describe("and only a minimum distance is given", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ distanceToPlaza: 10 })
        other = await dbHelper.seedListing({ distanceToPlaza: 1 })
        results = await getMatchedIds({ minDistanceToPlaza: 5 })
      })

      it("should only match the listings at or beyond it", () => {
        expect(results).toEqual([matching.id])
      })
    })

    describe("and only a maximum distance is given", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ distanceToPlaza: 2 })
        other = await dbHelper.seedListing({ distanceToPlaza: 20 })
        results = await getMatchedIds({ maxDistanceToPlaza: 5 })
      })

      it("should only match the listings at or below it", () => {
        expect(results).toEqual([matching.id])
      })
    })

    describe("and the listing has no known distance to a plaza", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ distanceToPlaza: 2 })
        other = await dbHelper.seedListing({ distanceToPlaza: -1 })
        results = await getMatchedIds({ maxDistanceToPlaza: 5 })
      })

      it("should not match it, as the maximum filter also excludes the negative default", () => {
        expect(results).toEqual([matching.id])
      })
    })
  })

  describe("and the estate size filters are set", () => {
    describe("and a minimum size of zero or more is given", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ category: NFTCategory.ESTATE, estateSize: 10 })
        other = await dbHelper.seedListing({ category: NFTCategory.ESTATE, estateSize: 2 })
        results = await getMatchedIds({ minEstateSize: 5 })
      })

      it("should only match the estates at or above it", () => {
        expect(results).toEqual([matching.id])
      })
    })

    describe("and a negative minimum size is given", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ category: NFTCategory.ESTATE, estateSize: 10 })
        other = await dbHelper.seedListing({ category: NFTCategory.ESTATE, estateSize: 2 })
        results = await getMatchedIds({ minEstateSize: -5 })
      })

      it("should ignore the filter", () => {
        expect(results.sort()).toEqual([matching.id, other.id].sort())
      })
    })

    describe("and a maximum size is given", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ category: NFTCategory.ESTATE, estateSize: 2 })
        other = await dbHelper.seedListing({ category: NFTCategory.ESTATE, estateSize: 10 })
        results = await getMatchedIds({ maxEstateSize: 5 })
      })

      it("should only match the estates at or below it", () => {
        expect(results).toEqual([matching.id])
      })
    })
  })

  describe("and the adjacentToRoad filter is set", () => {
    describe("and it is set to true", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ adjacentToRoad: true })
        other = await dbHelper.seedListing({ adjacentToRoad: false })
        results = await getMatchedIds({ adjacentToRoad: true })
      })

      it("should only match the listings adjacent to a road", () => {
        expect(results).toEqual([matching.id])
      })
    })

    describe("and it is set to false", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ adjacentToRoad: false })
        other = await dbHelper.seedListing({ adjacentToRoad: true })
        results = await getMatchedIds({ adjacentToRoad: false })
      })

      it("should only match the listings not adjacent to a road", () => {
        expect(results).toEqual([matching.id])
      })
    })
  })

  describe("and the rentalDays filter is set", () => {
    describe("and a single amount of days is given", () => {
      beforeEach(async () => {
        matching = await dbHelper.seedListing({ periods: [{ minDays: 1, maxDays: 10, pricePerDay: "100" }] })
        other = await dbHelper.seedListing({ periods: [{ minDays: 20, maxDays: 30, pricePerDay: "100" }] })
        results = await getMatchedIds({ rentalDays: [5] })
      })

      it("should only match the listings with a period covering it", () => {
        expect(results).toEqual([matching.id])
      })
    })

    describe("and several amounts of days are given", () => {
      let alsoMatching: SeededListing

      beforeEach(async () => {
        matching = await dbHelper.seedListing({ periods: [{ minDays: 1, maxDays: 10, pricePerDay: "100" }] })
        alsoMatching = await dbHelper.seedListing({ periods: [{ minDays: 20, maxDays: 30, pricePerDay: "100" }] })
        other = await dbHelper.seedListing({ periods: [{ minDays: 60, maxDays: 90, pricePerDay: "100" }] })
        results = await getMatchedIds({ rentalDays: [5, 25] })
      })

      it("should match the listings covering any of them", () => {
        expect(results.sort()).toEqual([matching.id, alsoMatching.id].sort())
      })
    })
  })

  describe("and several listings exist for the same nft", () => {
    let newest: SeededListing
    let oldest: SeededListing

    beforeEach(async () => {
      oldest = await dbHelper.seedListing({
        metadataId: "a-shared-nft",
        status: RentalStatus.CANCELLED,
        updatedAt: new Date(Date.now() - 60 * 60 * 1000),
      })
      newest = await dbHelper.seedListing({ metadataId: "a-shared-nft", status: RentalStatus.OPEN })
    })

    describe("and the historic data is not requested", () => {
      beforeEach(async () => {
        results = await getMatchedIds({})
      })

      it("should only match the newest listing of the nft", () => {
        expect(results).toEqual([newest.id])
      })
    })

    describe("and the historic data is requested", () => {
      beforeEach(async () => {
        results = await getMatchedIds({}, { getHistoricData: true })
      })

      it("should match every listing of the nft", () => {
        expect(results.sort()).toEqual([newest.id, oldest.id].sort())
      })
    })
  })

  describe("and a sort is requested", () => {
    let cheap: SeededListing
    let expensive: SeededListing

    beforeEach(async () => {
      cheap = await dbHelper.seedListing({
        searchText: "a first parcel",
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }],
      })
      expensive = await dbHelper.seedListing({
        searchText: "b second parcel",
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "9000" }],
      })
    })

    describe("and it is by the maximum rental price", () => {
      beforeEach(async () => {
        results = await getMatchedIds(
          {},
          { sortBy: RentalsListingsSortBy.MAX_RENTAL_PRICE, sortDirection: RentalsListingSortDirection.DESC }
        )
      })

      it("should return the most expensive listing first", () => {
        expect(results).toEqual([expensive.id, cheap.id])
      })
    })

    describe("and it is by the minimum rental price", () => {
      beforeEach(async () => {
        results = await getMatchedIds(
          {},
          { sortBy: RentalsListingsSortBy.MIN_RENTAL_PRICE, sortDirection: RentalsListingSortDirection.ASC }
        )
      })

      it("should return the cheapest listing first", () => {
        expect(results).toEqual([cheap.id, expensive.id])
      })
    })

    describe("and it is by name", () => {
      beforeEach(async () => {
        results = await getMatchedIds(
          {},
          { sortBy: RentalsListingsSortBy.NAME, sortDirection: RentalsListingSortDirection.DESC }
        )
      })

      it("should return the listings ordered by their search text", () => {
        expect(results).toEqual([expensive.id, cheap.id])
      })
    })

    describe("and it is by the rental listing date", () => {
      beforeEach(async () => {
        results = await getMatchedIds(
          {},
          {
            sortBy: RentalsListingsSortBy.RENTAL_LISTING_DATE,
            sortDirection: RentalsListingSortDirection.ASC,
          }
        )
      })

      it("should return the listings ordered by their creation date", () => {
        expect(results).toEqual([cheap.id, expensive.id])
      })
    })

    describe("and no sort is given", () => {
      beforeEach(async () => {
        results = await getMatchedIds({})
      })

      it("should return every listing with the default order applied", () => {
        expect(results.sort()).toEqual([cheap.id, expensive.id].sort())
      })
    })
  })
})
