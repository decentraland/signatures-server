import { ethers } from "ethers"
import { ChainId } from "@dcl/schemas"
import { _TypedDataEncoder } from "@ethersproject/hash"
import { ContractData, ContractName, getContract } from "decentraland-transactions"
import { ContractRentalListing, RentalListingSignatureData } from "./types"

async function buildRentalListingSignatureData(
  rentalListing: ContractRentalListing,
  chainId: ChainId
): Promise<RentalListingSignatureData> {
  const rentalsContract: ContractData = getContract(ContractName.Rentals, chainId)

  const domain = {
    name: rentalsContract.name,
    verifyingContract: rentalsContract.address,
    version: rentalsContract.version,
    salt: ethers.utils.hexZeroPad(ethers.utils.hexlify(chainId), 32),
  }
  const types = {
    Listing: [
      { name: "signer", type: "address" },
      { name: "contractAddress", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "expiration", type: "uint256" },
      { name: "nonces", type: "uint256[]" },
      { name: "pricePerDay", type: "uint256[]" },
      { name: "maxDays", type: "uint256[]" },
      { name: "minDays", type: "uint256[]" },
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

  return signingAddress === rentalListingSignatureData.values.signer
}
