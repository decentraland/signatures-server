import { ChainId, Network, NFTCategory, RentalListing, RentalStatus } from "@dcl/schemas"
import {
  fromDBGetRentalsListingsToRentalListings,
  fromDBInsertedRentalListingToRental,
  fromDBPeriodToPeriod,
  fromMillisecondsToSeconds,
  fromRentalCreationToContractRentalListing,
  fromSecondsToMilliseconds,
} from "../../src/adapters/rentals"
import { ContractRentalListing } from "../../src/logic/rentals/types"
import { DBGetRentalListing, DBInsertedRentalListing } from "../../src/ports/rentals"

describe("when transforming a DB inserted rental listing to a rental listing", () => {
  let dbInsertedRentalListing: DBInsertedRentalListing
  let rentalListing: RentalListing

  beforeEach(() => {
    dbInsertedRentalListing = {
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
      status: RentalStatus.OPEN,
      created_at: new Date("2022-06-13T22:56:36.755Z"),
      updated_at: new Date("2022-06-13T22:56:36.755Z"),
      started_at: null,
      periods: [
        {
          row: "(0, 30, 1000000, 5884c820-2612-409c-bb9e-a01e8d3569e9)",
        },
      ],
    }
    rentalListing = {
      id: dbInsertedRentalListing.id,
      nftId: dbInsertedRentalListing.metadata_id,
      category: dbInsertedRentalListing.category,
      searchText: dbInsertedRentalListing.search_text,
      network: dbInsertedRentalListing.network,
      chainId: dbInsertedRentalListing.chain_id,
      expiration: dbInsertedRentalListing.expiration.getTime(),
      signature: dbInsertedRentalListing.signature,
      nonces: dbInsertedRentalListing.nonces,
      tokenId: dbInsertedRentalListing.token_id,
      contractAddress: dbInsertedRentalListing.contract_address,
      rentalContractAddress: dbInsertedRentalListing.rental_contract_address,
      lessor: dbInsertedRentalListing.lessor,
      tenant: null,
      status: dbInsertedRentalListing.status,
      createdAt: dbInsertedRentalListing.created_at.getTime(),
      updatedAt: dbInsertedRentalListing.updated_at.getTime(),
      startedAt: null,
      periods: [
        {
          minDays: fromDBPeriodToPeriod(dbInsertedRentalListing.periods[0]).minDays,
          maxDays: fromDBPeriodToPeriod(dbInsertedRentalListing.periods[0]).maxDays,
          pricePerDay: fromDBPeriodToPeriod(dbInsertedRentalListing.periods[0]).pricePerDay,
        },
      ],
    }
  })

  it("should return the transformed rental listing", () => {
    expect(fromDBInsertedRentalListingToRental(dbInsertedRentalListing)).toEqual(rentalListing)
  })
})

describe("when transforming DB retrieved rental listings to rental listings", () => {
  let dbGetRentalListings: DBGetRentalListing[]
  let rentalListings: RentalListing[]

  beforeEach(() => {
    dbGetRentalListings = [
      {
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
        status: RentalStatus.OPEN,
        created_at: new Date("2022-06-13T22:56:36.755Z"),
        updated_at: new Date("2022-06-13T22:56:36.755Z"),
        started_at: new Date("2022-06-14T22:56:36.755Z"),
        periods: [["30", "50", "1000000000"]],
        metadata_created_at: new Date(),
        rentals_listings_count: "1",
      },
    ]
    rentalListings = [
      {
        id: dbGetRentalListings[0].id,
        nftId: dbGetRentalListings[0].metadata_id,
        category: dbGetRentalListings[0].category,
        searchText: dbGetRentalListings[0].search_text,
        network: dbGetRentalListings[0].network,
        chainId: dbGetRentalListings[0].chain_id,
        expiration: dbGetRentalListings[0].expiration.getTime(),
        signature: dbGetRentalListings[0].signature,
        nonces: dbGetRentalListings[0].nonces,
        tokenId: dbGetRentalListings[0].token_id,
        contractAddress: dbGetRentalListings[0].contract_address,
        rentalContractAddress: dbGetRentalListings[0].rental_contract_address,
        lessor: dbGetRentalListings[0].lessor,
        tenant: dbGetRentalListings[0].tenant,
        status: dbGetRentalListings[0].status,
        createdAt: dbGetRentalListings[0].created_at.getTime(),
        updatedAt: dbGetRentalListings[0].updated_at.getTime(),
        startedAt: dbGetRentalListings[0].started_at!.getTime(),
        periods: [
          {
            minDays: Number(dbGetRentalListings[0].periods[0][0]),
            maxDays: Number(dbGetRentalListings[0].periods[0][1]),
            pricePerDay: dbGetRentalListings[0].periods[0][2],
          },
        ],
      },
    ]
  })

  it("should return the transformed rental listing", () => {
    expect(fromDBGetRentalsListingsToRentalListings(dbGetRentalListings)).toEqual(rentalListings)
  })
})

describe("when transforming a rental creation to a contract rental listing", () => {
  let rentalCreation: RentalListing
  let contractRentalListing: ContractRentalListing
  let lessor: string

  beforeEach(() => {
    rentalCreation = {
      id: "5884c820-2612-409c-bb9e-a01e8d3569e9",
      nftId: "aNftId",
      category: NFTCategory.PARCEL,
      searchText: "someText",
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
      status: RentalStatus.OPEN,
      createdAt: 1655160996755,
      updatedAt: 1655160996755,
      startedAt: null,
      periods: [
        {
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
