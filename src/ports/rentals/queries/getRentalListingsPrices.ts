import { RentalStatus } from "@dcl/schemas"
import SQL, { SQLStatement } from "sql-template-strings"
import { GetRentalListingsPricesFilters } from "../types"

export function getRentalListingsPricesQuery(filters: GetRentalListingsPricesFilters = {}): SQLStatement {
  const { adjacentToRoad, minDistanceToPlaza, maxDistanceToPlaza, minEstateSize, maxEstateSize, rentalDays, category } =
    filters

  const query = SQL`SELECT q.price_per_day, COUNT(*) FROM (SELECT DISTINCT p.price_per_day, r.id FROM periods p, metadata m, rentals r WHERE p.rental_id = r.id AND m.id = r.metadata_id AND r.status = ${RentalStatus.OPEN} `

  if (category) {
    query.append(SQL`AND m.category = ${category} `)
  }

  if (adjacentToRoad !== undefined) {
    query.append(SQL`AND m.adjacent_to_road = ${adjacentToRoad} `)
  }

  if (minEstateSize !== undefined) {
    query.append(SQL`AND m.estate_size >= ${minEstateSize} `)
  }

  if (maxEstateSize !== undefined) {
    query.append(SQL`AND m.estate_size <= ${maxEstateSize} `)
  }

  if (minDistanceToPlaza !== undefined) {
    query.append(SQL`AND m.distance_to_plaza >= ${minDistanceToPlaza} `)
  }

  if (maxDistanceToPlaza !== undefined) {
    query.append(SQL`AND m.distance_to_plaza <= ${maxDistanceToPlaza} `)
  }

  if (rentalDays && rentalDays.length) {
    query.append(SQL`AND (`)
    rentalDays.forEach((rentalDay, index) => {
      query.append(SQL`(p.min_days <= ${rentalDay} AND p.max_days >= ${rentalDay})`)
      if (index < rentalDays.length - 1) {
        query.append(` OR `)
      }
    })
    query.append(SQL`) `)
  }


  query.append(`) as q GROUP BY q.price_per_day`)
  return query
}
