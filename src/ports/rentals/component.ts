import SQL, { SQLStatement } from "sql-template-strings"
import {
  ChainName,
  getChainId,
  RentalStatus,
  RentalListingCreation,
  RentalsListingsFilterBy,
  RentalsListingSortDirection,
  RentalsListingsSortBy,
  NFTCategory,
} from "@dcl/schemas"
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
import {
  InvalidEstate,
  InvalidSignature,
  NFTNotFound,
  RentalAlreadyExists,
  RentalAlreadyExpired,
  RentalNotFound,
  UnauthorizedToRent,
} from "./errors"
import {
  IRentalsComponent,
  DBRentalListing,
  NFT,
  DBRental,
  DBInsertedRentalListing,
  DBGetRentalListing,
  IndexerRental,
  DBMetadata,
  UpdateType,
  IndexerIndexSignerUpdate,
  DBInsertedRentalListingPeriods,
  IndexerIndexAssetUpdate,
  IndexerIndexContractUpdate,
  IndexerIndexesHistoryUpdate,
  IndexerIndexesHistoryUpdateQuery,
  IndexUpdateEventType,
} from "./types"
import { buildQueryParameters } from "./graph"
import { generateECDSASignatureWithInvalidV, generateECDSASignatureWithValidV, hasECDSASignatureAValidV } from "./utils"
import { getRentalListingsQuery } from "./queries"

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
    filterBy?: Partial<
      Omit<NFT, "owner"> & {
        updatedAt_gt: string
        id_gt: string
        searchEstateSize: number
      }
    >
    first?: number
    orderBy?: keyof Omit<NFT, "owner">
    orderDirection?: "desc" | "asc"
  }): Promise<NFT[]> {
    const { queryVariables, querySignature } = buildQueryParameters<
      NFT & { updatedAt_gt: string; id_gt: string; searchEstateSize: number }
    >(options?.filterBy, options?.first, options?.orderBy, options?.orderDirection)
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
          updatedAt,
          searchEstateSize,
          searchDistanceToPlaza,
          searchAdjacentToRoad
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
          endsAt,
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

  async function getIndexUpdatesFromIndexer(options: {
    filterBy?: { signer: string; contractAddress: string; tokenId: string }
    first: number
    orderBy?: keyof IndexerIndexesHistoryUpdateQuery
    orderDirection?: "desc" | "asc"
  }): Promise<{
    contract: IndexerIndexContractUpdate[]
    signer: IndexerIndexSignerUpdate[]
    asset: IndexerIndexAssetUpdate[]
  }> {
    const { filterBy, first, orderBy, orderDirection } = options
    const { querySignature: signerUpdateSignature } = buildQueryParameters<IndexerIndexesHistoryUpdateQuery>(
      { signer: filterBy?.signer },
      first,
      orderBy,
      orderDirection
    )

    const { querySignature: contractUpdateSignature } = buildQueryParameters<IndexerIndexesHistoryUpdateQuery>(
      { contractAddress: filterBy?.contractAddress },
      first,
      orderBy,
      orderDirection
    )

    const { queryVariables, querySignature: assetUpdateSignature } =
      buildQueryParameters<IndexerIndexesHistoryUpdateQuery>(
        { contractAddress: filterBy?.contractAddress, tokenId: filterBy?.tokenId, signer: filterBy?.signer },
        first,
        orderBy,
        orderDirection
      )

    const query = `query IndexUpdates(${queryVariables}) {
      contract: indexesUpdateContractHistories(${contractUpdateSignature}){
        newIndex
      }
      signer: indexesUpdateSignerHistories(${signerUpdateSignature}){
        newIndex
      }
      asset: indexesUpdateAssetHistories(${assetUpdateSignature}){
        newIndex
        type
      }
    }`

    const queryResult = await rentalsSubgraph.query<{
      contract: IndexerIndexContractUpdate[]
      signer: IndexerIndexSignerUpdate[]
      asset: IndexerIndexAssetUpdate[]
    }>(query, options?.filterBy)

    return queryResult
  }

  async function getIndexesUpdateHistoriesFromIndexer(options: {
    filterBy?: Partial<IndexerIndexesHistoryUpdateQuery> & { date_gt: string }
    first: number
    orderBy?: keyof IndexerIndexesHistoryUpdate
    orderDirection?: "desc" | "asc"
  }): Promise<{ indexesUpdateHistories: IndexerIndexesHistoryUpdate[] }> {
    const { queryVariables, querySignature } = buildQueryParameters<IndexerIndexesHistoryUpdate>(
      options?.filterBy,
      options?.first,
      options?.orderBy,
      options?.orderDirection
    )

    const query = `query IndexesUpdateHistories(${queryVariables}) {
      indexesUpdateHistories(${querySignature}) {
        id
        date
        contractUpdate {
          id
          contractAddress
          newIndex
        }
        singerUpdate {
          id
          newIndex
          signer
        }
        assetUpdate {
          id
          type
          newIndex
          contractAddress
          tokenId
        }
      }
    }`

    const queryResult = await rentalsSubgraph.query<{
      indexesUpdateHistories: IndexerIndexesHistoryUpdate[]
    }>(query, options?.filterBy)

    return queryResult
  }

  async function createRentalListing(
    rental: RentalListingCreation,
    lessorAddress: string
  ): Promise<DBInsertedRentalListing> {
    const buildLogMessageForRental = (event: string) =>
      buildLogMessage("Creating", event, rental.contractAddress, rental.tokenId, lessorAddress)

    logger.info(buildLogMessageForRental("Started"))

    if (rental.expiration < Date.now()) {
      throw new RentalAlreadyExpired(rental.contractAddress, rental.tokenId, rental.expiration)
    }

    // Verifying the signature
    const isSignatureValid = await verifyRentalsListingSignature(
      fromRentalCreationToContractRentalListing(lessorAddress, rental),
      rental.chainId
    )
    if (!isSignatureValid) {
      if (!hasECDSASignatureAValidV(rental.signature)) {
        logger.error(buildLogMessageForRental("Invalid signature: ECDSA signature with V as 0 or 1"))
        throw new InvalidSignature("The server does not accept ECDSA signatures with V as 0 or 1")
      }
      logger.error(buildLogMessageForRental("Invalid signature"))
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

    if (nft.category === NFTCategory.ESTATE && nft.searchEstateSize === 0) {
      throw new InvalidEstate(nft.contractAddress, nft.tokenId)
    }

    logger.info(buildLogMessageForRental("Authorized"))

    const client = await database.getPool().connect()
    // Inserting the new rental
    try {
      await client.query(SQL`BEGIN`)
      const createdMetadata = await client.query<DBMetadata>(
        SQL`INSERT INTO metadata (
          id,
          category,
          search_text,
          distance_to_plaza,
          adjacent_to_road,
          estate_size,
          updated_at,
          created_at
        ) VALUES (
          ${nft.id},
          ${nft.category},
          ${nft.searchText},
          ${nft.searchDistanceToPlaza},
          ${nft.searchAdjacentToRoad},
          ${nft.searchEstateSize},
          ${new Date(fromSecondsToMilliseconds(Number(nft.updatedAt)))},
          ${new Date(fromSecondsToMilliseconds(Number(nft.createdAt)))}
        ) ON CONFLICT (id) DO UPDATE SET search_text = ${nft.searchText} RETURNING *`
      )
      logger.debug(buildLogMessageForRental("Inserted metadata"))

      const createdRental = await client.query<DBRental>(
        SQL`INSERT INTO rentals (metadata_id, network, chain_id, expiration, signature, nonces, token_id, contract_address, rental_contract_address, status, target) VALUES (${
          nft.id
        }, ${rental.network}, ${rental.chainId}, ${new Date(rental.expiration)}, ${rental.signature}, ${
          rental.nonces
        }, ${rental.tokenId}, ${rental.contractAddress}, ${rental.rentalContractAddress}, ${RentalStatus.OPEN}, ${
          rental.target
        }) RETURNING *`
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
      insertPeriodsQuery.append(SQL` RETURNING (min_days::text, max_days::text, price_per_day, rental_id)`)

      const createdPeriods = await client.query<DBInsertedRentalListingPeriods>(insertPeriodsQuery)
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

  async function getRentalsListings(
    params: {
      sortBy: RentalsListingsSortBy | null
      sortDirection: RentalsListingSortDirection | null
      filterBy: (RentalsListingsFilterBy & { status?: RentalStatus[] }) | null
      offset: number
      limit: number
    },
    getHistoricData?: boolean
  ): Promise<DBGetRentalListing[]> {
    logger.info("Staring to get the rental listings")
    const results = await database.query<DBGetRentalListing>(getRentalListingsQuery(params, getHistoricData))
    return results.rows
  }

  async function refreshRentalListing(rentalId: string, forceMetadataRefresh: boolean = false) {
    logger.info(`[Refresh][Start][${rentalId}]`)
    const startTime = new Date(fromSecondsToMilliseconds(fromMillisecondsToSeconds(Date.now())))
    const rentalQueryResult = await database.query<{
      id: string
      contract_address: string
      token_id: string
      updated_at: Date
      metadata_updated_at: Date
      metadata_id: string
      signature: string
      nonces: string[]
      status: RentalStatus
      lessor: string
      period_id: number
      max_days: number
      min_days: number
    }>(
      SQL`SELECT rentals.id, rentals.contract_address, rentals.token_id, rentals.updated_at, rentals.signature, rentals.nonces, rentals.status, metadata.id as metadata_id, metadata.updated_at as metadata_updated_at, rentals_listings.lessor as lessor, periods.id period_id, periods.max_days, periods.min_days 
      FROM rentals, periods, metadata, rentals_listings
      WHERE rentals.id = ${rentalId} AND metadata.id = rentals.metadata_id AND rentals_listings.id = ${rentalId} AND periods.rental_id = rentals.id`
    )

    if (rentalQueryResult.rowCount === 0) {
      throw new RentalNotFound(rentalId)
    }

    const rentalData = rentalQueryResult.rows[0]
    const signature = generateECDSASignatureWithValidV(rentalData.signature)
    const [indexerRentals, [indexerNFT], indexerIndexesUpdate] = await Promise.all([
      getRentalsFromIndexer({ first: 1, filterBy: { signature } }),
      getNFTsFromIndexer({
        filterBy: { contractAddress: rentalData.contract_address, tokenId: rentalData.token_id },
        first: 1,
      }),
      getIndexUpdatesFromIndexer({
        filterBy: {
          signer: rentalData.lessor,
          contractAddress: rentalData.contract_address,
          tokenId: rentalData.token_id,
        },
        first: 1,
        orderBy: "newIndex",
        orderDirection: "desc",
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
    if (indexerNFTLastUpdate > rentalData.metadata_updated_at.getTime() || forceMetadataRefresh) {
      logger.info(`[Refresh][Update metadata][${rentalId}]`)
      promisesOfUpdate.push(
        database.query(
          SQL`UPDATE metadata SET
            search_text = ${indexerNFT.searchText},
            updated_at = ${new Date(indexerNFTLastUpdate)},
            distance_to_plaza = ${indexerNFT.searchDistanceToPlaza},
            adjacent_to_road = ${indexerNFT.searchAdjacentToRoad},
            estate_size = ${indexerNFT.searchEstateSize}
            WHERE id = ${rentalData.metadata_id}`
        )
      )

      // If the nft has been transferred, but not to the rentals contract due to a rent starting or if the estate was dissolved,
      // cancel the rental listing
      if (
        (rentalData.status === RentalStatus.OPEN && indexerNFT.owner.address !== rentalData.lessor) ||
        (indexerNFT.category === NFTCategory.ESTATE && indexerNFT.searchEstateSize === 0)
      ) {
        database.query(SQL`UPDATE rentals SET status = ${RentalStatus.CANCELLED} WHERE id = ${rentalData.id}`)
      }
    }

    // Identify the latest blockchain rental
    if (indexerRentalLastUpdate > rentalData.updated_at.getTime()) {
      logger.info(`[Refresh][Update rental][${rentalId}]`)
      promisesOfUpdate.push(
        database.query(
          SQL`UPDATE rentals SET updated_at = ${new Date(indexerRentalLastUpdate)}, status = ${
            indexerRentals[0].ownerHasClaimedAsset ? RentalStatus.CLAIMED : RentalStatus.EXECUTED
          }, rented_days = ${indexerRentals[0].rentalDays}, period_chosen = ${
            rentalData.period_id
          }, started_at = ${new Date(
            fromSecondsToMilliseconds(Number(indexerRentals[0].startedAt))
          )}, signature = ${signature} WHERE id = ${rentalData.id}`
        ),
        database.query(
          SQL`UPDATE rentals_listings SET tenant = ${indexerRentals[0].tenant} WHERE id = ${rentalData.id}`
        )
      )
    } else if (
      indexerRentalLastUpdate === 0 &&
      rentalData.status === RentalStatus.OPEN &&
      !hasECDSASignatureAValidV(rentalData.signature)
    ) {
      logger.info(`[Refresh][Update rental signature][${rentalId}]`)
      // If the rental has not been executed and the signature is invalid, change it.
      promisesOfUpdate.push(
        database.query(SQL`UPDATE rentals SET signature = ${signature} WHERE id = ${rentalData.id}`)
      )
    }

    // Identify if there's any blockchain nonce update

    const hasContractIndexUpdate = Number(indexerIndexesUpdate.contract[0]?.newIndex) > Number(rentalData.nonces[0])
    const hasSignerIndexUpdate = Number(indexerIndexesUpdate.signer[0]?.newIndex) > Number(rentalData.nonces[1])
    const hasAssetIndexUpdate = Number(indexerIndexesUpdate.asset[0]?.newIndex) > Number(rentalData.nonces[2])
    const hasUpdatedIndex = hasContractIndexUpdate || hasSignerIndexUpdate || hasAssetIndexUpdate

    if (hasUpdatedIndex && rentalData.status === RentalStatus.OPEN) {
      if (
        hasContractIndexUpdate ||
        hasSignerIndexUpdate ||
        (hasAssetIndexUpdate && indexerIndexesUpdate.asset[0].type === IndexUpdateEventType.CANCEL)
      ) {
        logger.info(`[Refresh][Update rental][${rentalId}]`)
        promisesOfUpdate.push(
          database.query(
            SQL`UPDATE rentals SET updated_at = ${startTime}, status = ${RentalStatus.CANCELLED} WHERE id = ${rentalData.id}`
          )
        )
      }
    }

    await Promise.all(promisesOfUpdate)

    // Return the updated rental listing
    const result =
      await database.query<DBGetRentalListing>(SQL`SELECT rentals.*, metadata.category, metadata.search_text, metadata.created_at as metadata_created_at FROM metadata, 
    (SELECT rentals.*, rentals_listings.tenant, rentals_listings.lessor, COUNT(*) OVER() as rentals_listings_count, 
      array_agg(ARRAY[periods.min_days::text, periods.max_days::text, periods.price_per_day::text] ORDER BY periods.min_days) as periods FROM rentals, rentals_listings, periods
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
              SQL`UPDATE metadata SET
                category = ${nft.category},
                search_text = ${nft.searchText},
                distance_to_plaza = ${nft.searchDistanceToPlaza},
                adjacent_to_road = ${nft.searchAdjacentToRoad},
                estate_size = ${nft.searchEstateSize},
                updated_at = ${new Date(fromMillisecondsToSeconds(Number(nft.updatedAt)))}
                WHERE id = ${nft.id}`
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
              WHERE metadata_id = ${nft.id} AND status = ${RentalStatus.OPEN} AND rentals.id = rentals_listings.id`
            )

            logger.debug(`[Metadata update][Single update:${nft.id}][Open rentals:${idsOfOpenRentalsOfNFT.length}]`)

            // If there's no rental listing to update, don't continue with the update
            if (!idsOfOpenRentalsOfNFT[0]) {
              return
            }

            const ownerIsContractAddress = nft.owner.address === idsOfOpenRentalsOfNFT[0].rental_contract_address
            const ownerIsTheSame = nft.owner.address === idsOfOpenRentalsOfNFT[0].lessor
            const isEstateWithSizeZero = nft.category === NFTCategory.ESTATE && nft.searchEstateSize === 0

            if (isEstateWithSizeZero) {
              // Cancel the rental listing that is a dissolved estate
              logger.debug(
                `[Metadata update][Single update:${nft.id}][Cancelling listing due to being a dissolved estate]`
              )
              await client.query(
                SQL`UPDATE rentals SET status = ${RentalStatus.CANCELLED} WHERE id = ${idsOfOpenRentalsOfNFT[0].id}`
              )
              return
            }

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

                // If the owner is not the same one as the listing through the rental contract, cancel it
                if (nft.owner.address === rental?.lessor) {
                  return
                }
              }
              await client.query(
                SQL`UPDATE rentals SET status = ${RentalStatus.CANCELLED} WHERE id = ${idsOfOpenRentalsOfNFT[0].id}`
              )
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
            const { rows: dbRentals } = await client.query<
              Pick<DBRental & DBRentalListing, "id" | "lessor" | "status" | "started_at"> & {
                period_id: number
                max_days: number
                min_days: number
              }
            >(
              SQL`
                SELECT rentals.id, lessor, status, started_at, periods.id period_id, periods.max_days, periods.min_days 
                FROM rentals, rentals_listings, periods
                WHERE rentals.id = rentals_listings.id AND rentals.signature = ${
                  rental.signature
                } OR rentals.signature = ${generateECDSASignatureWithInvalidV(
                rental.signature
              )} AND periods.rental_id = rentals.id
              `
            )
            logger.debug(
              `[Rentals update][Exists:${Boolean(dbRentals[0])}][contractAddress:${rental.contractAddress}][tokenId:${
                rental.tokenId
              }]`
            )
            // Right now, we can only compare with `rentalDays` to `max_days` to find out the period. When adding custom min and max dates for rents
            // we will need to re-evaluate this logic
            const dbRental = dbRentals.find(({ max_days }) => max_days === Number(rental.rentalDays)) || dbRentals[0]
            // If there's a rental in the database updated it, else, create it
            if (dbRental) {
              await Promise.all([
                client.query(
                  SQL`UPDATE rentals SET updated_at = ${new Date(
                    fromSecondsToMilliseconds(Number(rental.updatedAt))
                  )}, rented_days = ${rental.rentalDays}, period_chosen = ${
                    dbRental.period_id
                  }, started_at = ${new Date(fromSecondsToMilliseconds(Number(rental.startedAt)))}, status = ${
                    rental.ownerHasClaimedAsset ? RentalStatus.CLAIMED : RentalStatus.EXECUTED
                  }, signature = ${generateECDSASignatureWithValidV(rental.signature)} WHERE id = ${dbRental.id}`
                ),
                client.query(
                  SQL`UPDATE rentals SET status = ${RentalStatus.CLAIMED} WHERE contract_address = ${rental.contractAddress} AND token_id = ${rental.tokenId} AND status = ${RentalStatus.EXECUTED} AND started_at < ${dbRental.started_at}`
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
              const defaultNonces = ["0", "0", "0"]
              const startedAt = new Date(fromSecondsToMilliseconds(Number(rental.startedAt)))
              const {
                rows: [insertedRental],
              } = await client.query(
                SQL`INSERT INTO rentals (metadata_id, network, chain_id, expiration, signature, nonces, token_id, contract_address, rental_contract_address, status, created_at, updated_at, started_at)
                VALUES (${metadataId}, ${NETWORK}, ${getChainId(CHAIN_NAME)}, ${new Date(0)}, ${
                  rental.signature
                }, ${defaultNonces}, ${rental.tokenId}, ${rental.contractAddress}, ${rental.rentalContractAddress}, ${
                  RentalStatus.EXECUTED
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
        SQL`UPDATE rentals SET status = ${RentalStatus.CANCELLED} WHERE status = ${RentalStatus.OPEN} AND expiration < now()`
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

  async function cancelRentalsListings() {
    // Truncate the start time to seconds so we can interact with the blockchain date
    const startTime = new Date(fromSecondsToMilliseconds(fromMillisecondsToSeconds(new Date().getTime())))
    logger.info(`[Rentals Indexes update][Start updates][startTime:${startTime.getTime()}]`)
    const { rows } = await database.query<{ updated_at: Date }>(
      SQL`SELECT updated_at FROM updates WHERE type = ${UpdateType.INDEXES} ORDER BY updated_at DESC LIMIT 1`
    )
    logger.info(
      `[Rentals Indexes update][Start updates][lastUpdate:${
        rows.length > 0 ? rows[0].updated_at.getTime() : "No last update was found"
      }]`
    )
    const client = await database.getPool().connect()
    let lastId: string | undefined
    try {
      await client.query("BEGIN")
      while (true) {
        const { indexesUpdateHistories } = await getIndexesUpdateHistoriesFromIndexer({
          filterBy: { date_gt: fromMillisecondsToSeconds(rows[0].updated_at.getTime()).toString() },
          first: MAX_GRAPH_FIRST,
        })
        logger.info(`[Rentals Indexes update][Retrieved index updates][size:${indexesUpdateHistories.length}]`)

        // Limit the concurrent updates
        const limit = pLimit(MAX_CONCURRENT_RENTAL_UPDATES)

        const promiseOfUpdates = indexesUpdateHistories.map((indexUpdate) =>
          limit(async () => {
            if (indexUpdate.contractUpdate) {
              const { newIndex, contractAddress } = indexUpdate.contractUpdate
              logger.info(
                `[Rentals Indexes update][Contract index update][contractAddress:${contractAddress}][newIndex:${newIndex}]`
              )
              return await client.query(
                SQL`UPDATE rentals SET status = ${RentalStatus.CANCELLED} WHERE rentals.id = ANY (
                    select id
                      from rentals r
                      cross join unnest(nonces) with ordinality as u(nonce, idx) where idx = 1 AND u.nonce < ${newIndex} AND r.rental_contract_address = "${contractAddress}"
                )`
              )
            } else if (indexUpdate.signerUpdate) {
              const { newIndex, signer } = indexUpdate.signerUpdate
              logger.info(`[Rentals Indexes update][Singer index update][signer:${signer}][newIndex:${newIndex}]`)
              return await client.query(
                SQL`UPDATE rentals SET status = ${RentalStatus.CANCELLED} WHERE rentals.id = ANY (
                  select r.id
                    from rentals r, rentals_listings rl
                    cross join unnest(nonces) with ordinality as u(nonce, idx)
                    where r.id = rl.id AND idx = 2 AND u.nonce < ${newIndex} AND rl.lessor = ${signer}
                )`
              )
            } else if (indexUpdate.assetUpdate && indexUpdate.assetUpdate.type === IndexUpdateEventType.CANCEL) {
              const { newIndex, contractAddress, tokenId } = indexUpdate.assetUpdate
              logger.info(
                `[Rentals Indexes update][Asset index update][contractAddress:${contractAddress}][tokenId:${tokenId}][newIndex:${newIndex}]`
              )
              return await client.query(
                SQL`UPDATE rentals SET status = ${RentalStatus.CANCELLED} WHERE rentals.id = ANY (
                  select r.id
                    from rentals r
                    cross join unnest(nonces) with ordinality as u(nonce, idx)
                    WHERE idx = 3 AND u.nonce < ${newIndex} AND r.contract_address = ${contractAddress} AND r.token_id = ${tokenId}
                )`
              )
            } else {
              return Promise.resolve() // fallback
            }
          })
        )

        const updates = await Promise.allSettled(promiseOfUpdates)
        const rejectedUpdates = updates.filter((result) => result.status === "rejected")
        if (rejectedUpdates.length > 0) {
          logger.debug(
            `[Rentals Indexes update][Rejected updates][reason:${(rejectedUpdates[0] as PromiseRejectedResult).reason}]`
          )
          throw (rejectedUpdates[0] as PromiseRejectedResult).reason
        }

        // Use last id to query the graph to avoid the indexing limit
        if (indexesUpdateHistories.length < MAX_GRAPH_FIRST) {
          break
        }
        lastId = indexesUpdateHistories[indexesUpdateHistories.length - 1].id
      }

      await client.query(SQL`UPDATE updates SET updated_at = ${startTime} WHERE type = ${UpdateType.INDEXES}`)
      await client.query("COMMIT")
      logger.info(`[Rentals Indexes update][Successful]`)
    } catch (error) {
      logger.info(`[Rentals Indexes update][Failed][reason:${(error as Error).message}]`)
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
    cancelRentalsListings,
    updateMetadata,
  }
}
