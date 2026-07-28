import SQL from "sql-template-strings"
import { Network, NFTCategory, RentalStatus } from "@dcl/schemas"
import { IPgComponent } from "@dcl/pg-component"

export type SeededListing = {
  id: string
  metadataId: string
  contractAddress: string
  rentalContractAddress: string
  tokenId: string
  lessor: string
  status: RentalStatus
  signature: string
  nonces: string[]
}

export type SeedListingOptions = Partial<
  Omit<SeededListing, "id"> & {
    category: NFTCategory
    searchText: string
    estateSize: number
    distanceToPlaza: number
    adjacentToRoad: boolean
    updatedAt: Date
    metadataUpdatedAt: Date
    expiration: Date
    target: string
    tenant: string
    network: Network
    periods: { minDays: number; maxDays: number; pricePerDay: string }[]
  }
>

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

/**
 * Test helper to seed and inspect the rental listings of the database the suites run against.
 * @param database - The database component of the test program.
 */
export function createDbHelper(database: IPgComponent) {
  return {
    /**
     * Inserts a rental listing with its metadata and periods.
     * @param options - The values to override on the seeded listing.
     * @returns the identifying values of the seeded listing.
     */
    async seedListing(options: SeedListingOptions = {}): Promise<SeededListing> {
      const metadataId = options.metadataId ?? `metadata-${Math.random().toString(36).slice(2)}`
      const contractAddress = options.contractAddress ?? "0x959e104e1a4db6317fa58f8295f586e1a978c297"
      const rentalContractAddress = options.rentalContractAddress ?? "0x92159c78f0f4523b9c60382bb888f30f10a46b3b"
      const tokenId = options.tokenId ?? Math.floor(Math.random() * 1_000_000).toString()
      const lessor = options.lessor ?? "0x705c1a693cb6a63578451d52e182a02bc8cb2deb"
      const status = options.status ?? RentalStatus.OPEN
      const signature = options.signature ?? `0x${Math.random().toString(16).slice(2).padEnd(128, "0")}1b`
      const nonces = options.nonces ?? ["0", "0", "0"]
      const updatedAt = options.updatedAt ?? new Date()
      const metadataUpdatedAt = options.metadataUpdatedAt ?? updatedAt
      const periods = options.periods ?? [{ minDays: 30, maxDays: 30, pricePerDay: "10000" }]

      await database.query(SQL`INSERT INTO metadata (
          id, category, search_text, distance_to_plaza, adjacent_to_road, estate_size, created_at, updated_at
        ) VALUES (
          ${metadataId},
          ${options.category ?? NFTCategory.PARCEL},
          ${options.searchText ?? "0,0"},
          ${options.distanceToPlaza ?? -1},
          ${options.adjacentToRoad ?? false},
          ${options.estateSize ?? 0},
          ${metadataUpdatedAt},
          ${metadataUpdatedAt}
        ) ON CONFLICT (id) DO NOTHING`)

      const { rows } = await database.query<{ id: string }>(SQL`INSERT INTO rentals (
          metadata_id, network, chain_id, expiration, signature, nonces, token_id,
          contract_address, rental_contract_address, status, target, updated_at
        ) VALUES (
          ${metadataId}, ${options.network ?? Network.ETHEREUM}, 5,
          ${options.expiration ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)},
          ${signature}, ${nonces}, ${tokenId}, ${contractAddress}, ${rentalContractAddress},
          ${status}, ${options.target ?? ZERO_ADDRESS}, ${updatedAt}
        ) RETURNING id`)
      const id = rows[0].id

      await database.query(
        SQL`INSERT INTO rentals_listings (id, lessor, tenant) VALUES (${id}, ${lessor}, ${options.tenant ?? null})`
      )

      for (const period of periods) {
        await database.query(SQL`INSERT INTO periods (min_days, max_days, price_per_day, rental_id)
          VALUES (${period.minDays}, ${period.maxDays}, ${period.pricePerDay}, ${id})`)
      }

      return { id, metadataId, contractAddress, rentalContractAddress, tokenId, lessor, status, signature, nonces }
    },

    /** Reads the status a listing currently has in the database. */
    async getListingStatus(id: string): Promise<RentalStatus | undefined> {
      const { rows } = await database.query<{ status: RentalStatus }>(
        SQL`SELECT status FROM rentals WHERE id = ${id}`
      )
      return rows[0]?.status
    },

    /** Reads the moment a listing was last updated. */
    async getListingUpdatedAt(id: string): Promise<Date | undefined> {
      const { rows } = await database.query<{ updated_at: Date }>(
        SQL`SELECT updated_at FROM rentals WHERE id = ${id}`
      )
      return rows[0]?.updated_at
    },

    /** Reads the nonces a listing was stored with. */
    async getListingNonces(id: string): Promise<string[] | undefined> {
      const { rows } = await database.query<{ nonces: string[] }>(SQL`SELECT nonces FROM rentals WHERE id = ${id}`)
      return rows[0]?.nonces
    },

    /** Reads the rental contract address a listing was stored with. */
    async getListingRentalContractAddress(id: string): Promise<string | undefined> {
      const { rows } = await database.query<{ rental_contract_address: string }>(
        SQL`SELECT rental_contract_address FROM rentals WHERE id = ${id}`
      )
      return rows[0]?.rental_contract_address
    },

    /** Reads the stored metadata of an nft. */
    async getMetadata(id: string): Promise<
      | {
          category: string
          search_text: string
          estate_size: number
          distance_to_plaza: number
          adjacent_to_road: boolean
          updated_at: Date
        }
      | undefined
    > {
      const { rows } = await database.query<{
        category: string
        search_text: string
        estate_size: number
        distance_to_plaza: number
        adjacent_to_road: boolean
        updated_at: Date
      }>(
        SQL`SELECT category, search_text, estate_size, distance_to_plaza, adjacent_to_road, updated_at
          FROM metadata WHERE id = ${id}`
      )
      return rows[0]
    },

    /** Reads the timestamp of the last run of one of the periodic updates. */
    async getLastUpdate(type: "metadata" | "rentals" | "indexes"): Promise<Date | undefined> {
      const { rows } = await database.query<{ updated_at: Date }>(
        SQL`SELECT updated_at FROM updates WHERE type = ${type}`
      )
      return rows[0]?.updated_at
    },

    /** Sets the timestamp of the last run of one of the periodic updates. */
    async setLastUpdate(type: "metadata" | "rentals" | "indexes", updatedAt: Date): Promise<void> {
      await database.query(SQL`INSERT INTO updates (type, updated_at) VALUES (${type}, ${updatedAt})
        ON CONFLICT (type) DO UPDATE SET updated_at = ${updatedAt}`)
    },

    /** Empties every table the suites write to, leaving the schema in place. */
    async clear(): Promise<void> {
      await database.query(SQL`TRUNCATE TABLE periods, rentals_listings, rentals_offers, rentals, metadata CASCADE`)
    },
  }
}

export type DbHelper = ReturnType<typeof createDbHelper>
