import { ChainId, Network, NFTCategory } from "@dcl/schemas"

export type IRentalsComponent = {
  createRental(rental: RentalCreation, lessorAddress: string): Promise<DBRental>
}

export type RentalCreation = {
  network: Network
  chainId: ChainId
  expiration: number
  signature: string
  rawData: string
  tokenId: string
  contractAddress: string
  rentalContractAddress: string
  nonces: string[]
  periods: PeriodCreation[]
}

export type PeriodCreation = {
  min: number
  max: number
  price: string
}

export enum Status {
  OPEN = "open",
  CANCELLED = "cancelled",
  EXECUTED = "executed",
}

export type DBRental = {
  id: string
  network: Network
  chain_id: ChainId
  expiration: number
  signature: string
  raw_data: string
  token_id: string
  contract_address: string
  rental_contract_address: string
  lessor: string | null
  tenant: string | null
  status: Status
  created_at: string
  updated_at: string
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
