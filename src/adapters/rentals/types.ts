import { ChainId, Network } from "@dcl/schemas"
import { Status } from "../../ports/rentals"

export type RentalListing = {
  id: string
  network: Network
  chainId: ChainId
  expiration: number
  signature: string
  nonces: string[]
  tokenId: string
  contractAddress: string
  rentalContractAddress: string
  lessor: string | null
  tenant: string | null
  status: Status
  createdAt: string
  updatedAt: string
  periods: Period[]
}

export type Period = {
  id: string
  minDays: number
  maxDays: number
  pricePerDay: string
}
