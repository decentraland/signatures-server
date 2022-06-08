import SQL from "sql-template-strings"
import { AppComponents } from "../../types"
import { NFTNotFound, UnauthorizedToRent } from "./errors"
import { IRentalsComponent, RentalCreation, Status, DBRental, Rental } from "./types"

export function createRentalsComponent(
  components: Pick<AppComponents, "database" | "metrics" | "logs" | "graph">
): IRentalsComponent {
  const { database, graph, logs } = components
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
    logger.info(
      `[Creating rental][Started][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}][lessor:${lessorAddress}]`
    )
    const queryResult = await graph.query<{
      nfts: {
        id: string
        contractAddress: string
        tokenId: string
        owner: { address: string }
        searchText: string
        createdAt: string
      }[]
    }>(
      `query NFTByTokenId($contractAddress: String, $tokenId: String) {
        nfts(first: 1 where: { tokenId: $tokenId, contractAddress: $contractAddress }) {
          id,
          itemType,
          contractAddress,
          tokenId,
          owner {
            address
          },
          searchText,
          createdAt
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

    const dbRental = await database.query<DBRental>(
      SQL`INSERT INTO rentals (network, chain_id, expiration, signature, raw_data, token_id, contract_address, rental_contract_address, lessor, status) 
      VALUES (${rental.network}, ${rental.chainId}, ${rental.expiration}, ${rental.signature}, ${rental.rawData}, ${rental.tokenId}, 
        ${rental.contractAddress}, ${rental.rentalContractAddress}, ${lessorAddress}, ${Status.OPEN}) 
      RETURNING *`
    )

    logger.info(
      `[Creating rental][Inserted][contractAddress:${rental.contractAddress}][tokenId:${rental.tokenId}][lessor:${lessorAddress}]`
    )

    return fromDBRentalToRental(dbRental.rows[0])
  }

  return {
    createRental,
  }
}
