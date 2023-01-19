import { ethers } from "ethers"
import { ChainId } from "@dcl/schemas"
import { _TypedDataEncoder } from "@ethersproject/hash"
import { ContractData, ContractName, getContract } from "decentraland-transactions"
import { hasECDSASignatureAValidV } from "../../ports/rentals/utils"
import { ContractRentalListing, RentalListingSignatureData } from "./types"
import { ContractNotFound } from "./errors"

async function buildRentalListingSignatureData(
  rentalListing: ContractRentalListing,
  chainId: ChainId
): Promise<RentalListingSignatureData> {
  let rentalsContract: ContractData
  try {
    rentalsContract = getContract(ContractName.Rentals, chainId)
  } catch (error) {
    throw new ContractNotFound(ContractName.Rentals, chainId)
  }

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
  const signingAddress = ethers.utils.verifyTypedData(
    rentalListingSignatureData.domain,
    rentalListingSignatureData.types,
    rentalListingSignatureData.values,
    rentalListingSignatureData.signature
  )

  const isVValid = hasECDSASignatureAValidV(rentalListing.signature)
  return signingAddress.toLowerCase() === rentalListingSignatureData.values.signer && isVValid
}
