import { getBooleanParameter, getNumberParameter, InvalidParameterError } from "../../src/logic/http"

describe("getBooleanParameter", () => {
  test("should return undefined when value is null", () => {
    expect(getBooleanParameter("parameterName", null)).toBe(undefined)
  })

  test("should return true when value is 'true'", () => {
    expect(getBooleanParameter("parameterName", "true")).toBe(true)
  })

  test("should return false when value is 'false'", () => {
    expect(getBooleanParameter("parameterName", "false")).toBe(false)
  })

  test("should throw InvalidParameterError when value is not a valid boolean", () => {
    expect(() => getBooleanParameter("parameterName", "test")).toThrow(InvalidParameterError)
  })

  test("should send the correct error message when value is not a valid boolean", () => {
    expect(() => getBooleanParameter("parameterName", "test")).toThrow("The value of the parameterName parameter is invalid: test")
  })
})

describe("getNumberParameter", () => {
  test("should return undefined when value is null", () => {
    expect(getNumberParameter("parameterName", null)).toBe(undefined)
  })

  test("should return parsed number when value is an integer", () => {
    expect(getNumberParameter("parameterName", "12")).toBe(12)
  })

  test("should throw InvalidParameterError when value is not a valid number", () => {
    expect(() => getNumberParameter("parameterName", "test")).toThrow(InvalidParameterError)
  })

  test("should send the correct error message when value is not a valid number", () => {
    expect(() => getNumberParameter("parameterName", "test")).toThrow("The value of the parameterName parameter is invalid: test")
  })
})
