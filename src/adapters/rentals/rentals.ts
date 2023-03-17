import { RentalListing, RentalListingCreation, RentalListingPeriod } from "@dcl/schemas"
import { ContractRentalListing } from "../../logic/rentals/types"
import {
  DBInsertedRentalListing,
  DBGetRentalListing,
  DBInsertedRentalListingPeriods,
  DBGetRentalListingsPrice,
} from "../../ports/rentals"
import { fromMillisecondsToSeconds } from "./time"

export function fromDBInsertedRentalListingToRental(DBRental: DBInsertedRentalListing): RentalListing {
  return {
    id: DBRental.id,
    nftId: DBRental.metadata_id,
    category: DBRental.category,
    searchText: DBRental.search_text,
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
    target: DBRental.target,
    rentedDays: DBRental.rented_days,
  }
}

function parseDBPeriodText(DBPeriodText: string): RentalListingPeriod {
  const [minDays, maxDays, pricePerDay] = DBPeriodText.replace(/\(|\)/g, "").split(",")
  return {
    minDays: Number(minDays),
    maxDays: Number(maxDays),
    pricePerDay,
  }
}

export function fromDBPeriodToPeriod(DBPeriod: DBInsertedRentalListingPeriods): RentalListingPeriod {
  const { row } = DBPeriod
  const { maxDays, minDays, pricePerDay } = parseDBPeriodText(row)
  return {
    minDays,
    maxDays,
    pricePerDay,
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
    expiration: fromMillisecondsToSeconds(rental.expiration).toString(),
    indexes: rental.nonces,
    pricePerDay: rental.periods.map((period) => period.pricePerDay),
    maxDays: rental.periods.map((period) => period.maxDays.toString()),
    minDays: rental.periods.map((period) => period.minDays.toString()),
    signature: rental.signature,
    target: rental.target,
  }
}

export function fromDBGetRentalsListingsToRentalListings(DBRentals: DBGetRentalListing[]): RentalListing[] {
  return DBRentals.map((rental) => ({
    id: rental.id,
    category: rental.category,
    searchText: rental.search_text,
    network: rental.network,
    chainId: rental.chain_id,
    nftId: rental.metadata_id,
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
      minDays: Number(period[0]),
      maxDays: Number(period[1]),
      pricePerDay: period[2],
    })),
    target: rental.target,
    rentedDays: rental.rented_days,
  }))
}

export function fromDBGetRentalsListingsPricesToRentalListingsPrices(
  DBRentalPrices: DBGetRentalListingsPrice[]
): Record<string, number> {
  return DBRentalPrices.reduce<Record<string, number>>((prices, { price_per_day, count }) => {
    prices[price_per_day] = Number.parseInt(count)
    return prices
  }, {})
}
