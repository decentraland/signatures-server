import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate"

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.renameType("update", "old_update")
  pgm.createType("new_update", ["metadata", "rentals", "indexes"])
  pgm.alterColumn("updates", "type", {
    type: "new_update",
    using: "type::text::new_update",
  })
  pgm.dropType("old_update")
  pgm.renameType("new_update", "update")
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // Rename current status enum to old_status
  pgm.renameType("update", "old_update")
  // Create new enum with a temporal name
  pgm.addType("new_update", ["metadata", "rentals"])
  // Update DB to remove the value we want to remove
  pgm.sql("DELETE FROM updates WHERE type = 'indexes'")
  // Change the status column to the new type and drop the default to prevent casting issues
  pgm.alterColumn("updates", "type", {
    type: "new_update",
    using: "type::text::new_update",
  })
  // Rename the new enum to its corresponding name
  pgm.renameType("new_update", "update")
  // Remove old enum
  pgm.dropType("old_update")
}
