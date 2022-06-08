import { NFTCategory } from "@dcl/schemas"
import SQL from "sql-template-strings"
import { AppComponents } from "../../types"
import { NFTNotFound, UnauthorizedToRent } from "./errors"
import { IRentalsComponent, RentalCreation, Status, DBRental, Rental } from "./types"

export function createRentalsComponent(
  components: Pick<AppComponents, "database" | "metrics" | "logs" | "marketplaceSubgraph">
): IRentalsComponent {
  const { database, marketplaceSubgraph, logs } = components
  const logger = logs.getLogger("rentals")

  function fromDBRentalToRental(DBRental: DBRental): Rental {
    return {
      id: DBRental.id,
      network: DBRental.network,
      chainId: DBRental.chain_id,
      expiration: DBRental.expiration,
      signature: DBRental.signature,
      rawData: DBRental.raw_data,
      tokenId: DBRental.token_id,
      contractAddress: DBRental.contract_address,
      rentalContractAddress: DBRental.rental_contract_address,
      lessor: DBRental.lessor,
      tenant: DBRental.tenant,
      status: DBRental.status,
      createdAt: DBRental.created_at,
      updatedAt: DBRental.updated_at,
    }
  }

  async function createRental(rental: RentalCreation, lessorAddress: string): Promise<Rental> {
    console.log(rental.periods)

    logger.info(
      `[Creating rental][Started][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}][lessor:${lessorAddress}]`
    )
    const queryResult = await marketplaceSubgraph.query<{
      nfts: {
        id: string
        category: NFTCategory
        contractAddress: string
        tokenId: string
        owner: { address: string }
        searchText: string
        createdAt: string
        updatedAt: string
      }[]
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
        contractAddress: rental.contractAddress,
        tokenId: rental.tokenId,
      }
    )

    const nft = queryResult.nfts[0]

    if (!nft) {
      throw new NFTNotFound(rental.contractAddress, rental.tokenId)
    }

    logger.info(
      `[Creating rental][Found NFT][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}][lessor:${lessorAddress}]`
    )

    if (nft && nft.owner.address !== lessorAddress) {
      throw new UnauthorizedToRent(nft.owner.address, lessorAddress)
    }

    logger.info(
      `[Creating rental][Authorized][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}][lessor:${lessorAddress}]`
    )

    const insertMetadataQuery = SQL`INSERT INTO metadata (id, category, search_text, created_at) VALUES (${nft.id}, ${nft.category}, ${nft.searchText}, ${nft.createdAt}) ON CONFLICT DO NOTHING;`

    logger.info(
      `[Creating rental][Built-Metadata-Query][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}][lessor:${lessorAddress}]`
    )

    const insertRentalQuery = SQL`WITH inserted_rental AS (
      INSERT INTO rentals (metadata_id, network, chain_id, expiration, signature, raw_data, token_id, contract_address, rental_contract_address, lessor, status) 
      VALUES (${nft.id}, ${rental.network}, ${rental.chainId}, ${rental.expiration}, ${rental.signature}, ${rental.rawData}, ${rental.tokenId}, ${rental.contractAddress}, ${rental.rentalContractAddress}, ${lessorAddress}, ${Status.OPEN})
      RETURNING *
    )`

    logger.info(
      `[Creating rental][Built-Rental-Query][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}][lessor:${lessorAddress}]`
    )

    const insertPeriodsQuery = SQL`INSERT INTO periods (min, max, price, rental_id) VALUES `
    rental.periods.forEach((period, index, periods) => {
      insertPeriodsQuery.append(
        SQL`(${period.min}, ${period.max}, ${period.price}, (SELECT (id) FROM inserted_rental))`.append(
          index !== periods.length - 1 ? "," : ";"
        )
      )
    })

    logger.info(
      `[Creating rental][Built-Periods-Query][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}][lessor:${lessorAddress}]`
    )

    const query = SQL`BEGIN;\n`
      .append(insertMetadataQuery)
      .append("\n")
      .append(insertRentalQuery)
      .append("\n")
      .append(insertPeriodsQuery)
      .append("\n")
      .append(SQL`COMMIT;`)

    console.log(query.sql)
    console.log(query.text)

    logger.info(
      `[Creating rental][Built-Complete-Query][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}][lessor:${lessorAddress}]`
    )

    const dbRental = await database.query<DBRental>(query)

    logger.info(
      `[Creating rental][Inserted][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}][lessor:${lessorAddress}]`
    )
    console.log(dbRental)

    return fromDBRentalToRental(dbRental.rows[0])
  }

  return {
    createRental,
  }
}
