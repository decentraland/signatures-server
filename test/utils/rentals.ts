import { ethers } from "ethers"
import { ChainId, Network, PeriodCreation, RentalListingCreation } from "@dcl/schemas"
import { Identity } from "@dcl/test-helpers"
import { getRentalsContract } from "../../src/logic/rentals"
import { fromMillisecondsToSeconds } from "../../src/adapters/rentals"

const LISTING_TYPES = {
  Listing: [
    { name: "signer", type: "address" },
    { name: "contractAddress", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "indexes", type: "uint256[3]" },
    { name: "pricePerDay", type: "uint256[]" },
    { name: "maxDays", type: "uint256[]" },
    { name: "minDays", type: "uint256[]" },
    { name: "target", type: "address" },
  ],
}

/**
 * Builds a rental listing creation payload signed by the identity's real account, matching the
 * EIP-712 data the server rebuilds to verify it. The signer of the listing is the lower cased
 * account address, which is what the authorization middleware resolves the request to.
 * @param identity - The identity that will both sign the request and the listing.
 * @param chainId - The chain the listing is signed for.
 * @param overrides - Fields to override on the resulting listing, applied before signing.
 * @returns the listing creation payload with a valid signature.
 */
export async function buildSignedRentalListingCreation(
  identity: Identity,
  chainId: ChainId,
  overrides: Partial<Omit<RentalListingCreation, "signature">> = {}
): Promise<RentalListingCreation> {
  const wallet = new ethers.Wallet(identity.realAccount.privateKey)
  const rentalsContract = getRentalsContract(chainId)
  const periods: PeriodCreation[] = overrides.periods ?? [{ pricePerDay: "10000", maxDays: 30, minDays: 30 }]

  const listing: Omit<RentalListingCreation, "signature"> = {
    network: Network.ETHEREUM,
    chainId,
    expiration: Date.now() + 24 * 60 * 60 * 1000,
    contractAddress: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
    rentalContractAddress: rentalsContract.address,
    tokenId: "1",
    nonces: ["0", "0", "0"],
    target: ethers.constants.AddressZero,
    ...overrides,
    periods,
  }

  const domain = {
    name: rentalsContract.name,
    verifyingContract: rentalsContract.address,
    version: rentalsContract.version,
    chainId: ethers.utils.hexZeroPad(ethers.utils.hexlify(chainId), 32),
  }

  const values = {
    signer: wallet.address.toLowerCase(),
    contractAddress: listing.contractAddress,
    tokenId: listing.tokenId,
    expiration: fromMillisecondsToSeconds(listing.expiration).toString(),
    indexes: listing.nonces,
    pricePerDay: periods.map((period) => period.pricePerDay),
    maxDays: periods.map((period) => period.maxDays.toString()),
    minDays: periods.map((period) => period.minDays.toString()),
    target: listing.target,
  }

  return { ...listing, signature: await wallet._signTypedData(domain, LISTING_TYPES, values) }
}
