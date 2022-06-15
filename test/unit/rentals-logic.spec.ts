// TODO complete these tests
describe("when verifying the rentals listings signature", () => {
  describe("and the signature is expired", () => {
    it("should return false", () => {
      expect(false).toBe(false)
    })
  })

  describe("and the signature was signed by someone different", () => {
    it("should return false", () => {
      expect(false).toBe(false)
    })
  })

  describe("and the signature is not expired and was signed by the provided address", () => {
    it("should return true", () => {
      expect(true).toBe(true)
    })
  })
})
