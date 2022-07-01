import { ContractRentalListing } from "../../logic/rentals/types"
import { DBPeriods, RentalListingCreation, DBInsertedRentalListing } from "../../ports/rentals"
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
