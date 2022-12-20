import { generateECDSASignatureWithValidV } from "../../src/ports/rentals/utils"

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
