import { ChainId, Network, NFTCategory } from "@dcl/schemas"

export type IRentalsComponent = {
  createRentalListing(rental: RentalListingCreation, lessorAddress: string): Promise<DBInsertedRentalListing>
}

export type RentalListingCreation = {
  network: Network
  chainId: ChainId
  /** ISO date of the signature's expiration */
  expiration: string
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
  expiration: Date
  nonces: string[]
  signature: string
  token_id: string
  contract_address: string
  rental_contract_address: string
  status: Status
  created_at: Date
  updated_at: Date
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
}

export type BlockchainRental = {
  /** The id of the rental in the graph (contractAddress:tokenId:timesItHasBeenRented) */
  id: string
  /** The contract address of the LAND */
  contractAddress: string
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
  /** The price per day the rent was settled for */
  pricePerDay: string
  /** The sender of the signature to the contract */
  sender: string
  /** If an owner has claimed the land after the rental */
  ownerHasClaimedAsset: boolean
}
