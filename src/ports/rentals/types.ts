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

export type DBMetadata = {
  id: string
  category: NFTCategory
  search_text: string
  created_at: Date
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

export type DBInsertedRentalListing = DBRental &
  DBRentalListing & { periods: DBPeriods[] } & Pick<DBMetadata, "category" | "search_text">

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

export type BlockchainRental = {
  id: string
  contractAddress: string
  tokenId: string
  lessor: string
  tenant: string
  operator: string
  rentalDays: string
  startedAt: string
  pricePerDay: string
  sender: string
  ownerHasClaimedAsset: boolean
  last: boolean
}
