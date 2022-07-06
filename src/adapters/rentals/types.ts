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
  /** UTC timestamp in milliseconds since epoch of the time the rental started */
  startedAt: number | null
  periods: Period[]
}

export type Period = {
  minDays: number
  maxDays: number
  pricePerDay: string
}
