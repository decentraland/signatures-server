import { generateECDSASignatureWithValidV, hasECDSASignatureAValidFormat } from "../../src/ports/rentals/utils"

describe("when generating an ECDSA signature with a valid V from a signature", () => {
  describe("and the original signature has a valid V", () => {
    it("should return the same signature", () => {
      expect(
        generateECDSASignatureWithValidV(
          "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf51c"
        )
      ).toBe(
        "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf51c"
      )
    })
  })

  describe("and the original signature is invalid and ending in 0", () => {
    it("should return the original signature with its latest byte with the value 27", () => {
      expect(
        generateECDSASignatureWithValidV(
          "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf500"
        )
      ).toBe(
        "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf51b"
      )
    })
  })

  describe("and the original signature is invalid and ending in 1", () => {
    it("should return the original signature with its latest byte with the value 28", () => {
      expect(
        generateECDSASignatureWithValidV(
          "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf501"
        )
      ).toBe(
        "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf51c"
      )
    })
  })
})

describe("when checking if a signature has a valid ECDSA format", () => {
  describe("and the signature is a 65 bytes hex encoded string", () => {
    it("should return true", () => {
      expect(
        hasECDSASignatureAValidFormat(
          "0x38fbaabfdf15b5b0ccc66c6eaab45a525fc03ff7590ed28da5894365e4bfee16008e28064a418203b0e3186ff3bce4cccb58b06bac2519b9ca73cdc13ecc3cea1b"
        )
      ).toBe(true)
    })
  })

  describe("and the signature is one byte short of 65 bytes", () => {
    it("should return false", () => {
      expect(
        hasECDSASignatureAValidFormat(
          "0x402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf51c"
        )
      ).toBe(false)
    })
  })

  describe("and the signature is not hex encoded", () => {
    it("should return false", () => {
      expect(hasECDSASignatureAValidFormat("not-a-signature")).toBe(false)
    })
  })

  describe("and the signature is missing the 0x prefix", () => {
    it("should return false", () => {
      expect(
        hasECDSASignatureAValidFormat(
          "402a10749ebca5d35af41b5780a2667e7edbc2ec64bad157714f533c69cb694c4e4595b88dce064a92772850e903c23d0f67625aeccf9308841ad34929daf51c"
        )
      ).toBe(false)
    })
  })

  describe("and the signature is shorter than 65 bytes", () => {
    it("should return false", () => {
      expect(hasECDSASignatureAValidFormat("0x402a10749ebca5d35af41b5780a2667e7edbc2ec1c")).toBe(false)
    })
  })
})
