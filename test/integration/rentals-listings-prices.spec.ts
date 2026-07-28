import { NFTCategory, RentalsListingsFilterByCategory, RentalStatus } from "@dcl/schemas"
import { GetRentalListingsPricesFilters } from "../../src/ports/rentals"
import { test } from "../components"
import { createDbHelper, DbHelper } from "../utils/db-helper"

/**
 * Aggregation of the open listing prices, run against the real database. These replace the unit
 * tests that asserted on the text of the generated statement, which could not tell whether the
 * aggregation actually counted the right listings.
 */
test("when getting the rental listing prices from the database", function ({ components }) {
  let dbHelper: DbHelper
  let prices: Record<string, number>

  /** Runs the aggregation with the given filters and returns the count of listings per price. */
  async function getPrices(filters: GetRentalListingsPricesFilters = {}): Promise<Record<string, number>> {
    const rows = await components.rentals.getRentalListingsPrices(filters)
    return rows.reduce<Record<string, number>>((acc, { price_per_day, count }) => {
      acc[price_per_day] = Number(count)
      return acc
    }, {})
  }

  beforeEach(async () => {
    dbHelper = createDbHelper(components.database)
    await dbHelper.clear()
  })

  afterEach(async () => {
    await dbHelper.clear()
  })

  describe("and no filters are applied", () => {
    beforeEach(async () => {
      await dbHelper.seedListing({ periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }] })
      await dbHelper.seedListing({ periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }] })
      await dbHelper.seedListing({ periods: [{ minDays: 7, maxDays: 7, pricePerDay: "500" }] })
      prices = await getPrices()
    })

    it("should count how many listings there are at each price", () => {
      expect(prices).toEqual({ "100": 2, "500": 1 })
    })
  })

  describe("and there are listings that are not open", () => {
    beforeEach(async () => {
      await dbHelper.seedListing({ periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }] })
      await dbHelper.seedListing({
        status: RentalStatus.CANCELLED,
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }],
      })
      await dbHelper.seedListing({
        status: RentalStatus.EXECUTED,
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }],
      })
      prices = await getPrices()
    })

    it("should only count the open ones", () => {
      expect(prices).toEqual({ "100": 1 })
    })
  })

  describe("and a listing has several periods at the same price", () => {
    beforeEach(async () => {
      await dbHelper.seedListing({
        periods: [
          { minDays: 7, maxDays: 7, pricePerDay: "100" },
          { minDays: 30, maxDays: 30, pricePerDay: "100" },
        ],
      })
      prices = await getPrices()
    })

    it("should count the listing once", () => {
      expect(prices).toEqual({ "100": 1 })
    })
  })

  describe("and the category filter is applied", () => {
    beforeEach(async () => {
      await dbHelper.seedListing({
        category: NFTCategory.PARCEL,
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }],
      })
      await dbHelper.seedListing({
        category: NFTCategory.ESTATE,
        estateSize: 4,
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "500" }],
      })
      prices = await getPrices({ category: RentalsListingsFilterByCategory.PARCEL })
    })

    it("should only count the listings of that category", () => {
      expect(prices).toEqual({ "100": 1 })
    })
  })

  describe("and the adjacentToRoad filter is applied", () => {
    beforeEach(async () => {
      await dbHelper.seedListing({ adjacentToRoad: true, periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }] })
      await dbHelper.seedListing({ adjacentToRoad: false, periods: [{ minDays: 7, maxDays: 7, pricePerDay: "500" }] })
      prices = await getPrices({ adjacentToRoad: true })
    })

    it("should only count the listings adjacent to a road", () => {
      expect(prices).toEqual({ "100": 1 })
    })
  })

  describe("and the distance to plaza filters are applied", () => {
    beforeEach(async () => {
      await dbHelper.seedListing({ distanceToPlaza: 2, periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }] })
      await dbHelper.seedListing({ distanceToPlaza: 20, periods: [{ minDays: 7, maxDays: 7, pricePerDay: "500" }] })
    })

    describe("and a minimum distance is given", () => {
      beforeEach(async () => {
        prices = await getPrices({ minDistanceToPlaza: 10 })
      })

      it("should only count the listings at or beyond it", () => {
        expect(prices).toEqual({ "500": 1 })
      })
    })

    describe("and a maximum distance is given", () => {
      beforeEach(async () => {
        prices = await getPrices({ maxDistanceToPlaza: 10 })
      })

      it("should only count the listings at or below it", () => {
        expect(prices).toEqual({ "100": 1 })
      })
    })
  })

  describe("and the estate size filters are applied", () => {
    beforeEach(async () => {
      await dbHelper.seedListing({
        category: NFTCategory.ESTATE,
        estateSize: 2,
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }],
      })
      await dbHelper.seedListing({
        category: NFTCategory.ESTATE,
        estateSize: 20,
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "500" }],
      })
    })

    describe("and a minimum size is given", () => {
      beforeEach(async () => {
        prices = await getPrices({ minEstateSize: 10 })
      })

      it("should only count the estates at or above it", () => {
        expect(prices).toEqual({ "500": 1 })
      })
    })

    describe("and a maximum size is given", () => {
      beforeEach(async () => {
        prices = await getPrices({ maxEstateSize: 10 })
      })

      it("should only count the estates at or below it", () => {
        expect(prices).toEqual({ "100": 1 })
      })
    })
  })

  describe("and the rentalDays filter is applied", () => {
    beforeEach(async () => {
      await dbHelper.seedListing({ periods: [{ minDays: 1, maxDays: 10, pricePerDay: "100" }] })
      await dbHelper.seedListing({ periods: [{ minDays: 20, maxDays: 30, pricePerDay: "500" }] })
      await dbHelper.seedListing({ periods: [{ minDays: 60, maxDays: 90, pricePerDay: "900" }] })
    })

    describe("and a single amount of days is given", () => {
      beforeEach(async () => {
        prices = await getPrices({ rentalDays: [5] })
      })

      it("should only count the listings with a period covering it", () => {
        expect(prices).toEqual({ "100": 1 })
      })
    })

    describe("and several amounts of days are given", () => {
      beforeEach(async () => {
        prices = await getPrices({ rentalDays: [5, 25] })
      })

      it("should count the listings covering any of them", () => {
        expect(prices).toEqual({ "100": 1, "500": 1 })
      })
    })
  })

  describe("and several filters are combined", () => {
    beforeEach(async () => {
      await dbHelper.seedListing({
        category: NFTCategory.ESTATE,
        estateSize: 4,
        adjacentToRoad: true,
        periods: [{ minDays: 1, maxDays: 10, pricePerDay: "100" }],
      })
      await dbHelper.seedListing({
        category: NFTCategory.ESTATE,
        estateSize: 4,
        adjacentToRoad: false,
        periods: [{ minDays: 1, maxDays: 10, pricePerDay: "500" }],
      })
      prices = await getPrices({
        category: RentalsListingsFilterByCategory.ESTATE,
        adjacentToRoad: true,
        minEstateSize: 2,
        rentalDays: [5],
      })
    })

    it("should only count the listings matching every filter", () => {
      expect(prices).toEqual({ "100": 1 })
    })
  })
})
