import SQL, { SQLStatement } from "sql-template-strings"
import { RentalsListingsFilterBy, RentalsListingSortDirection, RentalsListingsSortBy, RentalStatus } from "@dcl/schemas"

export function getRentalsFilters(
  filterBy: (RentalsListingsFilterBy & { status?: RentalStatus[] }) | null
): SQLStatement {
  if (!filterBy) {
    return SQL``
  }

  const filterQuery = SQL``

  if (filterBy.status && filterBy.status.length > 0) {
    filterQuery.append(SQL`AND rentals.status = ANY(${filterBy.status})\n`)
  }

  if (filterBy.target) {
    filterQuery.append(SQL`AND rentals.target = ${filterBy.target}\n`)
  }

  if (filterBy.updatedAfter) {
    filterQuery.append(SQL`AND rentals.updated_at > ${new Date(filterBy.updatedAfter)}\n`)
  }

  if (filterBy.tokenId) {
    filterQuery.append(SQL`AND rentals.token_id = ${filterBy.tokenId}\n`)
  }

  if (filterBy.contractAddresses && filterBy.contractAddresses.length > 0) {
    filterQuery.append(SQL`AND rentals.contract_address = ANY(${filterBy.contractAddresses})\n`)
  }

  if (filterBy.network) {
    filterQuery.append(SQL`AND rentals.network = ${filterBy.network}\n`)
  }

  if (filterBy.lessor) {
    filterQuery.append(SQL`AND rentals_listings.lessor = ${filterBy.lessor}\n`)
  }

  if (filterBy.tenant) {
    filterQuery.append(SQL`AND rentals_listings.tenant = ${filterBy.tenant}\n`)
  }

  if (filterBy.nftIds && filterBy.nftIds.length) {
    filterQuery.append(SQL`AND rentals.metadata_id = ANY(${filterBy.nftIds})\n`)
  }
  return filterQuery
}

export function getRentalsMetadataFilters(
  filterBy: (RentalsListingsFilterBy & { status?: RentalStatus[] }) | null
): SQLStatement {
  if (!filterBy) {
    return SQL``
  }

  const metadataQuery = SQL``

  if (filterBy.category) {
    metadataQuery.append(SQL`AND metadata.category = ${filterBy.category}\n`)
  }

  if (filterBy.text) {
    metadataQuery.append(SQL`AND metadata.search_text ILIKE '%' || ${filterBy.text} || '%'\n`)
  }

  if (filterBy.minDistanceToPlaza) {
    metadataQuery.append(SQL`AND metadata.distance_to_plaza >= ${filterBy.minDistanceToPlaza}\n`)
  }

  if (filterBy.maxDistanceToPlaza) {
    if (!filterBy.minDistanceToPlaza) {
      metadataQuery.append(SQL`AND metadata.distance_to_plaza >= 0\n`)
    }

    metadataQuery.append(SQL`AND metadata.distance_to_plaza <= ${filterBy.maxDistanceToPlaza}\n`)
  }

  if (filterBy.adjacentToRoad !== undefined) {
    metadataQuery.append(SQL`AND metadata.adjacent_to_road = ${filterBy.adjacentToRoad === true}\n`)
  }

  if (filterBy.minEstateSize && filterBy.minEstateSize >= 0) {
    metadataQuery.append(SQL`AND metadata.estate_size >= ${filterBy.minEstateSize}\n`)
  }

  if (filterBy.maxEstateSize) {
    metadataQuery.append(SQL`AND metadata.estate_size <= ${filterBy.maxEstateSize}\n`)
  }

  return metadataQuery
}

