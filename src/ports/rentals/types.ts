import { ChainId, Network } from "@dcl/schemas"

export type IRentalsComponent = {
  createRental(rental: RentalCreation, lessorAddress: string): Promise<Rental>
}

export type RentalCreation = {
  network: Network
  chainId: ChainId
  expiration: Date
  signature: string
  rawData: string
  tokenId: string
  contractAddress: string
  rentalContractAddress: string
}

export enum Status {
  OPEN = "open",
  CANCELLED = "cancelled",
  EXECUTED = "executed",
}

export type Rental = {
  id: string
  network: Network
  chainId: ChainId
  expiration: Date
  signature: string
  rawData: string
  tokenId: string
  contractAddress: string
  rentalContractAddress: string
  lessor: string | null
  tenant: string | null
  status: Status
  createdAt: string
  updatedAt: string
}

export type DBRental = {
  id: string
  network: Network
  chain_id: ChainId
  expiration: Date
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
