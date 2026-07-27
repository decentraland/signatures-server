import { ChainId, NFTCategory, RentalListingCreation, RentalStatus } from "@dcl/schemas"
import { getIdentity, Identity } from "@dcl/test-helpers"
import { ethers } from "ethers"
import { getRentalsContract } from "../../src/logic/rentals"
import { StatusCode } from "../../src/types"
import { test } from "../components"
import { createDbHelper, DbHelper } from "../utils/db-helper"
import { resetToUnexpected } from "../utils/mocks"
import { buildSignedRentalListingCreation } from "../utils/rentals"

const PATH = "/v1/rentals-listings"

test("when creating a rental listing through the API", function ({ components, stubComponents }) {
  let dbHelper: DbHelper
  let identity: Identity
  let lessor: string
  let listing: RentalListingCreation

  beforeEach(async () => {
    resetToUnexpected(stubComponents.marketplaceSubgraph.query, "marketplaceSubgraph.query")
    resetToUnexpected(stubComponents.rentalsSubgraph.query, "rentalsSubgraph.query")
    dbHelper = createDbHelper(components.database)
    await dbHelper.clear()
    identity = await getIdentity()
    lessor = identity.realAccount.address.toLowerCase()
    listing = await buildSignedRentalListingCreation(identity, ChainId.ETHEREUM_GOERLI)
  })

  afterEach(async () => {
    await dbHelper.clear()
  })

  describe("and the request is not signed", () => {
    let response: Response

    beforeEach(async () => {
      response = await components.localFetch.fetch(PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listing),
      })
    })

    // The authorization middleware answers a missing auth chain with a 400 "Invalid Auth Chain",
    // it only uses 401 for a chain that is present but does not verify.
    it("should reject the request with a 400", async () => {
      expect(response.status).toBe(StatusCode.BAD_REQUEST)
      await response.body?.cancel().catch(() => undefined)
    })

    it("should not reach the rentals component", () => {
      expect(stubComponents.marketplaceSubgraph.query).not.toHaveBeenCalled()
    })
  })

  describe("and the request is signed by a scene", () => {
    let response: Response

    beforeEach(async () => {
      response = await components.localFetch.fetch(PATH, {
        method: "POST",
        identity,
        metadata: { signer: "decentraland-kernel-scene" },
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listing),
      })
    })

    it("should respond with a 400 rejecting the signer", async () => {
      expect(response.status).toBe(StatusCode.BAD_REQUEST)
      await expect(response.text()).resolves.toBe("Invalid signer")
    })
  })

  describe("and the body does not match the rental listing schema", () => {
    let response: Response

    beforeEach(async () => {
      response = await components.localFetch.fetch(PATH, {
        method: "POST",
        identity,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...listing, nonces: ["0"] }),
      })
    })

    it("should respond with a 400", async () => {
      expect(response.status).toBe(StatusCode.BAD_REQUEST)
      await response.body?.cancel().catch(() => undefined)
    })
  })

  describe("and the rental contract address is not the Rentals contract of the chain", () => {
    let response: Response
    let forgedRentalContractAddress: string

    beforeEach(async () => {
      forgedRentalContractAddress = "0x1111111111111111111111111111111111111111"
      listing = await buildSignedRentalListingCreation(identity, ChainId.ETHEREUM_GOERLI, {
        rentalContractAddress: forgedRentalContractAddress,
      })
      response = await components.localFetch.fetch(PATH, {
        method: "POST",
        identity,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listing),
      })
    })

    it("should respond with a 400 reporting the expected Rentals contract", async () => {
      expect(response.status).toBe(StatusCode.BAD_REQUEST)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        message: "The rental contract address does not match the Rentals contract of the given chain",
        data: {
          rentalContractAddress: forgedRentalContractAddress,
          expectedRentalContractAddress: getRentalsContract(ChainId.ETHEREUM_GOERLI).address,
        },
      })
    })
  })

  describe("and the listing is signed for a chain the server does not serve", () => {
    let response: Response

    beforeEach(async () => {
      listing = await buildSignedRentalListingCreation(identity, ChainId.ETHEREUM_MAINNET)
      response = await components.localFetch.fetch(PATH, {
        method: "POST",
        identity,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listing),
      })
    })

    it("should respond with a 400 reporting the unsupported chain", async () => {
      expect(response.status).toBe(StatusCode.BAD_REQUEST)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        message: "The chain id and network of the listing are not the ones supported by the server",
        data: { chainId: ChainId.ETHEREUM_MAINNET, network: listing.network },
      })
    })
  })

  describe("and the signature is not a 65 bytes ECDSA signature", () => {
    let response: Response

    beforeEach(async () => {
      response = await components.localFetch.fetch(PATH, {
        method: "POST",
        identity,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...listing, signature: "0xdeadbeef" }),
      })
    })

    it("should respond with a 400 instead of failing to recover the address", async () => {
      expect(response.status).toBe(StatusCode.BAD_REQUEST)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        message: "The provided signature is invalid: The signature is not a 65 bytes hex encoded ECDSA signature",
      })
    })
  })

  describe("and the listing is signed by an account that does not own the asset", () => {
    let response: Response
    let ownerAddress: string

    beforeEach(async () => {
      ownerAddress = "0x2222222222222222222222222222222222222222"
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({ rentals: [] })
      stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
        nfts: [
          {
            id: "aMetadataId",
            category: NFTCategory.PARCEL,
            contractAddress: listing.contractAddress,
            tokenId: listing.tokenId,
            owner: { address: ownerAddress },
            searchText: "0,0",
            searchIsLand: true,
            searchEstateSize: null,
            searchDistanceToPlaza: 3,
            searchAdjacentToRoad: true,
            createdAt: "100000",
            updatedAt: "200000",
          },
        ],
      })
      response = await components.localFetch.fetch(PATH, {
        method: "POST",
        identity,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listing),
      })
    })

    it("should respond with a 401 reporting the owner mismatch", async () => {
      expect(response.status).toBe(StatusCode.UNAUTHORIZED)
      await expect(response.json()).resolves.toEqual({
        ok: false,
        message: "The owner of the token is not the lessor, it can't rent the token",
        data: { ownerAddress, lessorAddress: lessor },
      })
    })
  })

  describe("and the listing is valid and signed by the owner of the asset", () => {
    let response: Response
    let body: { ok: boolean; data: { id: string } }

    beforeEach(async () => {
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({ rentals: [] })
      stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
        nfts: [
          {
            id: "aMetadataId",
            category: NFTCategory.PARCEL,
            contractAddress: listing.contractAddress,
            tokenId: listing.tokenId,
            owner: { address: lessor },
            searchText: "0,0",
            searchIsLand: true,
            searchEstateSize: 0,
            searchDistanceToPlaza: 3,
            searchAdjacentToRoad: true,
            createdAt: "100000",
            updatedAt: "200000",
          },
        ],
      })

      response = await components.localFetch.fetch(PATH, {
        method: "POST",
        identity,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listing),
      })
      body = await response.json()
    })

    it("should respond with a 201 and the created rental listing", () => {
      expect(response.status).toBe(StatusCode.CREATED)
      expect(body).toEqual(
        expect.objectContaining({
          ok: true,
          data: expect.objectContaining({
            nftId: "aMetadataId",
            lessor,
            status: RentalStatus.OPEN,
            target: ethers.constants.AddressZero,
            periods: [{ minDays: 30, maxDays: 30, pricePerDay: "10000" }],
          }),
        })
      )
    })

    it("should have stored the listing as open", async () => {
      await expect(dbHelper.getListingStatus(body.data.id)).resolves.toBe(RentalStatus.OPEN)
    })

    it("should have stored the Rentals contract of the chain and not a caller supplied one", async () => {
      await expect(dbHelper.getListingRentalContractAddress(body.data.id)).resolves.toBe(
        getRentalsContract(ChainId.ETHEREUM_GOERLI).address
      )
    })

    it("should be returned by the listings endpoint", async () => {
      const listingsResponse = await components.localFetch.fetch(`${PATH}?lessor=${lessor}`)
      await expect(listingsResponse.json()).resolves.toEqual(
        expect.objectContaining({
          data: expect.objectContaining({ total: 1, results: [expect.objectContaining({ id: body.data.id })] }),
        })
      )
    })
  })

  describe("and a listing already exists for the same asset", () => {
    let response: Response

    beforeEach(async () => {
      await dbHelper.seedListing({
        lessor,
        contractAddress: listing.contractAddress,
        tokenId: listing.tokenId,
        status: RentalStatus.OPEN,
      })
      stubComponents.rentalsSubgraph.query.mockResolvedValueOnce({ rentals: [] })
      stubComponents.marketplaceSubgraph.query.mockResolvedValueOnce({
        nfts: [
          {
            id: "anotherMetadataId",
            category: NFTCategory.PARCEL,
            contractAddress: listing.contractAddress,
            tokenId: listing.tokenId,
            owner: { address: lessor },
            searchText: "0,0",
            searchIsLand: true,
            searchEstateSize: 0,
            searchDistanceToPlaza: 3,
            searchAdjacentToRoad: true,
            createdAt: "100000",
            updatedAt: "200000",
          },
        ],
      })

      response = await components.localFetch.fetch(PATH, {
        method: "POST",
        identity,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listing),
      })
    })

    it("should respond with a 409, as the unique index rejects the second open listing", async () => {
      expect(response.status).toBe(StatusCode.CONFLICT)
      await expect(response.json()).resolves.toEqual(
        expect.objectContaining({ ok: false, message: "An open rental already exists for this token" })
      )
    })
  })
})
