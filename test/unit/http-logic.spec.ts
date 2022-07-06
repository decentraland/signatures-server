import { URLSearchParams } from "url"
import { getPaginationParams, getTypedStringQueryParameter, InvalidParameterError } from "../../src/logic/http"
import { FilterByCategory } from "../../src/ports/rentals"

describe("when getting the pagination params", () => {
  describe("and the limit is greater than the max limit", () => {
    it("should return the default limit", () => {
      expect(getPaginationParams(new URLSearchParams({ limit: "200" }))).toEqual({
        limit: 50,
        page: 0,
      })
    })
  })

  describe("and the limit is set to a negative number", () => {
    it("should return the default limit", () => {
      expect(getPaginationParams(new URLSearchParams({ limit: "-100" }))).toEqual({
        limit: 50,
        page: 0,
      })
    })
  })

  describe("and the limit is set to a a value that can't be parsed as a number", () => {
    it("should return the default limit", () => {
      expect(getPaginationParams(new URLSearchParams({ limit: "notAnInteger" }))).toEqual({
        limit: 50,
        page: 0,
      })
    })
  })

  describe("and the limit is set to a valid value", () => {
    it("should return the value as the limit", () => {
      expect(getPaginationParams(new URLSearchParams({ limit: "10" }))).toEqual({
        limit: 10,
        page: 0,
      })
    })
  })

  describe("and the page is not set", () => {
    it("should return the default page", () => {
      expect(getPaginationParams(new URLSearchParams({}))).toEqual({
        limit: 50,
        page: 0,
      })
    })
  })

  describe("and the page is set to a a value that can't be parsed as a number", () => {
    it("should return the default page", () => {
      expect(getPaginationParams(new URLSearchParams({ page: "notAnInteger" }))).toEqual({
        limit: 50,
        page: 0,
      })
    })
  })

  describe("and the page is set to a negative integer", () => {
    it("should return the default page", () => {
      expect(getPaginationParams(new URLSearchParams({ page: "-20" }))).toEqual({
        limit: 50,
        page: 0,
      })
    })
  })

  describe("and the page is set to a valid value", () => {
    it("should return the value as the page", () => {
      expect(getPaginationParams(new URLSearchParams({ page: "1" }))).toEqual({
        limit: 50,
        page: 1,
      })
    })
  })
})

describe("when getting a single typed query parameter", () => {
  describe("and the parameter doesn't exist", () => {
    it("should return null", () => {
      expect(
        getTypedStringQueryParameter(
          Object.values(FilterByCategory),
          new URLSearchParams({ otherParameter: "aValue" }),
          "category"
        )
      ).toBeNull()
    })
  })

  describe("and the parameter doesn't have a valid value", () => {
    it("should throw an invalid parameter error", () => {
      expect(() =>
        getTypedStringQueryParameter(
          Object.values(FilterByCategory),
          new URLSearchParams({ category: "aValue" }),
          "category"
        )
      ).toThrow(new InvalidParameterError("category", "aValue"))
    })
  })

  describe("and the parameter has a valid value", () => {
    it("should return the value", () => {
      expect(
        getTypedStringQueryParameter(
          Object.values(FilterByCategory),
          new URLSearchParams({ category: FilterByCategory.LAND }),
          "category"
        )
      ).toEqual(FilterByCategory.LAND)
    })
  })
})
