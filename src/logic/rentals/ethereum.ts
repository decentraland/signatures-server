import { ethers } from "ethers"
import { _TypedDataEncoder } from "@ethersproject/hash"
import { ContractRentalListing, RentalListingSignatureData } from "./types"

async function buildRentalListingSignatureData(
  rentalListing: ContractRentalListing,
  chainId: number
): Promise<RentalListingSignatureData> {
  // const rentalsContract: ContractData = getContract(
  //   ContractName.RentalsContract,
  //   rentalListing.chainId
  // )

  const domain = {
    // name: rentalsContract.name,
    name: "Rentals contract name",
    // verifyingContract: rentalsContract.address,
    verifyingContract: "Rentals contract address",
    // version: rentalsContract.version,
    version: "v1",
    salt: ethers.utils.hexZeroPad(ethers.utils.hexlify(chainId), 32),
  }
  const types = {
    Listing: [
      { name: "signer", type: "address" },
      { name: "contractAddress", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "expiration", type: "uint256" },
      { name: "nonces", type: "uint256[3]" },
      { name: "pricePerDay", type: "uint256[]" },
      { name: "maxDays", type: "uint256[]" },
      { name: "minDays", type: "uint256[]" },
    ],
  }

  return {
    domain,
    types,
    values: rentalListing,
    signature: rentalListing.signature,
  }
}

export async function verifyRentalsListingSignature(
  rentalListing: ContractRentalListing,
  chainId: number,
  address: string
): Promise<boolean> {
  const rentalListingSignatureData = await buildRentalListingSignatureData(rentalListing, chainId)
  const signingAddress = ethers.utils.verifyTypedData(
    rentalListingSignatureData.domain,
    rentalListingSignatureData.types,
    rentalListingSignatureData.values,
    rentalListingSignatureData.signature
  )

  return signingAddress == address
}
