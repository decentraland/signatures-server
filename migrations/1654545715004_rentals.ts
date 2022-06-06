/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate"

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("rentals", {
    id: { type: "uuid", notNull: true, primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    metadataId: { type: "uuid", notNull: true, unique: false, references: "metadata(id)", onDelete: "CASCADE" },
    network: { type: "text", notNull: true },
    chainId: { type: "string", notNull: true },
    expiration: { type: "timestamp", notNull: true },
    signature: { type: "text", notNull: true },
    rawData: { type: "text", notNull: true },
    tokenId: { type: "text", notNull: true },
    contractAddress: { type: "text", notNull: true },
    rentalContractAddress: { type: "text", notNull: true },
    lessor: { type: "text", notNull: true },
    tenant: { type: "text", notNull: true },
    status: { type: "text", notNull: true },
    createdAt: { type: "timestamp", notNull: true, default: pgm.func("now()") },
    updatedAt: { type: "timestamp", notNull: true, default: pgm.func("now()") },
  })

  pgm.createTable("metadata", {
    id: { type: "uuid", notNull: true, primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    category: { type: "text", notNull: true },
    searchText: { type: "text", notNull: true },
    createdAt: { type: "timestamp", notNull: true },
  })

  pgm.createTable("periods", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("uuid_generate_v4()") },
    min: { type: "integer", notNull: true },
    max: { type: "integer", notNull: true },
    price: { type: "string", notNull: true },
    rentalId: { type: "uuid", notNull: true, unique: false, references: "rentals(id)", onDelete: "CASCADE" },
  })

  pgm.createIndex("periods", "rentalId")
  pgm.createIndex("rentals", "metadataId")
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("rentals")
  pgm.dropTable("metadata")
  pgm.dropTable("periods")
}
