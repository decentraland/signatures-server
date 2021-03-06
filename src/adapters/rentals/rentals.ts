import { ContractRentalListing } from "../../logic/rentals/types"
import { DBPeriods, RentalListingCreation, DBInsertedRentalListing, DBGetRentalListing } from "../../ports/rentals"
import { fromMillisecondsToSeconds } from "./time"
import { Period, RentalListing } from "./types"

export function fromDBInsertedRentalListingToRental(DBRental: DBInsertedRentalListing): RentalListing {
  return {
    id: DBRental.id,
    category: DBRental.category,
    search_text: DBRental.search_text,
    network: DBRental.network,
    chainId: DBRental.chain_id,
    expiration: DBRental.expiration.getTime(),
    signature: DBRental.signature,
    nonces: DBRental.nonces,
    tokenId: DBRental.token_id,
    contractAddress: DBRental.contract_address,
    rentalContractAddress: DBRental.rental_contract_address,
    lessor: DBRental.lessor,
    tenant: DBRental.tenant,
    status: DBRental.status,
    createdAt: DBRental.created_at.getTime(),
    updatedAt: DBRental.updated_at.getTime(),
    startedAt: DBRental.started_at ? DBRental.started_at.getTime() : null,
    periods: DBRental.periods.map(fromDBPeriodToPeriod),
  }
}

function fromDBPeriodToPeriod(DBPeriod: Omit<DBPeriods, "id">): Period {
  return {
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
    expiration: fromMillisecondsToSeconds(new Date(rental.expiration).getTime()).toString(),
    nonces: rental.nonces,
    pricePerDay: rental.periods.map((period) => period.pricePerDay),
    maxDays: rental.periods.map((period) => period.maxDays.toString()),
    minDays: rental.periods.map((period) => period.minDays.toString()),
    signature: rental.signature,
  }
}

export function fromDBGetRentalsListingsToRentalListings(DBRentals: DBGetRentalListing[]): RentalListing[] {
  return DBRentals.map((rental) => ({
    id: rental.id,
    category: rental.category,
    search_text: rental.search_text,
    network: rental.network,
    chainId: rental.chain_id,
    expiration: rental.expiration.getTime(),
    signature: rental.signature,
    nonces: rental.nonces,
    tokenId: rental.token_id,
    contractAddress: rental.contract_address,
    rentalContractAddress: rental.rental_contract_address,
    lessor: rental.lessor,
    tenant: rental.tenant,
    status: rental.status,
    createdAt: rental.created_at.getTime(),
    updatedAt: rental.updated_at.getTime(),
    startedAt: rental.started_at ? rental.started_at.getTime() : null,
    periods: rental.periods.map((period) => ({
      minDays: period[1],
      maxDays: period[2],
      pricePerDay: period[3],
    })),
  }))
}
