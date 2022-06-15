import SQL from "sql-template-strings"
// import { fromRentalCreationToContractRentalListing } from "../../adapters/rentals"
// import { verifyRentalsListingSignature } from "../../logic/rentals"
import { AppComponents } from "../../types"
// import { InvalidSignature, NFTNotFound, RentalAlreadyExists, UnauthorizedToRent } from "./errors"
import { NFTNotFound, RentalAlreadyExists, UnauthorizedToRent } from "./errors"
import {
  IRentalsComponent,
  RentalListingCreation,
  Status,
  DBRentalListing,
  NFT,
  DBRental,
  DBPeriods,
  DBInsertedRentalListing,
} from "./types"

export function createRentalsComponent(
  components: Pick<AppComponents, "database" | "logs" | "marketplaceSubgraph">
): IRentalsComponent {
  const { database, marketplaceSubgraph, logs } = components
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

  async function createRentalListing(
    rental: RentalListingCreation,
    lessorAddress: string
  ): Promise<DBInsertedRentalListing> {
    const buildLogMessageForRental = (event: string) =>
      buildLogMessage("Creating", event, rental.contractAddress, rental.tokenId, lessorAddress)

    logger.info(buildLogMessageForRental("Started"))

    // Verifying the signature
    // const isSignatureValid = await verifyRentalsListingSignature(
    //   fromRentalCreationToContractRentalListing(lessorAddress, rental),
    //   rental.chainId,
    //   rental.signature
    // )
    // if (!isSignatureValid) {
    //   throw new InvalidSignature()
    // }

    // Verify that there's no open rental in the contract
    // TODO: Query the graph for this

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
      await database.query(SQL`BEGIN\n`)
      await database.query(
        SQL`INSERT INTO metadata (id, category, search_text, created_at) VALUES (${nft.id}, ${nft.category}, ${
          nft.searchText
        }, ${new Date(Number(nft.createdAt))}) ON CONFLICT DO NOTHING\n`
      )
      logger.debug(buildLogMessageForRental("Inserted metadata"))

      const createdRental = await database.query<DBRental>(
        SQL`INSERT INTO rentals (metadata_id, network, chain_id, expiration, signature, nonces, token_id, contract_address, rental_contract_address, status) VALUES (${
          nft.id
        }, ${rental.network}, ${rental.chainId}, ${new Date(rental.expiration)}, ${rental.signature}, ${
          rental.nonces
        }, ${rental.tokenId}, ${rental.contractAddress}, ${rental.rentalContractAddress}, ${Status.OPEN}) RETURNING *\n`
      )
      logger.debug(buildLogMessageForRental("Inserted rental"))

      const createdRentalListing = await database.query<DBRentalListing>(
        SQL`INSERT INTO rentals_listings (id, lessor) VALUES (${createdRental.rows[0].id}, ${lessorAddress}) RETURNING *\n`
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
      insertPeriodsQuery.append(SQL` RETURNING *\n`)

      const createdPeriods = await database.query<DBPeriods>(insertPeriodsQuery)
      logger.debug(buildLogMessageForRental("Inserted periods"))

      await database.query(SQL`COMMIT`)

      return { ...createdRental.rows[0], ...createdRentalListing.rows[0], periods: createdPeriods.rows }
    } catch (error) {
      logger.info(buildLogMessageForRental("Rolled-back query"))
      await database.query(SQL`ROLLBACK`)

      if ((error as any).constraint === "rentals_token_id_contract_address_status_unique_index") {
        throw new RentalAlreadyExists(nft.contractAddress, nft.tokenId)
      }

      throw new Error("Error creating rental")
    }
  }

  return {
    createRentalListing,
  }
}
