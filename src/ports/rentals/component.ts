import SQL, { SQLStatement } from "sql-template-strings"
import pLimit from "p-limit"
import { ethers } from "ethers"
import {
  fromRentalCreationToContractRentalListing,
  fromMillisecondsToSeconds,
  fromSecondsToMilliseconds,
} from "../../adapters/rentals"
import { verifyRentalsListingSignature } from "../../logic/rentals"
import { AppComponents } from "../../types"
import { InvalidSignature, NFTNotFound, RentalAlreadyExists, RentalNotFound, UnauthorizedToRent } from "./errors"
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
  IndexerRental,
  DBMetadata,
} from "./types"
import { ChainName, getChainId } from "@dcl/schemas"
import { getNetwork } from "@dcl/schemas/dist/dapps/chain-id"
// import { getNetwork } from "@dcl/schemas/dist/dapps/chain-id"

export async function createRentalsComponent(
  components: Pick<AppComponents, "database" | "logs" | "marketplaceSubgraph" | "rentalsSubgraph" | "config">
): Promise<IRentalsComponent> {
  const { database, marketplaceSubgraph, rentalsSubgraph, logs, config } = components
  const logger = logs.getLogger("rentals")
  const CHAIN_NAME: ChainName = (await config.requireString("CHAIN_NAME")) as ChainName
  if (!Object.values(ChainName).includes(CHAIN_NAME)) {
    throw new Error("Invalid chain name")
  }
  const CHAIN_ID = getChainId(CHAIN_NAME)
  if (!CHAIN_ID) {
    throw new Error("There's no chain id for the chain name")
  }
  const NETWORK = getNetwork(CHAIN_ID)
  const MAX_CONCURRENT_RENTAL_UPDATES = await config.requireNumber("MAX_CONCURRENT_RENTAL_UPDATES")

  function buildLogMessage(action: string, event: string, contractAddress: string, tokenId: string, lessor: string) {
    return `[${action}][${event}][contractAddress:${contractAddress}][tokenId:${tokenId}][lessor:${lessor}]`
  }

  async function getLandOwner(contractAddress: string, tokenId: string): Promise<string> {
    const nft = await getNFT(contractAddress, tokenId)
    if (!nft) {
      throw new NFTNotFound(contractAddress, tokenId)
    }

    if (nft.owner.address === "rentals address") {
      const rentals = await getRentalsFromIndexer({
        filterBy: { contractAddress, tokenId },
        orderBy: "startedAt",
        orderDirection: "desc",
        first: 1,
      })

      if (!rentals) {
        throw new RentalNotFound()
      }
      return rentals[0].lessor
    }
    return nft?.owner.address
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
        contractAddress,
        tokenId,
      }
    )
    return queryResult.nfts[0] ?? null
  }

  async function getRentalsFromIndexer(options?: {
    filterBy?: Partial<IndexerRental & { updatedAt_gt: string; id_gt: string }>
    first?: number
    orderBy?: keyof IndexerRental
    orderDirection?: "desc" | "asc"
  }): Promise<IndexerRental[]> {
    let querySignature = ""
    let queryVariables = ""

    if (options?.first) {
      querySignature += `first: ${options.first} `
    }
    if (options?.orderBy) {
      querySignature += `orderBy: ${options.orderBy} `
    }
    if (options?.orderDirection) {
      querySignature += `orderDirection: ${options.orderDirection} `
    }
    if (options?.filterBy) {
      querySignature += `where: { ${Object.keys(options.filterBy).reduce((acc, key) => `${acc} ${key}: $${key}`, "")} }`
      queryVariables += Object.entries(options.filterBy)
        .map(([key, value]) => {
          let type: string
          if (typeof value === "string") {
            type = "String"
          } else if (typeof value === "number") {
            type = "Int"
          } else if (typeof value === "boolean") {
            type = "Boolean"
          } else {
            throw new Error("Can't parse filter by type")
          }

          return `$${key}: ${type}`
        })
        .join(" ")
    }

    const queryResult = await rentalsSubgraph.query<{
      rentals: IndexerRental[]
    }>(
      `query RentalByContractAddressAndTokenId(${queryVariables}) {
        rentals(${querySignature}) {
          id,
          contractAddress,
          rentalContractAddress,
          tokenId,
          lessor,
          tenant,
          operator,
          rentalDays,
          startedAt,
          updatedAt,
          pricePerDay,
          sender,
          ownerHasClaimedAsset
        }
      }`,
      options?.filterBy
    )

    return queryResult.rentals
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
    const indexerRentals = await getRentalsFromIndexer({
      filterBy: { contractAddress: rental.contractAddress, tokenId: rental.tokenId },
      orderBy: "startedAt",
      orderDirection: "desc",
      first: 1,
    })
    if (
      indexerRentals[0] &&
      ethers.BigNumber.from(indexerRentals[0].endsAt).gt(fromMillisecondsToSeconds(Date.now()))
    ) {
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

    const client = await database.getPool().connect()
    // Inserting the new rental
    try {
      await client.query(SQL`BEGIN`)
      const createdMetadata = await client.query<DBMetadata>(
        SQL`INSERT INTO metadata (id, category, search_text, created_at, updated_at) VALUES (${nft.id}, ${
          nft.category
        }, ${nft.searchText}, ${nft.updatedAt} ${new Date(
          fromSecondsToMilliseconds(Number(nft.createdAt))
        )}) ON CONFLICT (id) DO UPDATE SET search_text = ${nft.searchText} RETURNING *`
      )
      logger.debug(buildLogMessageForRental("Inserted metadata"))

      const createdRental = await client.query<DBRental>(
        SQL`INSERT INTO rentals (metadata_id, network, chain_id, expiration, signature, nonces, token_id, contract_address, rental_contract_address, status) VALUES (${
          nft.id
        }, ${rental.network}, ${rental.chainId}, ${new Date(rental.expiration)}, ${rental.signature}, ${
          rental.nonces
        }, ${rental.tokenId}, ${rental.contractAddress}, ${rental.rentalContractAddress}, ${Status.OPEN}) RETURNING *`
      )
      logger.debug(buildLogMessageForRental("Inserted rental"))

      const createdRentalListing = await client.query<DBRentalListing>(
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

      const createdPeriods = await client.query<DBPeriods>(insertPeriodsQuery)
      logger.debug(buildLogMessageForRental("Inserted periods"))

      await client.query(SQL`COMMIT`)

      return {
        ...createdRental.rows[0],
        ...createdRentalListing.rows[0],
        category: createdMetadata.rows[0].category,
        search_text: createdMetadata.rows[0].search_text,
        periods: createdPeriods.rows,
      }
    } catch (error) {
      logger.info(buildLogMessageForRental("Rolled-back query"))
      await client.query(SQL`ROLLBACK`)

      if ((error as any).constraint === "rentals_token_id_contract_address_status_unique_index") {
        throw new RentalAlreadyExists(nft.contractAddress, nft.tokenId)
      }

      throw new Error("Error creating rental")
    } finally {
      await client.release()
    }
  }

  async function getRentalsListings(params: {
    sortBy: RentalsListingsSortBy | null
    sortDirection: SortDirection | null
    filterBy: FilterBy | null
    page: number
    limit: number
  }): Promise<DBGetRentalListing[]> {
    const { sortBy, page, limit, filterBy, sortDirection } = params

    const sortByParam = sortBy ?? RentalsListingsSortBy.RENTAL_LISTING_DATE
    const sortDirectionParam = sortDirection ?? SortDirection.ASC

    const filterByCategory = filterBy?.category ? SQL`AND category = ${filterBy.category}\n` : ""
    const filterByStatus = filterBy?.status ? SQL`AND rentals.status = ${filterBy.status}\n` : ""
    const filterByLessor = filterBy?.lessor ? SQL`AND rentals_listings.lessor = ${filterBy.lessor}\n` : ""
    const filterByTenant = filterBy?.tenant ? SQL`AND rentals_listings.tenant = ${filterBy.tenant}\n` : ""
    const filterBySearchText = filterBy?.text
      ? SQL`AND metadata.search_text ILIKE '%' || ${filterBy.text} || '%'\n`
      : ""

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

    let query = SQL`SELECT rentals.*, metadata.category, metadata.search_text, metadata.created_at as metadata_created_at FROM metadata,
      (SELECT rentals.*, rentals_listings.tenant, rentals_listings.lessor,
      COUNT(*) OVER() as rentals_listings_count, array_agg(ARRAY[periods.min_days, periods.max_days, periods.price_per_day] ORDER BY periods.id) as periods,
      min(periods.price_per_day) as min_price_per_day, max(periods.price_per_day) as max_price_per_day
      FROM rentals, rentals_listings, periods WHERE  
      rentals.id = rentals_listings.id AND
      periods.rental_id = rentals.id\n`
    query.append(filterByCategory)
    query.append(filterByStatus)
    query.append(filterByLessor)
    query.append(filterByTenant)
    query.append(
      SQL`GROUP BY rentals.id, rentals_listings.id, periods.rental_id LIMIT ${limit} OFFSET ${page}) as rentals\n`
    )
    query.append("WHERE metadata.id = rentals.metadata_id\n")
    query.append(filterBySearchText)
    query.append(sortByQuery)

    const results = await database.query<DBGetRentalListing>(query)
    return results.rows
  }

  async function refreshRentalListing(rentalId: string) {
    logger.info(`[Refresh][Start][${rentalId}]`)
    const rentalQueryResult = await database.query<{
      id: string
      contract_address: string
      token_id: string
      updated_at: Date
      metadata_updated_at: Date
      metadata_id: string
      signature: string
    }>(
      SQL`SELECT rentals.id, rentals.contract_address, rentals.token_id, rentals.updated_at, rentals.signature, metadata.id as metadata_id, metadata.updated_at as metadata_updated_at
      FROM rentals, metadata
      WHERE rentals.id = ${rentalId} AND metadata.id = rentals.metadata_id`
    )

    if (rentalQueryResult.rowCount === 0) {
      throw new RentalNotFound(rentalId)
    }

    const rentalData = rentalQueryResult.rows[0]
    const [indexerRentals, indexerNFT] = await Promise.all([
      getRentalsFromIndexer({ filterBy: { signature: rentalData.signature } }),
      getNFT(rentalData.contract_address, rentalData.token_id),
    ])

    if (!indexerNFT) {
      throw new NFTNotFound(rentalData.contract_address, rentalData.token_id)
    }
    const indexerNFTLastUpdate = fromSecondsToMilliseconds(Number(indexerNFT.updatedAt))
    const indexerRentalLastUpdate =
      indexerRentals.length > 0 ? fromSecondsToMilliseconds(Number(indexerRentals[0].updatedAt)) : 0

    const promisesOfUpdate: Promise<any>[] = []
    // Update metadata
    if (indexerNFTLastUpdate > rentalData.metadata_updated_at.getTime()) {
      logger.info(`[Refresh][Update metadata][${rentalId}]`)
      promisesOfUpdate.push(
        database.query(
          SQL`UPDATE metadata SET search_text = ${indexerNFT.searchText} updated_at = ${rentalData.updated_at} WHERE id = ${rentalData.metadata_id}`
        )
      )
    }

    // Identify the latest blockchain rental
    if (indexerRentalLastUpdate > rentalData.updated_at.getTime()) {
      logger.info(`[Refresh][Update rental][${rentalId}]`)
      promisesOfUpdate.push(
        database.query(
          SQL`UPDATE rentals SET updated_at = ${new Date(indexerRentalLastUpdate)}, status = ${
            Status.EXECUTED
          }, started_at = ${new Date(fromSecondsToMilliseconds(Number(indexerRentals[0].startedAt)))} WHERE id = ${
            rentalData.id
          }`
        ),
        database.query(
          SQL`UPDATE rentals_listings SET tenant = ${indexerRentals[0].tenant} WHERE id = ${rentalData.id}`
        )
      )
    }

    await Promise.all(promisesOfUpdate)

    // Return the updated rental listing
    const result =
      await database.query<DBGetRentalListing>(SQL`SELECT rentals.*, metadata.category, metadata.search_text, metadata.created_at as metadata_created_at FROM metadata, 
    (SELECT rentals.*, rentals_listings.tenant, rentals_listings.lessor, COUNT(*) OVER() as rentals_listings_count, 
      array_agg(ARRAY[periods.min_days, periods.max_days, periods.price_per_day] ORDER BY periods.id) as periods FROM rentals, rentals_listings, periods
      WHERE rentals.id = rentals_listings.id AND periods.rental_id = rentals.id
      GROUP BY rentals.id, rentals_listings.id, periods.rental_id) as rentals
    WHERE metadata.id = rentals.metadata_id AND rentals.id = ${rentalId}`)
    return result.rows[0]
  }

  async function updateMetadata() {
    const { rows } = await database.query<{ updated_at: Date }>(
      "SELECT updated_at FROM updates WHERE type = 'metadata' ORDER BY updated_at DESC LIMIT 1"
    )
    const lastUpdated = rows[0]
    // await getNFT()
  }

  // async function cancel

  async function updateRentalListings() {
    // This is just a placeholder
    const RENTAL_CONTRACT_ADDRESS = ""
    const startTime = fromMillisecondsToSeconds(new Date().getTime())
    // How do we clearly identify the time we should update from?
    const { rows } = await database.query<{ updated_at: Date }>(
      "SELECT updated_at FROM updates ORDER BY updated_at DESC LIMIT 1"
    )
    const client = await database.getPool().connect()
    let hasUpdates = false
    let lastId: string | undefined
    try {
      await client.query("BEGIN")
      while (hasUpdates) {
        const indexerRentals = await getRentalsFromIndexer({
          filterBy: { updatedAt_gt: fromMillisecondsToSeconds(rows[0].updated_at.getTime()).toString(), id_gt: lastId },
          first: 5000,
        })

        // Use last id to query the graph to avoid the indexing limit
        if (indexerRentals.length < 5000) {
          hasUpdates = true
        } else {
          lastId = indexerRentals[indexerRentals.length - 1].id
        }

        // Limit the concurrent updates
        const limit = pLimit(MAX_CONCURRENT_RENTAL_UPDATES)

        const promiseOfUpdates = indexerRentals.map((rental) =>
          limit(async () => {
            const { rows: rentalsRows } = await client.query<{ id: string, lessor: string, status: Status }>(SQL`SELECT id, lessor, status from rentals WHERE signature = ${rental.signature}`)
            const nft = await getNFT(rental.signature, rental.tokenId)
            if (!nft) {
              // skip update, this is an error state
              return
            }
            
            // Insert or update metadata
            const { rows: metadataRows } = await client.query<DBMetadata>(
              SQL`INSERT INTO metadata (id, category, search_text, created_at, updated_at) VALUES (${nft.id}, ${
                nft.category
              }, ${nft.searchText}, ${nft.updatedAt} ${new Date(
                fromSecondsToMilliseconds(Number(nft.createdAt))
              )}) ON CONFLICT DO UPDATE SET search_text = ${nft.searchText}, updated_at = ${nft.updatedAt} RETURNING *`
              // Use updated at here or use not?
            )

            // Update the rental if it already exists
            if (rentalsRows.length > 0) {
              // Check if the is still owned by the owner
              if (nft.owner.address !== rentalsRows[0].lessor) {
                // If the owner is the rental contract and the rental is still open, cancel it
                if (nft.owner.address === rental.rentalContractAddress && rentalsRows[0].status === Status.OPEN) {
                  rental.
                }
                rentalsRows[0].lessor
              }

              // Update rental
            } else {
              // Check if the metadata exists & insert it

              // Insert rental

              // Insert rental listing
            }

            // let metadata: DBMetadata
            // const metadataResult = await client.query(
              // SQL`SELECT metadata WHERE contractAddress = ${rental.contractAddress} AND tokenId = ${rental.tokenId}`
            // ) // => We need to search the metadata by contractAddress and tokenId here
            // Metadata doesn't exist
            if (metadataResult.rowCount != 0) {
              // const nft = await getNFT(rental.signature, rental.tokenId)
              // if (!nft) {
              //   // skip update, this is an error state
              //   return
              // }
              const createdMetadata = await client.query<DBMetadata>(
                SQL`INSERT INTO metadata (id, category, search_text, created_at, updated_at) VALUES (${nft.id}, ${
                  nft.category
                }, ${nft.searchText}, ${nft.updatedAt} ${new Date(
                  fromSecondsToMilliseconds(Number(nft.createdAt))
                )}) RETURNING *`
              )

              metadata = createdMetadata.rows[0]
            } else {
              metadata = metadataResult.rows[0]
            }

            // Should updated at be updated or should it be the same value from the blockchain?
            const SOME_UPDATED_AT_DATE = new Date()

            // Insert or update rental listings based on the indexer's information
            const rentalResult = await client.query(
              SQL`INSERT INTO rentals (metadata_id, network, chain_id, expiration, signature, nonces, token_id, contract_address, rental_contract_address, status) VALUES (${
                metadata.id
              }, ${NETWORK}, ${getChainId(CHAIN_NAME)}, ${new Date(0)}, ${rental.signature}, ${["", "", ""]}, ${
                rental.tokenId
              }, ${rental.contractAddress}, ${RENTAL_CONTRACT_ADDRESS}, ${
                Status.OPEN
              }) ON CONFLICT DO UPDATE SET status = ${
                Status.EXECUTED
              }, updated_at = ${SOME_UPDATED_AT_DATE}, started_at = ${new Date(
                fromSecondsToMilliseconds(Number(rental.startedAt))
              )} RETURNING *`
            )

            await client.query(
              SQL`INSERT INTO rentals_listings VALUES () WHERE id = ${rentalResult.rows[0].signature} ON CONFLICT DO UPDATE SET tenant = ${rental.tenant}`
            )
          })
        )

        await Promise.all(promiseOfUpdates)
      }
      await client.query("COMMIT")
    } finally {
      await client.query(SQL`UPDATE updates SET updated_at = ${new Date(startTime)}`)
      client.release()
    }
  }

  return {
    createRentalListing,
    refreshRentalListing,
    getRentalsListings,
    updateRentalListings,
  }
}
