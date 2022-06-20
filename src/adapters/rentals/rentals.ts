import { ContractRentalListing } from "../../logic/rentals/types"
import { DBPeriods, RentalListingCreation, DBInsertedRentalListing, DBGetRentalListings } from "../../ports/rentals"
import { Period, RentalListing } from "./types"

export function fromDBInsertedRentalListingToRental(DBRental: DBInsertedRentalListing): RentalListing {
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
    expiration: rental.expiration.toString(),
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
    network: rental.network,
    chainId: rental.chain_id,
    expiration: rental.expiration,
    signature: rental.signature,
    nonces: rental.nonces,
    tokenId: rental.token_id,
    contractAddress: rental.contract_address,
    rentalContractAddress: rental.rental_contract_address,
    lessor: rental.lessor,
    tenant: rental.tenant,
    status: rental.status,
    createdAt: rental.created_at,
    updatedAt: rental.updated_at,
    periods: rental.periods.map((period) => ({
      id: period[0],
      minDays: period[1],
      maxDays: period[2],
      pricePerDay: period[3],
    })),
  }))
}
