import {
  ChainId,
  Network,
  NFTCategory,
  RentalListingCreation,
  RentalsListingsFilterBy,
  RentalsListingSortDirection,
  RentalsListingsSortBy,
  RentalStatus,
} from "@dcl/schemas"

export type IRentalsComponent = {
  createRentalListing(rental: RentalListingCreation, lessorAddress: string): Promise<DBInsertedRentalListing>
  refreshRentalListing(rentalId: string): Promise<DBGetRentalListing>
  getRentalsListings(params: GetRentalListingParameters): Promise<DBGetRentalListing[]>
  updateRentalsListings(): Promise<void>
  updateMetadata(): Promise<void>
}

export type GetRentalListingParameters = {
  sortBy: RentalsListingsSortBy | null
  sortDirection: RentalsListingSortDirection | null
  page: number
  limit: number
  filterBy: RentalsListingsFilterBy | null
}

export enum UpdateType {
  METADATA = "metadata",
  RENTALS = "rentals",
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
  expiration: Date
  nonces: string[]
  signature: string
  token_id: string
  contract_address: string
  rental_contract_address: string
  status: RentalStatus
  created_at: Date
  updated_at: Date
  started_at: Date | null
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

export type DBGetRentalListing = DBRental &
  DBRentalListing &
  DBMetadata & {
    /** An array containing [min_days, max_days, price_per_day] */
    periods: [string, string, string][]
    metadata_created_at: Date
    rentals_listings_count: string
    metadata_id: string
  }

export type DBInsertedRentaListingPeriods = { row: string }

export type DBInsertedRentalListing = DBRental &
  DBRentalListing & { periods: DBInsertedRentaListingPeriods[] } & Pick<DBMetadata, "category" | "search_text">

export type NFT = {
  /** The id of the NFT */
  id: string
  /** The category of the NFT, Parcel, Estate, etc */
  category: NFTCategory
  /** The contract address of the NFT */
  contractAddress: string
  /** The token id of the NFT */
  tokenId: string
  /** The owner of the NFT, containing the address of it */
  owner: { address: string }
  /** The owner of the NFT, containing his address */
  searchText: string
  /** Timestamp when the NFT was created in seconds since epoch */
  createdAt: string
  /** Timestamp when the NFT was updated for the last time in seconds since epoch */
  updatedAt: string
  /** Wether the NFT is LAND or not */
  searchIsLand: boolean
}

export type IndexerRental = {
  /** The id of the rental in the graph (contractAddress:tokenId:timesItHasBeenRented) */
  id: string
  /** The contract address of the LAND */
  contractAddress: string
  /** The contract address of the rentals contract */
  rentalContractAddress: string
  /** The token id of the LAND */
  tokenId: string
  /** The address of the lessor of the LAND */
  lessor: string
  /** The address of the tenant of the LAND */
  tenant: string
  /** The address of the operator of the LAND */
  operator: string
  /** Days that the rent was settled for */
  rentalDays: string
  /** Timestamp of when the rental started in seconds since epoch */
  startedAt: string
  /** Timestamp of when the rental ends in seconds since epoch */
  endsAt: string
  /** Timestamp when the rental was updated for the last time in seconds since epoch */
  updatedAt: string
  /** The price per day the rent was settled for */
  pricePerDay: string
  /** The sender of the signature to the contract */
  sender: string
  /** If an owner has claimed the land after the rental */
  ownerHasClaimedAsset: boolean
  /** If the rental is extending another one */
  isExtension: boolean
  /** A string representation of the bytes of the rental signature */
  signature: string
}

export type IndexerNonceUpdate = {
  /** The newest nonce */
  newNonce: string
  /** The nonce signer */
  signer: string
}
