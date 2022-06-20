import { ChainId, Network, NFTCategory } from "@dcl/schemas"

export type IRentalsComponent = {
  createRentalListing(rental: RentalListingCreation, lessorAddress: string): Promise<DBInsertedRentalListing>
  getRentalsListings(params: {
    sortBy: RentalsListingsSortBy | null
    sortDirection: SortDirection | null
    page: number
    limit: number
    filterBy: FilterBy | null
  }): Promise<DBGetRentalListings[]>
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

export type DBMetadata = {
  id: string
  category: NFTCategory
  search_text: string
  created_at: string
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
export type DBGetRentalListings = DBRental &
  DBRentalListing &
  DBMetadata & {
    periods: [string, number, number, string][]
    metadata_created_at: string
    rentals_listings_count: string
  }

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

export enum FilterByCategory {
  LAND = "land",
  ESTATE = "estate",
}

export type FilterByPeriod = {
  minDays: number
  maxDays: number
  pricePerDay?: number
}

export type FilterBy = {
  category?: FilterByCategory
  text?: string
  status?: Status
  periods?: FilterByPeriod
  lessor?: string
  tenant?: string
}

export enum SortDirection {
  ASC = "asc",
  DESC = "desc",
}

export enum RentalsListingsSortBy {
  CHEAPEST_TO_RENT = "cheapest_to_rent",
  RECENTLY_LISTED = "recently_listed",
  RECENTLY_RENTED = "recently_rented",
  NEWEST = "newest",
  NAME = "name",
}
