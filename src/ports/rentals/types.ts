import { ChainId, Network, NFTCategory } from "@dcl/schemas"

export type IRentalsComponent = {
  createRentalListing(rental: RentalListingCreation, lessorAddress: string): Promise<DBInsertedRentalListing>
}

export type RentalListingCreation = {
  network: Network
  chainId: ChainId
  expiration: number
  signature: string
  tokenId: string
  contractAddress: string
  rentalContractAddress: string
  nonces: string[]
  periods: PeriodCreation[]
}

export type PeriodCreation = {
  minDays: number
  maxDays: number
  pricePerDay: string
}

export enum Status {
  OPEN = "open",
  CANCELLED = "cancelled",
  EXECUTED = "executed",
}

export type DBRental = {
  id: string
  metadata_id: string
  network: Network
  chain_id: ChainId
  expiration: number
  nonces: string[]
  signature: string
  token_id: string
  contract_address: string
  rental_contract_address: string
  status: Status
  created_at: string
  updated_at: string
}

export type DBRentalListing = {
  id: string
  lessor: string | null
  tenant: string | null
}

export type DBPeriods = {
  id: string
  min_days: number
  max_days: number
  price_per_day: string
  rental_id: string
}

export type DBInsertedRentalListing = DBRental & DBRentalListing & { periods: DBPeriods[] }

export type NFT = {
  id: string
  category: NFTCategory
  contractAddress: string
  tokenId: string
  owner: { address: string }
  searchText: string
  createdAt: string
  updatedAt: string
}
