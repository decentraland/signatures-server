import { ContractRentalListing } from "../../logic/rentals/types"
import { DBPeriods, RentalListingCreation, DBInsertedRentalListing, DBGetRentalListings } from "../../ports/rentals"
import { fromMillisecondsToSeconds } from "./time"
import { Period, RentalListing } from "./types"

export function fromDBInsertedRentalListingToRental(DBRental: DBInsertedRentalListing): RentalListing {
  return {
    id: DBRental.id,
    category: DBRental.category,
    search_text: DBRental.search_text,
    network: DBRental.network,
    chainId: DBRental.chain_id,
    expiration: DBRental.expiration.toISOString(),
    signature: DBRental.signature,
    nonces: DBRental.nonces,
    tokenId: DBRental.token_id,
    contractAddress: DBRental.contract_address,
    rentalContractAddress: DBRental.rental_contract_address,
    lessor: DBRental.lessor,
    tenant: DBRental.tenant,
    status: DBRental.status,
    createdAt: DBRental.created_at.toISOString(),
    updatedAt: DBRental.updated_at.toISOString(),
    periods: DBRental.periods.map(fromDBPeriodToPeriod),
  }
}

function fromDBPeriodToPeriod(DBPeriod: DBPeriods): Period {
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
    expiration: fromMillisecondsToSeconds(new Date(rental.expiration).getTime()).toString(),
    nonces: rental.nonces,
    pricePerDay: rental.periods.map((period) => period.pricePerDay),
    maxDays: rental.periods.map((period) => period.maxDays.toString()),
    minDays: rental.periods.map((period) => period.minDays.toString()),
    signature: rental.signature,
  }
}

export function fromDBGetRentalsListingsToRentalListings(DBRentals: DBGetRentalListings[]): RentalListing[] {
  return DBRentals.map((rental) => ({
    id: rental.id,
    category: rental.category,
    search_text: rental.search_text,
    network: rental.network,
    chainId: rental.chain_id,
    expiration: rental.expiration.toISOString(),
    signature: rental.signature,
    nonces: rental.nonces,
    tokenId: rental.token_id,
    contractAddress: rental.contract_address,
    rentalContractAddress: rental.rental_contract_address,
    lessor: rental.lessor,
    tenant: rental.tenant,
    status: rental.status,
    createdAt: rental.created_at.toISOString(),
    updatedAt: rental.updated_at.toISOString(),
    periods: rental.periods.map((period) => ({
      id: period[0],
      minDays: period[1],
      maxDays: period[2],
      pricePerDay: period[3],
    })),
  }))
}