export function getRentalsGroupByFilters(filterBy: (RentalsListingsFilterBy & { status?: RentalStatus[] }) | null): SQLStatement {
  if (!filterBy) {
    return SQL``
  }

  let groupByQuery = SQL``

  if (filterBy.minPricePerDay) {
    groupByQuery.append(SQL` HAVING max(periods.price_per_day) >= ${filterBy.minPricePerDay}\n`)
  }

  if (filterBy.maxPricePerDay) {
    if (!filterBy.minPricePerDay) {
      groupByQuery.append(SQL` HAVING `)
    } else {
      groupByQuery.append(SQL` AND `)
    }
    groupByQuery.append(SQL`min(periods.price_per_day) <= ${filterBy.maxPricePerDay}\n`)
  }

  return groupByQuery
}

export function getRentalsOrderBy(
  sortBy: RentalsListingsSortBy | null,
  sortDirection: RentalsListingSortDirection | null
) {
  const sortByParam = sortBy ?? RentalsListingsSortBy.RENTAL_LISTING_DATE
  const sortDirectionParam = sortDirection ?? RentalsListingSortDirection.ASC

  let sortByQuery: SQLStatement | string = `ORDER BY rentals.created_at ${sortDirectionParam}\n`
  switch (sortByParam) {
    case RentalsListingsSortBy.LAND_CREATION_DATE:
      sortByQuery = `ORDER BY metadata.created_at ${sortDirectionParam}\n`
      break
    case RentalsListingsSortBy.NAME:
      sortByQuery = `ORDER BY metadata.search_text ${sortDirectionParam}\n`
      break
    case RentalsListingsSortBy.RENTAL_LISTING_DATE:
      sortByQuery = `ORDER BY rentals.created_at ${sortDirectionParam}\n`
      break
    case RentalsListingsSortBy.MAX_RENTAL_PRICE:
      sortByQuery = `ORDER BY rentals.max_price_per_day ${sortDirectionParam}\n`
      break
    case RentalsListingsSortBy.MIN_RENTAL_PRICE:
      sortByQuery = `ORDER BY rentals.min_price_per_day ${sortDirectionParam}\n`
      break
  }

  return sortByQuery
}

export function getRentalListingsQuery(
  params: {
    sortBy: RentalsListingsSortBy | null
    sortDirection: RentalsListingSortDirection | null
    filterBy: (RentalsListingsFilterBy & { status?: RentalStatus[] }) | null
    offset: number
    limit: number
  },
  getHistoricData?: boolean
) {
  const { filterBy, sortBy, sortDirection, limit, offset } = params

  const rentalsQuery = SQL`(SELECT `
  if (getHistoricData) {
    rentalsQuery.append(SQL`DISTINCT ON (rentals.metadata_id)`)
  }

  rentalsQuery.append(SQL`rentals.*,
    rentals_listings.tenant,
    rentals_listings.lessor,
    array_agg(ARRAY[periods.min_days::text, periods.max_days::text, periods.price_per_day::text] ORDER BY periods.min_days) as periods,
    min(periods.price_per_day) as min_price_per_day,
    max(periods.price_per_day) as max_price_per_day
  FROM rentals, rentals_listings, periods
  WHERE rentals.id = rentals_listings.id AND periods.rental_id = rentals.id\n`)
  rentalsQuery.append(getRentalsFilters(filterBy))
  rentalsQuery.append(SQL`GROUP BY rentals.id, rentals_listings.id, periods.rental_id\n`)
  rentalsQuery.append(getRentalsGroupByFilters(filterBy))
  rentalsQuery.append(SQL`ORDER BY rentals.metadata_id, rentals.created_at desc) as rentals\n`)

  let query = SQL`SELECT rentals.*, metadata.category, metadata.search_text, metadata.created_at as metadata_created_at, COUNT(*) OVER() as rentals_listings_count FROM metadata, `

  query.append(rentalsQuery)
  query.append(" WHERE metadata.id = rentals.metadata_id ")
  query.append(getRentalsMetadataFilters(filterBy))
  query.append(getRentalsOrderBy(sortBy, sortDirection))
  query.append(SQL`LIMIT ${limit} OFFSET ${offset}`)

  return query
}
