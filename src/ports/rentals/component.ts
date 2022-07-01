import SQL, { SQLStatement } from "sql-template-strings"
import { ethers } from "ethers"
import {
  fromRentalCreationToContractRentalListing,
  fromMillisecondsToSeconds,
  fromSecondsToMilliseconds,
} from "../../adapters/rentals"
import { verifyRentalsListingSignature } from "../../logic/rentals"
import { AppComponents } from "../../types"
import { InvalidSignature, NFTNotFound, RentalAlreadyExists, UnauthorizedToRent } from "./errors"
import {
  IRentalsComponent,
  RentalListingCreation,
  Status,
  DBRentalListing,
  NFT,
  DBRental,
  DBPeriods,
  DBInsertedRentalListing,
  RentalsListingsSortBy,
  FilterBy,
  SortDirection,
  DBGetRentalListing,
  BlockchainRental,
  DBMetadata,
} from "./types"

export function createRentalsComponent(
  components: Pick<AppComponents, "database" | "logs" | "marketplaceSubgraph" | "rentalsSubgraph">
): IRentalsComponent {
  const { database, marketplaceSubgraph, rentalsSubgraph, logs } = components
  const logger = logs.getLogger("rentals")

  function buildLogMessage(action: string, event: string, contractAddress: string, tokenId: string, lessor: string) {
    return `[${action}][${event}][contractAddress:${contractAddress}][tokenId:${tokenId}][lessor:${lessor}]`
  }

  async function getNFT(contractAddress: string, tokenId: string): Promise<NFT | null> {
    const queryResult = await marketplaceSubgraph.query<{
      nfts: NFT[]
    }>(
      `query NFTByTokenId($contractAddress: String, $tokenId: String) {
        nfts(first: 1 where: { tokenId: $tokenId, contractAddress: $contractAddress, searchIsLand: true }) {
          id,
          category,
          contractAddress,
          tokenId,
          owner {
            address
          },
          searchText,
          createdAt,
          updatedAt
        }
      }`,
      {
        contractAddress: contractAddress,
        tokenId: tokenId,
      }
    )

    return queryResult.nfts[0] ?? null
  }

  async function getLastBlockchainRental(contractAddress: string, tokenId: string): Promise<BlockchainRental | null> {
    const queryResult = await rentalsSubgraph.query<{
      rentals: BlockchainRental[]
    }>(
      `query RentalByContractAddressAndTokenId($contractAddress: String, $tokenId: String) {
        rentals(first: 1 orderBy: startedAt orderDirection: desc where: { tokenId: $tokenId, contractAddress: $contractAddress }) {
          id,
          contractAddress,
          tokenId,
          lessor,
          tenant,
          operator,
          rentalDays,
          startedAt,
          pricePerDay,
          sender,
          ownerHasClaimedAsset
        }
      }`,
      {
        contractAddress: contractAddress,
        tokenId: tokenId,
      }
    )

    return queryResult.rentals[0] ?? null
  }

  async function createRentalListing(
    rental: RentalListingCreation,
    lessorAddress: string
  ): Promise<DBInsertedRentalListing> {
    const buildLogMessageForRental = (event: string) =>
      buildLogMessage("Creating", event, rental.contractAddress, rental.tokenId, lessorAddress)

    logger.info(buildLogMessageForRental("Started"))

    // Verifying the signature
    const isSignatureValid = await verifyRentalsListingSignature(
      fromRentalCreationToContractRentalListing(lessorAddress, rental),
      rental.chainId
    )
    if (!isSignatureValid) {
      throw new InvalidSignature()
    }

    // Verify that there's no open rental in the contract
    const blockChainRental = await getLastBlockchainRental(rental.contractAddress, rental.tokenId)
    if (blockChainRental && ethers.BigNumber.from(blockChainRental.endsAt).gt(fromMillisecondsToSeconds(Date.now()))) {
      throw new RentalAlreadyExists(rental.contractAddress, rental.tokenId)
    }

    // Verifying that the NFT exists and that is owned by the lessor
    const nft = await getNFT(rental.contractAddress, rental.tokenId)

    if (!nft) {
      logger.info(buildLogMessageForRental("NFT not found"))
      throw new NFTNotFound(rental.contractAddress, rental.tokenId)
    }

    logger.info(buildLogMessageForRental("NFT found"))

    if (nft.owner.address !== lessorAddress) {
      throw new UnauthorizedToRent(nft.owner.address, lessorAddress)
    }

    logger.info(buildLogMessageForRental("Authorized"))

    // Inserting the new rental
    try {
      await database.query(SQL`BEGIN`)
      const createdMetadata = await database.query<DBMetadata>(
        SQL`INSERT INTO metadata (id, category, search_text, created_at) VALUES (${nft.id}, ${nft.category}, ${
          nft.searchText
        }, ${new Date(
          fromSecondsToMilliseconds(Number(nft.createdAt))
        )}) ON CONFLICT (id) DO UPDATE SET search_text = ${nft.searchText} RETURNING *`
      )
      logger.debug(buildLogMessageForRental("Inserted metadata"))

      const createdRental = await database.query<DBRental>(
        SQL`INSERT INTO rentals (metadata_id, network, chain_id, expiration, signature, nonces, token_id, contract_address, rental_contract_address, status) VALUES (${
          nft.id
        }, ${rental.network}, ${rental.chainId}, ${new Date(rental.expiration)}, ${rental.signature}, ${
          rental.nonces
        }, ${rental.tokenId}, ${rental.contractAddress}, ${rental.rentalContractAddress}, ${Status.OPEN}) RETURNING *`
      )
      logger.debug(buildLogMessageForRental("Inserted rental"))

      const createdRentalListing = await database.query<DBRentalListing>(
        SQL`INSERT INTO rentals_listings (id, lessor) VALUES (${createdRental.rows[0].id}, ${lessorAddress}) RETURNING *`
      )

      logger.debug(buildLogMessageForRental("Inserted rental listing"))

      const insertPeriodsQuery = SQL`INSERT INTO periods (min_days, max_days, price_per_day, rental_id) VALUES `
      rental.periods.forEach((period, index, periods) => {
        insertPeriodsQuery.append(
          SQL`(${period.minDays}, ${period.maxDays}, ${period.pricePerDay}, ${createdRental.rows[0].id})`.append(
            index !== periods.length - 1 ? "," : ""
          )
        )
      })
      insertPeriodsQuery.append(SQL` RETURNING *`)

      const createdPeriods = await database.query<DBPeriods>(insertPeriodsQuery)
      logger.debug(buildLogMessageForRental("Inserted periods"))

      await database.query(SQL`COMMIT`)

      return {
        ...createdRental.rows[0],
        ...createdRentalListing.rows[0],
        category: createdMetadata.rows[0].category,
        search_text: createdMetadata.rows[0].search_text,
        periods: createdPeriods.rows,
      }
    } catch (error) {
      logger.info(buildLogMessageForRental("Rolled-back query"))
      await database.query(SQL`ROLLBACK`)

      if ((error as any).constraint === "rentals_token_id_contract_address_status_unique_index") {
        throw new RentalAlreadyExists(nft.contractAddress, nft.tokenId)
      }

      throw new Error("Error creating rental")
    }
  }

  async function getRentalsListings(params: {
    sortBy: RentalsListingsSortBy | null
    sortDirection: SortDirection | null
    page: number
    limit: number
    filterBy: FilterBy | null
  }): Promise<DBGetRentalListing[]> {
    const { sortBy, page, limit, filterBy, sortDirection } = params

    const sortByParam = sortBy ?? RentalsListingsSortBy.RENTAL_LISTING_DATE
    const sortDirectionParam = sortDirection ?? SortDirection.ASC

    const filterByCategory = filterBy?.category ? SQL`AND category = ${filterBy.category}` : SQL``
    const filterByStatus = filterBy?.status ? SQL`AND rentals.status = ${filterBy.status}` : SQL``
    const filterByLessor = filterBy?.lessor ? SQL`AND rentals_listings.lessor = ${filterBy.lessor}` : SQL``
    const filterByTenant = filterBy?.tenant ? SQL`AND rentals_listings.tenant = ${filterBy.tenant}` : SQL``
    const filterBySearchText = filterBy?.text ? SQL`AND metadata.search_text ILIKE %${filterBy.text}%` : SQL``
    // TODO: Do period filtering by time and price

    let sortByQuery: SQLStatement
    switch (sortByParam) {
      case RentalsListingsSortBy.NAME:
        sortByQuery = SQL`ORDER BY metadata.search_text`
        break
      case RentalsListingsSortBy.RENTAL_LISTING_DATE:
        sortByQuery = SQL`ORDER BY rentals.created_at`
        break
      case RentalsListingsSortBy.RENTAL_PRICE:
        // TODO: check how is it returned after the query.
        sortByQuery = SQL`ORDER BY periods.price_per_day`
        break
      default:
        sortByQuery = SQL`ORDER BY rentals.created_at`
        break
    }
    sortByQuery = sortByQuery && sortByQuery.sql !== "" ? sortByQuery.append(" " + sortDirectionParam) : sortByQuery

    const results = await database.query<DBGetRentalListing>(
      SQL`SELECT rentals.*, rentals_listings.tenant, rentals_listings.lessor, metadata.category, metadata.search_text, metadata.created_at as metadata_created_at,
      COUNT(*) OVER() as rentals_listings_count, array_agg(ARRAY[periods.id, periods.min_days, periods.max_days, periods.price_per_day] ORDER BY min_days, max_days) as periods
      FROM rentals, rentals_listings, metadata, periods WHERE  
      rentals.id = rentals_listings.id AND
      metadata.id = rentals.metadata_id AND
      periods.rental_id = rentals.id
      ${filterByCategory}
      ${filterByStatus}
      ${filterByLessor}
      ${filterByTenant}
      ${filterBySearchText}
      ${sortByQuery}
      GROUP BY rentals.id, rentals_listings.id, metadata.id
      LIMIT ${limit} OFFSET ${page}`
    )

    return results.rows
  }

  return {
    createRentalListing,
    getRentalsListings,
  }
}
