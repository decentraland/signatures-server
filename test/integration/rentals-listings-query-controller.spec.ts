import { NFTCategory, RentalStatus } from "@dcl/schemas"
import { StatusCode } from "../../src/types"
import { test } from "../components"
import { createDbHelper, DbHelper, SeededListing } from "../utils/db-helper"

const LISTINGS_PATH = "/v1/rentals-listings"
const PRICES_PATH = "/v1/rental-listings/prices"

test("when querying rental listings through the API", function ({ components }) {
  let dbHelper: DbHelper
  let lessor: string

  beforeEach(async () => {
    dbHelper = createDbHelper(components.database)
    await dbHelper.clear()
    lessor = "0x705c1a693cb6a63578451d52e182a02bc8cb2deb"
  })

  afterEach(async () => {
    await dbHelper.clear()
  })

  describe("and there are listings stored", () => {
    let listing: SeededListing
    let response: Response

    beforeEach(async () => {
      listing = await dbHelper.seedListing({ lessor, searchText: "10,20" })
      response = await components.localFetch.fetch(LISTINGS_PATH)
    })

    it("should respond with a 200 and the listing with its periods", async () => {
      expect(response.status).toBe(StatusCode.OK)
      await expect(response.json()).resolves.toEqual({
        ok: true,
        data: {
          results: [
            expect.objectContaining({
              id: listing.id,
              nftId: listing.metadataId,
              lessor,
              status: RentalStatus.OPEN,
              searchText: "10,20",
              periods: [{ minDays: 30, maxDays: 30, pricePerDay: "10000" }],
            }),
          ],
          total: 1,
          page: 0,
          pages: 1,
          limit: 100,
        },
      })
    })
  })

  describe("and the listings are filtered by lessor", () => {
    let ownListing: SeededListing
    let response: Response

    beforeEach(async () => {
      ownListing = await dbHelper.seedListing({ lessor })
      await dbHelper.seedListing({ lessor: "0x2222222222222222222222222222222222222222" })
      response = await components.localFetch.fetch(`${LISTINGS_PATH}?lessor=${lessor}`)
    })

    it("should only return the listings of that lessor", async () => {
      expect(response.status).toBe(StatusCode.OK)
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ total: 1, results: [expect.objectContaining({ id: ownListing.id })] }),
        })
      )
    })
  })

  describe("and the listings are filtered by status", () => {
    let cancelledListing: SeededListing
    let response: Response

    beforeEach(async () => {
      await dbHelper.seedListing({ lessor })
      cancelledListing = await dbHelper.seedListing({ lessor, status: RentalStatus.CANCELLED })
      response = await components.localFetch.fetch(`${LISTINGS_PATH}?status=${RentalStatus.CANCELLED}`)
    })

    it("should only return the listings in that status", async () => {
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            total: 1,
            results: [expect.objectContaining({ id: cancelledListing.id, status: RentalStatus.CANCELLED })],
          }),
        })
      )
    })
  })

  describe("and the listings are filtered by a text present in the metadata", () => {
    let matchingListing: SeededListing
    let response: Response

    beforeEach(async () => {
      matchingListing = await dbHelper.seedListing({ lessor, searchText: "road plaza" })
      await dbHelper.seedListing({ lessor, searchText: "somewhere else" })
      response = await components.localFetch.fetch(`${LISTINGS_PATH}?text=plaza`)
    })

    it("should only return the listings whose metadata matches", async () => {
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            total: 1,
            results: [expect.objectContaining({ id: matchingListing.id })],
          }),
        })
      )
    })
  })

  describe("and the listings are filtered by a price range", () => {
    let cheapListing: SeededListing
    let response: Response

    beforeEach(async () => {
      cheapListing = await dbHelper.seedListing({
        lessor,
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "100" }],
      })
      await dbHelper.seedListing({ lessor, periods: [{ minDays: 7, maxDays: 7, pricePerDay: "900000" }] })
      response = await components.localFetch.fetch(`${LISTINGS_PATH}?maxPricePerDay=1000`)
    })

    it("should only return the listings within the range", async () => {
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          data: expect.objectContaining({
            total: 1,
            results: [expect.objectContaining({ id: cheapListing.id })],
          }),
        })
      )
    })
  })

  describe("and the results are paginated", () => {
    let response: Response

    beforeEach(async () => {
      await dbHelper.seedListing({ lessor, metadataId: "metadata-page-1" })
      await dbHelper.seedListing({ lessor, metadataId: "metadata-page-2" })
      response = await components.localFetch.fetch(`${LISTINGS_PATH}?limit=1&offset=1`)
    })

    it("should return the requested page", async () => {
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ total: 2, pages: 2, limit: 1, results: [expect.anything()] }),
        })
      )
    })
  })

  describe("and the offset is negative", () => {
    let response: Response

    beforeEach(async () => {
      await dbHelper.seedListing({ lessor })
      response = await components.localFetch.fetch(`${LISTINGS_PATH}?offset=-500`)
    })

    it("should respond with a 200 instead of letting postgres reject the OFFSET", async () => {
      expect(response.status).toBe(StatusCode.OK)
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ ok: true, data: expect.objectContaining({ total: 1 }) })
      )
    })
  })

  describe("and a filter has a value outside of its accepted set", () => {
    let response: Response

    beforeEach(async () => {
      response = await components.localFetch.fetch(`${LISTINGS_PATH}?status=not-a-status`)
    })

    it("should respond with a 400 describing the invalid parameter", async () => {
      expect(response.status).toBe(StatusCode.BAD_REQUEST)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        message: "The value of the status parameter is invalid: not-a-status",
      })
    })
  })

  describe("and a text filter carries a SQL fragment", () => {
    let response: Response

    beforeEach(async () => {
      await dbHelper.seedListing({ lessor, searchText: "10,20" })
      response = await components.localFetch.fetch(`${LISTINGS_PATH}?text=${encodeURIComponent("' OR 1=1 --")}`)
    })

    it("should treat it as a literal and match nothing", async () => {
      expect(response.status).toBe(StatusCode.OK)
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ data: expect.objectContaining({ total: 0, results: [] }) })
      )
    })

    it("should not have dropped the seeded listing", async () => {
      const { rowCount } = await components.database.query("SELECT id FROM rentals")
      expect(rowCount).toBe(1)
    })
  })

  describe("and the prices of the open listings are requested", () => {
    let response: Response

    beforeEach(async () => {
      await dbHelper.seedListing({ lessor, periods: [{ minDays: 7, maxDays: 7, pricePerDay: "10000" }] })
      await dbHelper.seedListing({ lessor, periods: [{ minDays: 7, maxDays: 7, pricePerDay: "10000" }] })
      await dbHelper.seedListing({
        lessor,
        category: NFTCategory.ESTATE,
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "20000" }],
      })
      response = await components.localFetch.fetch(PRICES_PATH)
    })

    it("should respond with a 200 and the count of listings per price", async () => {
      expect(response.status).toBe(StatusCode.OK)
      await expect(response.json()).resolves.toEqual({ ok: true, data: { "10000": 2, "20000": 1 } })
    })
  })

  describe("and the prices are filtered by category", () => {
    let response: Response

    beforeEach(async () => {
      await dbHelper.seedListing({ lessor, periods: [{ minDays: 7, maxDays: 7, pricePerDay: "10000" }] })
      await dbHelper.seedListing({
        lessor,
        category: NFTCategory.ESTATE,
        periods: [{ minDays: 7, maxDays: 7, pricePerDay: "20000" }],
      })
      response = await components.localFetch.fetch(`${PRICES_PATH}?category=${NFTCategory.ESTATE}`)
    })

    it("should only count the listings of that category", async () => {
      await expect(response.json()).resolves.toEqual({ ok: true, data: { "20000": 1 } })
    })
  })
})
