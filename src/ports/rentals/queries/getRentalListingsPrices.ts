import SQL, { SQLStatement } from "sql-template-strings"
import { RentalsListingsFilterBy } from "@dcl/schemas"

export function getRentalListingsPricesQuery(
  filters: Pick<
    RentalsListingsFilterBy,
    "minDistanceToPlaza" | "maxDistanceToPlaza" | "adjacentToRoad" | "minEstateSize" | "maxEstateSize"
  >
): SQLStatement {
  const { adjacentToRoad, minDistanceToPlaza, maxDistanceToPlaza, minEstateSize, maxEstateSize } = filters

  const query = SQL`SELECT * FROM periods`

  console.log({ adjacentToRoad, minDistanceToPlaza, maxDistanceToPlaza, minEstateSize, maxEstateSize })
  
  return query
}
