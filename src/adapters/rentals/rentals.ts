import { ContractRentalListing } from "../../logic/rentals/types"
import { DBRental, RentalCreation } from "../../ports/rentals"
import { Rental } from "./types"

export function fromDBRentalToRental(DBRental: DBRental): Rental {
  return {
    id: DBRental.id,
    network: DBRental.network,
    chainId: DBRental.chain_id,
    expiration: DBRental.expiration,
    signature: DBRental.signature,
    rawData: DBRental.raw_data,
    tokenId: DBRental.token_id,
    contractAddress: DBRental.contract_address,
    rentalContractAddress: DBRental.rental_contract_address,
    lessor: DBRental.lessor,
    tenant: DBRental.tenant,
    status: DBRental.status,
    createdAt: DBRental.created_at,
    updatedAt: DBRental.updated_at,
  }
}

export function fromRentalCreationToContractRentalListing(
  lessor: string,
  rental: RentalCreation
): ContractRentalListing {
  // TODO use big numbers for everything?
  return {
    signer: lessor,
    contractAddress: rental.contractAddress,
    tokenId: rental.tokenId,
    expiration: rental.expiration.toString(),
    nonces: rental.nonces,
    pricePerDay: rental.periods.map((period) => period.price),
    maxDays: rental.periods.map((period) => period.max.toString()),
    minDays: rental.periods.map((period) => period.min.toString()),
    signature: rental.signature,
  }
}
