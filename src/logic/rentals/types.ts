import { TypedDataDomain, TypedDataField } from "@ethersproject/abstract-signer"
import { SignatureLike } from "@ethersproject/bytes"

export type ContractRentalListing = {
  signer: string
  contractAddress: string
  tokenId: string
  expiration: string
  nonces: string[]
  pricePerDay: string[]
  maxDays: string[]
  minDays: string[]
  signature: string
}

export type RentalListingSignatureData = {
  domain: TypedDataDomain
  types: Record<string, Array<TypedDataField>>
  values: ContractRentalListing
  signature: SignatureLike
}
