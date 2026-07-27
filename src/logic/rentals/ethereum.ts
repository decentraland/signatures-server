import { ethers } from "ethers"
import { ChainId } from "@dcl/schemas"
import { _TypedDataEncoder } from "@ethersproject/hash"
import { ContractData, ContractName, getContract } from "decentraland-transactions"
import { hasECDSASignatureAValidV } from "../../ports/rentals/utils"
import { ContractRentalListing, RentalListingSignatureData } from "./types"
import { ContractNotFound } from "./errors"

/**
 * Compares two ethereum addresses ignoring their casing. The addresses the server handles come from
 * the authorization middleware, the request body, the indexers and the contract definitions, and
 * each of those may use a checksummed or a lower cased representation of the same address.
 * @param anAddress - One of the addresses to compare.
 * @param anotherAddress - The address to compare it against.
 * @returns true if both are the same address.
 */
export function areSameAddress(anAddress: string | null | undefined, anotherAddress: string | null | undefined) {
  return Boolean(anAddress) && Boolean(anotherAddress) && anAddress?.toLowerCase() === anotherAddress?.toLowerCase()
}

/**
 * Gets the Rentals contract deployed for the given chain.
 * @param chainId - The chain the contract was deployed to.
 * @throws {ContractNotFound} if there's no Rentals contract for the given chain.
 */
export function getRentalsContract(chainId: ChainId): ContractData {
  try {
    return getContract(ContractName.Rentals, chainId)
  } catch (error) {
    throw new ContractNotFound(ContractName.Rentals, chainId)
  }
}

async function buildRentalListingSignatureData(
  rentalListing: ContractRentalListing,
  chainId: ChainId
): Promise<RentalListingSignatureData> {
  const rentalsContract = getRentalsContract(chainId)

  const domain = {
    name: rentalsContract.name,
    verifyingContract: rentalsContract.address,
    version: rentalsContract.version,
    chainId: ethers.utils.hexZeroPad(ethers.utils.hexlify(chainId), 32),
  }
  const types = {
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

  const { signature, ...values } = rentalListing

  return {
    domain,
    types,
    values,
    signature: rentalListing.signature,
  }
}

export async function verifyRentalsListingSignature(
  rentalListing: ContractRentalListing,
  chainId: number
): Promise<boolean> {
  const rentalListingSignatureData = await buildRentalListingSignatureData(rentalListing, chainId)

  let signingAddress: string
  try {
    signingAddress = ethers.utils.verifyTypedData(
      rentalListingSignatureData.domain,
      rentalListingSignatureData.types,
      rentalListingSignatureData.values,
      rentalListingSignatureData.signature
    )
  } catch (error) {
    // A signature ethers can't recover an address from is an invalid one, not a server error
    return false
  }

  const isVValid = hasECDSASignatureAValidV(rentalListing.signature)
  return signingAddress.toLowerCase() === rentalListingSignatureData.values.signer && isVValid
}
