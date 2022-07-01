import { ChainId, Network, NFTCategory } from "@dcl/schemas"
import {
  fromDBInsertedRentalListingToRental,
  fromMillisecondsToSeconds,
  fromRentalCreationToContractRentalListing,
  fromSecondsToMilliseconds,
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
      category: NFTCategory.PARCEL,
      search_text: "someText",
      metadata_id: "someId",
      network: Network.ETHEREUM,
      chain_id: ChainId.ETHEREUM_GOERLI,
      expiration: new Date(),
      signature: "0x0",
      nonces: ["0x0", "0x1", "0x2"],
      token_id: "1",
      contract_address: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
      rental_contract_address: "0x09305998a531fade369ebe30adf868c96a34e813",
      lessor: "0x9abdcb8825696cc2ef3a0a955f99850418847f5d",
      tenant: null,
      status: Status.OPEN,
      created_at: new Date("2022-06-13T22:56:36.755Z"),
      updated_at: new Date("2022-06-13T22:56:36.755Z"),
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
      category: dbRentalListing.category,
      search_text: dbRentalListing.search_text,
      network: dbRentalListing.network,
      chainId: dbRentalListing.chain_id,
      expiration: dbRentalListing.expiration.getTime(),
      signature: dbRentalListing.signature,
      nonces: dbRentalListing.nonces,
      tokenId: dbRentalListing.token_id,
      contractAddress: dbRentalListing.contract_address,
      rentalContractAddress: dbRentalListing.rental_contract_address,
      lessor: dbRentalListing.lessor,
      tenant: null,
      status: dbRentalListing.status,
      createdAt: dbRentalListing.created_at.getTime(),
      updatedAt: dbRentalListing.updated_at.getTime(),
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
      category: NFTCategory.PARCEL,
      search_text: "someText",
      network: Network.ETHEREUM,
      chainId: ChainId.ETHEREUM_GOERLI,
      expiration: new Date().getTime(),
      signature: "0x0",
      nonces: ["0x0", "0x1", "0x2"],
      tokenId: "1",
      contractAddress: "0x959e104e1a4db6317fa58f8295f586e1a978c297",
      rentalContractAddress: "0x09305998a531fade369ebe30adf868c96a34e813",
      lessor: "0x9abdcb8825696cc2ef3a0a955f99850418847f5d",
      tenant: null,
      status: Status.OPEN,
      createdAt: 1655160996755,
      updatedAt: 1655160996755,
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
      expiration: fromMillisecondsToSeconds(new Date(rentalCreation.expiration).getTime()).toString(),
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

describe("when converting from milliseconds to seconds", () => {
  describe("and the conversion to milliseconds ends up in a splitted second timestamp", () => {
    it("should return the timestamp ", () => {
      const time = 1656105118092
      expect(fromMillisecondsToSeconds(time)).toEqual(1656105118)
    })
  })

  describe("and the conversion to milliseconds ends up in a round second timestamp", () => {
    it("should return the timestamp ", () => {
      const time = 1656105118000
      expect(fromMillisecondsToSeconds(time)).toEqual(1656105118)
    })
  })
})

describe("when converting from seconds to milliseconds", () => {
  it("should return a timestamp in seconds to milliseconds", () => {
    const time = Date.now()
    expect(fromSecondsToMilliseconds(time)).toEqual(time * 1000)
  })
})
