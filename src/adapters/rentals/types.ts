import { ChainId, Network, NFTCategory } from "@dcl/schemas"
import { Status } from "../../ports/rentals"

export type RentalListing = {
  id: string
  category: NFTCategory
  search_text: string
  network: Network
  chainId: ChainId
  /** UTC timestamp in milliseconds since epoch of the signature's expiration */
  expiration: number
  signature: string
  nonces: string[]
  tokenId: string
  contractAddress: string
  rentalContractAddress: string
  lessor: string | null
  tenant: string | null
  status: Status
  /** UTC timestamp in milliseconds since epoch of the time the signature was created */
  createdAt: number
  /** UTC timestamp in milliseconds since epoch of the time the signature was updated */
  updatedAt: number
  periods: Period[]
}

export type Period = {
  id: string
  minDays: number
  maxDays: number
  pricePerDay: string
}
