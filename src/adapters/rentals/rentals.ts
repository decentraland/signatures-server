import { ContractRentalListing } from "../../logic/rentals/types"
import { DBPeriods, RentalListingCreation, DBInsertedRentalListing } from "../../ports/rentals"
import { Period, Rental } from "./types"

export function fromDBInsertedRentalListingToRental(DBRental: DBInsertedRentalListing): Rental {
  return {
    id: DBRental.id,
    network: DBRental.network,
    chainId: DBRental.chain_id,
    expiration: DBRental.expiration,
    signature: DBRental.signature,
    nonces: DBRental.nonces,
    tokenId: DBRental.token_id,
    contractAddress: DBRental.contract_address,
    rentalContractAddress: DBRental.rental_contract_address,
    lessor: DBRental.lessor,
    tenant: DBRental.tenant,
    status: DBRental.status,
    createdAt: DBRental.created_at,
    updatedAt: DBRental.updated_at,
    periods: DBRental.periods.map(fromDBPeriodToPeriod),
  }
}

export function fromDBPeriodToPeriod(DBPeriod: DBPeriods): Period {
  return {
    id: DBPeriod.id,
    minDays: DBPeriod.min_days,
    maxDays: DBPeriod.max_days,
    pricePerDay: DBPeriod.price_per_day,
  }
}

export function fromRentalCreationToContractRentalListing(
  lessor: string,
  rental: RentalListingCreation
): ContractRentalListing {
  return {
    signer: lessor,
    contractAddress: rental.contractAddress,
    tokenId: rental.tokenId,
    expiration: rental.expiration.toString(),
    nonces: rental.nonces,
    pricePerDay: rental.periods.map((period) => period.pricePerDay),
    maxDays: rental.periods.map((period) => period.maxDays.toString()),
    minDays: rental.periods.map((period) => period.minDays.toString()),
    signature: rental.signature,
  }
}
