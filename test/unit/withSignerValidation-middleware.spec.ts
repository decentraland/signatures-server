import { IHttpServerComponent } from "@well-known-components/interfaces"
import { withSignerValidation } from "../../src/middlewares/withSignerValidation"

let ctx: IHttpServerComponent.DefaultContext<any>

describe("withSignerValidation", () => {
  describe("when signer is decentraland-kernel-scene", () => {
    beforeEach(() => {
      ctx = {
        verification: {
          authMetadata: {
            signer: "decentraland-kernel-scene",
          },
        },
      }
    })

    it('should return 400 status and "Invalid signer" body', async () => {
      const next = jest.fn()
      const result = await withSignerValidation(ctx, next)
      expect(result).toEqual({
        status: 400,
        body: "Invalid signer",
      })
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe("when signer is decentraland-kernel-scene in a non-canonical casing", () => {
    beforeEach(() => {
      ctx = {
        verification: {
          authMetadata: {
            signer: "Decentraland-Kernel-Scene",
          },
        },
      }
    })

    // The signed payload is lowercased, so casing is not covered by the signature. The middleware
    // has to normalize instead of relying on @dcl/crypto-middleware rejecting it upstream.
    it('should return 400 status and "Invalid signer" body', async () => {
      const next = jest.fn()
      const result = await withSignerValidation(ctx, next)
      expect(result).toEqual({
        status: 400,
        body: "Invalid signer",
      })
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe("when signer is decentraland-kernel-scene padded with whitespace", () => {
    beforeEach(() => {
      ctx = {
        verification: {
          authMetadata: {
            signer: " decentraland-kernel-scene ",
          },
        },
      }
    })

    it('should return 400 status and "Invalid signer" body', async () => {
      const next = jest.fn()
      const result = await withSignerValidation(ctx, next)
      expect(result).toEqual({
        status: 400,
        body: "Invalid signer",
      })
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe("when signer is not a string", () => {
    beforeEach(() => {
      ctx = {
        verification: {
          authMetadata: { signer: 123 },
        },
      }
    })

    // Metadata is attacker supplied and only checked to be an object, so normalizing has to be
    // guarded by a type check or the middleware throws instead of answering the request.
    it("should call next() and return its result", async () => {
      const nextResult = { status: 200, body: "Success" }
      const next = jest.fn().mockResolvedValue(nextResult)
      const result = await withSignerValidation(ctx, next)
      expect(result).toEqual(nextResult)
      expect(next).toHaveBeenCalled()
    })
  })

  describe("when signer is not defined", () => {
    beforeEach(() => {
      ctx = {
        verification: {
          authMetadata: {},
        },
      }
    })

    it("should call next() and return its result", async () => {
      const nextResult = { status: 200, body: "Success" }
      const next = jest.fn().mockResolvedValue(nextResult)
      const result = await withSignerValidation(ctx, next)
      expect(result).toEqual(nextResult)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('when signer is not "decentraland-kernel-scene"', () => {
    beforeEach(() => {
      ctx = {
        verification: {
          authMetadata: { signer: "other-signer" },
        },
      }
    })

    it("should call next() and return its result", async () => {
      const nextResult = { status: 200, body: "Success" }
      const next = jest.fn().mockResolvedValue(nextResult)
      const result = await withSignerValidation(ctx, next)
      expect(result).toEqual(nextResult)
      expect(next).toHaveBeenCalled()
    })
  })
})
