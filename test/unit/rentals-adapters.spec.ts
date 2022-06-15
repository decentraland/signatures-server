import { ChainId, Network } from "@dcl/schemas"
import {
  fromDBInsertedRentalListingToRental,
  fromRentalCreationToContractRentalListing,
  RentalListing,
} from "../../src/adapters/rentals"
import { ContractRentalListing } from "../../src/logic/rentals/types"
import { DBInsertedRentalListing, Status } from "../../src/ports/rentals"

describe("when transforming a DB inserted rental listing to a rental listing", () => {
  let dbRentalListing: DBInsertedRentalListing
  let rentalListing: RentalListing

  beforeEach(() => {
    dbRentalListing = {
      id: "5884c820-2612-409c-bb9e-a01e8d3569e9",
      metadata_id: "someId",
      network: Network.ETHEREUM,
      chain_id: ChainId.ETHEREUM_GOERLI,
      expiration: Date.now(),
      signature: "0x0",
      nonces: ["0x0", "0x1", "0x2"],
      token_id: "1",
      contract_address: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
      rental_contract_address: "0x09305998a531fade369ebe30adf868c96a34e813",
      lessor: "0x9abdcb8825696cc2ef3a0a955f99850418847f5d",
      tenant: null,
      status: Status.OPEN,
      created_at: "2022-06-13T22:56:36.755Z",
      updated_at: "2022-06-13T22:56:36.755Z",
      periods: [
        {
          id: "b0c2a829-0abb-4452-89f1-194b2b0c4706",
          min_days: 0,
          max_days: 30,
          price_per_day: "1000000",
          rental_id: "5884c820-2612-409c-bb9e-a01e8d3569e9",
        },
      ],
    }
    rentalListing = {
      id: dbRentalListing.id,
      network: dbRentalListing.network,
      chainId: dbRentalListing.chain_id,
      expiration: dbRentalListing.expiration,
      signature: dbRentalListing.signature,
      nonces: dbRentalListing.nonces,
      tokenId: dbRentalListing.token_id,
      contractAddress: dbRentalListing.contract_address,
      rentalContractAddress: dbRentalListing.rental_contract_address,
      lessor: dbRentalListing.lessor,
      tenant: null,
      status: dbRentalListing.status,
      createdAt: dbRentalListing.created_at,
      updatedAt: dbRentalListing.updated_at,
      periods: [
        {
          id: dbRentalListing.periods[0].id,
          minDays: dbRentalListing.periods[0].min_days,
          maxDays: dbRentalListing.periods[0].max_days,
          pricePerDay: dbRentalListing.periods[0].price_per_day,
        },
      ],
    }
  })

  it("should return the transformed rental listing", () => {
    expect(fromDBInsertedRentalListingToRental(dbRentalListing)).toEqual(rentalListing)
  })
})

describe("when transforming a rental creation to a contract rental listing", () => {
  let rentalCreation: RentalListing
  let contractRentalListing: ContractRentalListing
  let lessor: string

  beforeEach(() => {
    rentalCreation = {
      id: "5884c820-2612-409c-bb9e-a01e8d3569e9",
      network: Network.ETHEREUM,
      chainId: ChainId.ETHEREUM_GOERLI,
      expiration: Date.now(),
      signature: "0x0",
      nonces: ["0x0", "0x1", "0x2"],
      tokenId: "1",
      contractAddress: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
      rentalContractAddress: "0x09305998a531fade369ebe30adf868c96a34e813",
      lessor: "0x9abdcb8825696cc2ef3a0a955f99850418847f5d",
      tenant: null,
      status: Status.OPEN,
      createdAt: "2022-06-13T22:56:36.755Z",
      updatedAt: "2022-06-13T22:56:36.755Z",
      periods: [
        {
          id: "b0c2a829-0abb-4452-89f1-194b2b0c4706",
          minDays: 0,
          maxDays: 30,
          pricePerDay: "1000000",
        },
      ],
    }
    lessor = "lessor-address"
    contractRentalListing = {
      signer: lessor!,
      contractAddress: rentalCreation.contractAddress,
      tokenId: rentalCreation.tokenId,
      expiration: rentalCreation.expiration.toString(),
      nonces: rentalCreation.nonces,
      pricePerDay: [rentalCreation.periods[0].pricePerDay],
      maxDays: [rentalCreation.periods[0].maxDays.toString()],
      minDays: [rentalCreation.periods[0].minDays.toString()],
      signature: rentalCreation.signature,
    }
  })

  it("should return the transformed contract rental listing", () => {
    expect(fromRentalCreationToContractRentalListing(lessor, rentalCreation)).toEqual(contractRentalListing)
  })
})
