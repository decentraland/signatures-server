/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate"

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Add the UUID generation extension if it doesn't exist
  pgm.createExtension("uuid-ossp", { ifNotExists: true })

  pgm.createType("status", ["open", "executed", "cancelled"])

  pgm.createTable("metadata", {
    id: { type: "string", notNull: true, primaryKey: true },
    category: { type: "text", notNull: true },
    search_text: { type: "text", notNull: true },
    created_at: { type: "timestamp", notNull: true },
  })

  pgm.createTable("rentals", {
    id: { type: "uuid", notNull: true, primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    metadata_id: { type: "text", notNull: true, unique: false, references: "metadata(id)", onDelete: "CASCADE" },
    network: { type: "text", notNull: true },
    chain_id: { type: "integer", notNull: true },
    contract_address: { type: "text", notNull: true },
    token_id: { type: "text", notNull: true },
    expiration: { type: "timestamp", notNull: true },
    nonces: { type: "text[3]", notNull: true },
    signature: { type: "text", notNull: true },
    rental_contract_address: { type: "text", notNull: true },
    status: { type: "status", notNull: true, default: "open" },
    created_at: { type: "timestamp", notNull: true, default: pgm.func("now()") },
    updated_at: { type: "timestamp", notNull: true, default: pgm.func("now()") },
  })

  pgm.createTable("rentals_offers", {
    id: { type: "uuid", notNull: true, primaryKey: true, references: "rentals(id)", onDelete: "CASCADE" },
    fingerprint: { type: "string", notNull: true },
    tenant: { type: "text", notNull: true },
    price_per_day: { type: "numeric(78)", notNull: true },
    rental_days: { type: "integer", notNull: true },
    operator: { type: "string", notNull: true },
  })

  pgm.createTable("rentals_listings", {
    id: { type: "uuid", notNull: true, primaryKey: true, references: "rentals(id)", onDelete: "CASCADE" },
    lessor: { type: "text", notNull: true },
    tenant: { type: "text", notNull: false },
  })

  pgm.createTable("periods", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    min_days: { type: "integer", notNull: true },
    max_days: { type: "integer", notNull: true },
    price_per_day: { type: "numeric(78)", notNull: true },
    rental_id: { type: "uuid", notNull: true, unique: false, references: "rentals_listings(id)", onDelete: "CASCADE" },
  })

  pgm.createIndex("periods", "rental_id")
  pgm.createIndex("periods", "min_days")
  pgm.createIndex("periods", "max_days")
  pgm.createIndex("periods", "price_per_day")
  pgm.createIndex("rentals", "metadata_id")
  // Ensure that there won't be more than one open rental per token
  pgm.createIndex("rentals", ["token_id", "contract_address", "status"], { where: "status = 'open'", unique: true })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("periods")
  pgm.dropTable("rentals")
  pgm.dropTable("rentals_offers")
  pgm.dropTable("rentals_listing")
  pgm.dropTable("metadata")
}
