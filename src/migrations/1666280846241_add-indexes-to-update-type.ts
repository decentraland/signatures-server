import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate"

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addTypeValue("update", "indexes")
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Rename current status enum to old_status
  pgm.renameType("update", "old_update")
  // Create new enum with a temporal name
  pgm.addType("update_new", ["metadata", "rentals"])
  // Change the status column to the new type and drop the default to prevent casting issues
  pgm.alterColumn("updates", "type", {
    type: "update_new",
    using: "type::text::update_new",
    default: null,
  })
  // Rename the new enum to its corresponding name
  pgm.renameType("update_new", "update")
  // Remove old enum
  pgm.dropType("old_update")
}
