import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer"
import { SignatureLike } from "@ethersproject/bytes"

export type ContractRentalListing = {
  signer: string
  contractAddress: string
  tokenId: string
  /** Timestamp when the signature expires in seconds since epoch */
  expiration: string
  indexes: string[]
  pricePerDay: string[]
  maxDays: string[]
  minDays: string[]
  signature: string
  target: string
}

export type RentalListingSignatureData = {
  domain: TypedDataDomain
  types: Record<string, Array<TypedDataField>>
  values: Omit<ContractRentalListing, "signature">
  signature: SignatureLike
}
