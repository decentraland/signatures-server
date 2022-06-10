import { ChainId, Network } from "@dcl/schemas"
import { Status } from "../../ports/rentals"

export type Rental = {
  id: string
  network: Network
  chainId: ChainId
  expiration: number
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
