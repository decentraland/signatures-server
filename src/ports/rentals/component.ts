import SQL, { SQLStatement } from "sql-template-strings"
import { ChainName, getChainId } from "@dcl/schemas"
import { getNetwork } from "@dcl/schemas/dist/dapps/chain-id"
import { ethers } from "ethers"
import pLimit from "p-limit"
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
  UpdateType,
} from "./types"
import { buildQueryParameters } from "./graph"

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
  const MAX_GRAPH_FIRST = 1000

  function buildLogMessage(action: string, event: string, contractAddress: string, tokenId: string, lessor: string) {
    return `[${action}][${event}][contractAddress:${contractAddress}][tokenId:${tokenId}][lessor:${lessor}]`
  }

  async function getNFTsFromIndexer(options?: {
    filterBy?: Partial<Omit<NFT, "owner"> & { updatedAt_gt: string; id_gt: string }>
    first?: number
    orderBy?: keyof Omit<NFT, "owner">
    orderDirection?: "desc" | "asc"
  }): Promise<NFT[]> {
    const { queryVariables, querySignature } = buildQueryParameters<NFT & { updatedAt_gt: string; id_gt: string }>(
      options?.filterBy,
      options?.first,
      options?.orderBy,
      options?.orderDirection
    )
    const variables = options?.filterBy
      ? Object.fromEntries(Object.entries(options.filterBy).filter(([_, value]) => value))
      : undefined

    const queryResult = await marketplaceSubgraph.query<{
      nfts: NFT[]
    }>(
      `query NFTByTokenId(${queryVariables}) {
        nfts(${querySignature}) {
          id,
          category,
          contractAddress,
          tokenId,
          owner {
            address
          },
          searchText,
          searchIsLand,
          createdAt,
          updatedAt
        }
      }`,
      variables
    )
    return queryResult.nfts
  }

  async function getRentalsFromIndexer(options: {
    filterBy?: Partial<IndexerRental & { updatedAt_gt: string; id_gt: string }>
    first: number
    orderBy?: keyof IndexerRental
    orderDirection?: "desc" | "asc"
  }): Promise<IndexerRental[]> {
    const { queryVariables, querySignature } = buildQueryParameters<
      IndexerRental & { updatedAt_gt: string; id_gt: string }
    >(options?.filterBy, options?.first, options?.orderBy, options?.orderDirection)

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
          signature,
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
    const [nft] = await getNFTsFromIndexer({
      filterBy: { contractAddress: rental.contractAddress, tokenId: rental.tokenId },
      first: 1,
    })

    if (!nft) {
      logger.info(buildLogMessageForRental("NFT not found"))
      throw new NFTNotFound(rental.contractAddress, rental.tokenId)
    }

    logger.info(buildLogMessageForRental("NFT found"))

    // The NFT must be owned by the lessor or by the rental contract through the lessor
    const lessorOwnsTheLand = nft.owner.address === lessorAddress
    const lessorOwnsTheLandThroughTheRentalContract =
      indexerRentals[0] &&
      nft.owner.address === indexerRentals[0].rentalContractAddress &&
      indexerRentals[0].lessor === lessorAddress

    if (!lessorOwnsTheLand && !lessorOwnsTheLandThroughTheRentalContract) {
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
    const filterByTokenId = filterBy?.tokenId ? SQL`AND rentals.token_id = ${filterBy.tokenId}\n` : ""
    const filterByContractAddress =
      filterBy?.contractAddresses && filterBy.contractAddresses.length > 0
        ? SQL`AND rentals.contract_address = ANY(${filterBy.contractAddresses})\n`
        : ""
    const filterByNetwork = filterBy?.network ? SQL`AND rentals.network = ${filterBy.network}\n` : ""

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
    query.append(filterByTokenId)
    query.append(filterByContractAddress)
    query.append(filterByNetwork)
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
    const [indexerRentals, [indexerNFT]] = await Promise.all([
      getRentalsFromIndexer({ first: 1, filterBy: { signature: rentalData.signature } }),
      getNFTsFromIndexer({
        filterBy: { contractAddress: rentalData.contract_address, tokenId: rentalData.token_id },
        first: 1,
      }),
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
    // Truncate the start time to seconds so we can interact with the blockchain date
    const startTime = new Date(fromSecondsToMilliseconds(fromMillisecondsToSeconds(Date.now())))
    logger.info(`[Metadata update][Start updates]`)
    const {
      rows: [metadataUpdateInfo],
    } = await database.query<{ updated_at: Date }>(
      SQL`SELECT updated_at FROM updates WHERE type = ${UpdateType.METADATA} ORDER BY updated_at DESC LIMIT 1`
    )
    logger.info(`[Metadata update][Last Update:${metadataUpdateInfo.updated_at.getTime()}]`)
    const lastUpdated = fromMillisecondsToSeconds(metadataUpdateInfo.updated_at.getTime()).toString()
    const client = await database.getPool().connect()
    let lastId: string | undefined
    try {
      await client.query("BEGIN")
      while (true) {
        const updatedNFTs = await getNFTsFromIndexer({
          filterBy: { updatedAt_gt: lastUpdated, searchIsLand: true, id_gt: lastId },
          first: MAX_GRAPH_FIRST,
        })
        logger.info(`[Metadata update][Metadata batch to update:${updatedNFTs.length}]`)
        // Limit the concurrent updates
        const limit = pLimit(MAX_CONCURRENT_RENTAL_UPDATES)
        const promiseOfUpdates = updatedNFTs.map((nft) =>
          limit(async () => {
            const { rowCount } = await client.query(
              SQL`UPDATE metadata SET category = ${nft.category}, search_text = ${
                nft.searchText
              }, updated_at = ${new Date(fromMillisecondsToSeconds(Number(nft.updatedAt)))} WHERE id = ${nft.id}`
            )
            logger.debug(`[Metadata update][Single update:${nft.id}][Start]`)
            // If the metadata to be updated doesn't exist don't continue with the update
            if (rowCount === 0) {
              logger.debug(`[Metadata update][Single update:${nft.id}][Does not exist in the DB]`)
              return
            }
            const { rows: idsOfOpenRentalsOfNFT } = await client.query<
              Pick<
                DBRental & DBRentalListing,
                "id" | "lessor" | "rental_contract_address" | "contract_address" | "token_id"
              >
            >(
              SQL`SELECT rentals.id, lessor, rental_contract_address, contract_address, token_id FROM rentals, rentals_listings
              WHERE metadata_id = ${nft.id} AND status = ${Status.OPEN} AND rentals.id = rentals_listings.id`
            )

            logger.debug(`[Metadata update][Single update:${nft.id}][Open rentals:${idsOfOpenRentalsOfNFT.length}]`)

            // If there's no rental listing to update, don't continue with the update
            if (!idsOfOpenRentalsOfNFT[0]) {
              return
            }

            const ownerIsContractAddress = nft.owner.address === idsOfOpenRentalsOfNFT[0].rental_contract_address
            const ownerIsTheSame = nft.owner.address === idsOfOpenRentalsOfNFT[0].lessor

            if (!ownerIsTheSame) {
              logger.debug(`[Metadata update][Single update:${nft.id}][The owner is not the same]`)

              if (ownerIsContractAddress) {
                logger.debug(`[Metadata update][Single update:${nft.id}][The owner is the rentals contract]`)
                const [rental] = await getRentalsFromIndexer({
                  first: 1,
                  filterBy: {
                    contractAddress: idsOfOpenRentalsOfNFT[0].contract_address,
                    tokenId: idsOfOpenRentalsOfNFT[0].token_id,
                  },
                  orderBy: "startedAt",
                  orderDirection: "desc",
                })

                // If the owner is still the same one as the listing through the rental contract, don't continue with the update
                if (nft.owner.address === rental?.lessor) {
                  return
                }
              }

              // Cancel the rental listing that now has a different owner
              await client.query(
                SQL`UPDATE rentals SET status = ${Status.CANCELLED} WHERE id = ${idsOfOpenRentalsOfNFT[0].id}`
              )
              logger.debug(`[Metadata update][Single update:${nft.id}][Cancelling listing due to a different owner]`)
            }
          })
        )

        const updates = await Promise.allSettled(promiseOfUpdates)
        const rejectedUpdates = updates.filter((result) => result.status === "rejected")
        if (rejectedUpdates.length > 0) {
          throw (rejectedUpdates[0] as PromiseRejectedResult).reason
        }

        logger.info(`[Metadata update][Successful finished batch]`)
        if (updatedNFTs.length < MAX_GRAPH_FIRST) {
          break
        }

        lastId = updatedNFTs[updatedNFTs.length - 1].id
      }
      await client.query(SQL`UPDATE updates SET updated_at = ${startTime} WHERE type = ${UpdateType.METADATA}`)
      await client.query("COMMIT")
      logger.info(`[Metadata update][Successful]`)
    } catch (error) {
      logger.info(`[Metadata update][Failed][${(error as any).message.substring(0, 40)}]`)
      await client.query("ROLLBACK")
    } finally {
      client.release()
    }
  }

  async function updateRentalsListings() {
    // Truncate the start time to seconds so we can interact with the blockchain date
    const startTime = new Date(fromSecondsToMilliseconds(fromMillisecondsToSeconds(new Date().getTime())))
    logger.info(`[Rentals update][Start updates]`)
    const { rows } = await database.query<{ updated_at: Date }>(
      SQL`SELECT updated_at FROM updates WHERE type = ${UpdateType.RENTALS} ORDER BY updated_at DESC LIMIT 1`
    )
    const client = await database.getPool().connect()
    let lastId: string | undefined
    try {
      await client.query("BEGIN")
      while (true) {
        const indexerRentals = await getRentalsFromIndexer({
          filterBy: { updatedAt_gt: fromMillisecondsToSeconds(rows[0].updated_at.getTime()).toString(), id_gt: lastId },
          first: MAX_GRAPH_FIRST,
        })
        logger.info(`[Rentals update][Batch of rentals:${indexerRentals.length}]`)

        // Limit the concurrent updates
        const limit = pLimit(MAX_CONCURRENT_RENTAL_UPDATES)

        const promiseOfUpdates = indexerRentals.map((rental) =>
          limit(async () => {
            logger.debug(
              `[Rentals update][Start rental update][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}]`
            )
            const {
              rows: [dbRental],
            } = await client.query<Pick<DBRental & DBRentalListing, "id" | "lessor" | "status">>(
              SQL`SELECT rentals.id, lessor, status FROM rentals, rentals_listings WHERE rentals.id = rentals_listings.id AND rentals.signature = ${rental.signature}`
            )
            logger.debug(
              `[Rentals update][Exists:${Boolean(dbRental)}][contractAddress:${rental.contractAddress}][tokenId:${
                rental.tokenId
              }]`
            )
            // If there's a rental in the database updated it, else, create it
            if (dbRental) {
              await Promise.all([
                client.query(
                  SQL`UPDATE rentals SET updated_at = ${new Date(
                    fromSecondsToMilliseconds(Number(rental.updatedAt))
                  )}, started_at = ${new Date(fromSecondsToMilliseconds(Number(rental.startedAt)))}, status = ${
                    Status.EXECUTED
                  } WHERE id = ${dbRental.id}`
                ),
                client.query(SQL`UPDATE rentals_listings SET tenant = ${rental.tenant} WHERE id = ${dbRental.id}`),
              ])
              logger.debug(
                `[Rentals update][Updated][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}]`
              )
            } else {
              // Check if the metadata exists by querying all rentals to see if one of them has the metadata attached to it
              const {
                rows: [metadataRow],
              } = await client.query<{ id: string }>(
                SQL`SELECT metadata.id FROM metadata LEFT JOIN rentals ON metadata.id = rentals.metadata_id
                WHERE rentals.token_id = ${rental.tokenId} AND rentals.contract_address = ${rental.contractAddress}`
              )
              let metadataId: string | undefined = metadataRow?.id
              if (!metadataRow) {
                const [nft] = await getNFTsFromIndexer({
                  filterBy: { tokenId: rental.tokenId, contractAddress: rental.contractAddress },
                  first: 1,
                })

                // There must be an NFT, if this is reached, ignore this update
                if (!nft) {
                  return
                }

                // As the metadata doesn't exist, create it
                await client.query(
                  SQL`INSERT INTO metadata (id, category, search_text, created_at, updated_at)
                  VALUES (${nft.id}, ${nft.category}, ${nft.searchText}, ${new Date(
                    fromSecondsToMilliseconds(Number(nft.createdAt))
                  )}, ${new Date(fromSecondsToMilliseconds(Number(nft.updatedAt)))})`
                )
                metadataId = nft.id
                logger.debug(
                  `[Rentals update][Inserted new metadata][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}]`
                )
              }

              // Create rental listing
              const defaultNonces = ["", "", ""]
              const startedAt = new Date(fromSecondsToMilliseconds(Number(rental.startedAt)))
              const {
                rows: [insertedRental],
              } = await client.query(
                SQL`INSERT INTO rentals (metadata_id, network, chain_id, expiration, signature, nonces, token_id, contract_address, rental_contract_address, status, created_at, updated_at, started_at)
                VALUES (${metadataId}, ${NETWORK}, ${getChainId(CHAIN_NAME)}, ${new Date(0)}, ${
                  rental.signature
                }, ${defaultNonces}, ${rental.tokenId}, ${rental.contractAddress}, ${rental.rentalContractAddress}, ${
                  Status.EXECUTED
                }, ${startedAt}, ${startedAt}, ${startedAt}) RETURNING id`
              )
              await client.query(
                SQL`INSERT INTO rentals_listings (id, lessor, tenant) VALUES (${insertedRental.id}, ${rental.lessor}, ${rental.tenant})`
              )
              logger.debug(
                `[Rentals update][Inserted rental][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}]`
              )
            }
          })
        )
        const updates = await Promise.allSettled(promiseOfUpdates)
        const rejectedUpdates = updates.filter((result) => result.status === "rejected")
        if (rejectedUpdates.length > 0) {
          throw (rejectedUpdates[0] as PromiseRejectedResult).reason
        }

        // Use last id to query the graph to avoid the indexing limit
        if (indexerRentals.length < MAX_GRAPH_FIRST) {
          break
        }
        lastId = indexerRentals[indexerRentals.length - 1].id
      }
      // Close all opened listings that expired
      await client.query(
        SQL`UPDATE rentals SET status = ${Status.CANCELLED} WHERE status = ${Status.OPEN} AND expiration < now()`
      )
      await client.query(SQL`UPDATE updates SET updated_at = ${startTime} WHERE type = ${UpdateType.RENTALS}`)
      await client.query("COMMIT")
      logger.info(`[Rentals update][Successful]`)
    } catch (error) {
      logger.info(`[Rentals update][Failed]`)
      await client.query("ROLLBACK")
    } finally {
      client.release()
    }
  }

  return {
    createRentalListing,
    refreshRentalListing,
    getRentalsListings,
    updateRentalsListings,
    updateMetadata,
  }
}
