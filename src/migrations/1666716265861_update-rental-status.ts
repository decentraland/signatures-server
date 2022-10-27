/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate"

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addTypeValue("status", "claimed", { ifNotExists: true })
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Rename current status enum to old_status
  pgm.renameType("status", "old_status")
  // Create new enum with a temporal name
  pgm.addType("status_new", ["open", "executed", "cancelled"])
  // Update DB to remove the value we want to remove
  pgm.sql("UPDATE rentals SET status = 'executed' WHERE status = 'claimed'")
  // Drop the index based on the status column to prevent issues with the migration
  pgm.dropIndex("rentals", ["token_id", "contract_address", "status"], { unique: true })
  // Change the status column to the new type and drop the default to prevent casting issues
  pgm.alterColumn("rentals", "status", {
    type: "status_new",
    using: "status::text::status_new",
    default: null,
  })
  // Re-add the default value
  pgm.alterColumn("rentals", "status", {
    default: "open",
  })
  // Rename the new enum to its corresponding name
  pgm.renameType("status_new", "status")
  // Remove old enum
  pgm.dropType("old_status")
  // Re-create the index
  pgm.createIndex("rentals", ["token_id", "contract_address", "status"], { where: "status = 'open'", unique: true })
}
