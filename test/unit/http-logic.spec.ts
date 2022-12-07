import { URLSearchParams } from "url"
import { RentalsListingsFilterByCategory } from "@dcl/schemas"
import {
  getPaginationParams,
  getTypedArrayStringQueryParameter,
  getTypedStringQueryParameter,
  InvalidParameterError,
} from "../../src/logic/http"

describe("when getting the pagination params", () => {
  describe("and the limit is greater than the max limit", () => {
    it("should return the default limit", () => {
      expect(getPaginationParams(new URLSearchParams({ limit: "200" }))).toEqual({
        limit: 100,
        offset: 0,
      })
    })
  })

  describe("and the limit is set to a negative number", () => {
    it("should return the default limit", () => {
      expect(getPaginationParams(new URLSearchParams({ limit: "-100" }))).toEqual({
        limit: 100,
        offset: 0,
      })
    })
  })

  describe("and the limit is set to a a value that can't be parsed as a number", () => {
    it("should return the default limit", () => {
      expect(getPaginationParams(new URLSearchParams({ limit: "notAnInteger" }))).toEqual({
        limit: 100,
        offset: 0,
      })
    })
  })

  describe("and the limit is set to a valid value", () => {
    it("should return the value as the limit", () => {
      expect(getPaginationParams(new URLSearchParams({ limit: "10" }))).toEqual({
        limit: 10,
        offset: 0,
      })
    })
  })

  describe("and the page is not set", () => {
    it("should return the default page", () => {
      expect(getPaginationParams(new URLSearchParams({}))).toEqual({
        limit: 100,
        offset: 0,
      })
    })
  })

  describe("and the page is set to a a value that can't be parsed as a number", () => {
    it("should return the default offset", () => {
      expect(getPaginationParams(new URLSearchParams({ page: "notAnInteger" }))).toEqual({
        limit: 100,
        offset: 0,
      })
    })
  })

  describe("and the page is set to a negative integer", () => {
    it("should return the default offset", () => {
      expect(getPaginationParams(new URLSearchParams({ page: "-20" }))).toEqual({
        limit: 100,
        offset: 0,
      })
    })
  })

  describe("and the page is set to a valid value", () => {
    it("should return the value as the page", () => {
      expect(getPaginationParams(new URLSearchParams({ page: "1" }))).toEqual({
        limit: 100,
        offset: 50,
      })
    })
  })
})

describe("when getting a single typed query parameter", () => {
  describe("and the parameter doesn't exist", () => {
    it("should return null", () => {
      expect(
        getTypedStringQueryParameter(
          Object.values(RentalsListingsFilterByCategory),
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
          Object.values(RentalsListingsFilterByCategory),
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
          Object.values(RentalsListingsFilterByCategory),
          new URLSearchParams({ category: RentalsListingsFilterByCategory.PARCEL }),
          "category"
        )
      ).toEqual(RentalsListingsFilterByCategory.PARCEL)
    })
  })
})

describe("when getting an arrayed typed query parameter", () => {
  describe("and the parameter doesn't exist", () => {
    it("should return an empty array", () => {
      expect(
        getTypedArrayStringQueryParameter(
          Object.values(RentalsListingsFilterByCategory),
          new URLSearchParams({ otherParameter: "aValue" }),
          "category"
        )
      ).toEqual([])
    })
  })

  describe("and one of the parameters don't have a valid value", () => {
    let params: URLSearchParams
    beforeEach(() => {
      params = new URLSearchParams()
      params.append("category", "aValue")
      params.append("category", "anotherValue")
    })

    it("should throw an invalid parameter error", () => {
      expect(() =>
        getTypedArrayStringQueryParameter(Object.values(RentalsListingsFilterByCategory), params, "category")
      ).toThrow(new InvalidParameterError("category", "aValue"))
    })
  })

  describe("and the parameters have a valid value", () => {
    let params: URLSearchParams
    beforeEach(() => {
      params = new URLSearchParams()
      params.append("category", RentalsListingsFilterByCategory.PARCEL)
      params.append("category", RentalsListingsFilterByCategory.ESTATE)
    })

    it("should return the values", () => {
      expect(
        getTypedArrayStringQueryParameter(Object.values(RentalsListingsFilterByCategory), params, "category")
      ).toEqual([RentalsListingsFilterByCategory.PARCEL, RentalsListingsFilterByCategory.ESTATE])
    })
  })
})
