import { ChainId, Network, NFTCategory } from "@dcl/schemas"
import { Status } from "../../ports/rentals"

export type RentalListing = {
  id: string
  category: NFTCategory
  search_text: string
  network: Network
  chainId: ChainId
  /** ISO date of the signature's expiration */
  expiration: string
  signature: string
  nonces: string[]
  tokenId: string
  contractAddress: string
  rentalContractAddress: string
  lessor: string | null
  tenant: string | null
  status: Status
  /** ISO date of the time the signature was created */
  createdAt: string
  /** ISO date of the time the signature was updated */
  updatedAt: string
  periods: Period[]
}

export type Period = {
  id: string
  minDays: number
  maxDays: number
  pricePerDay: string
}
