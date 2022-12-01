/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate"

export const shorthands: ColumnDefinitions | undefined = undefined

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql("INSERT INTO updates (type, updated_at) VALUES ('indexes', to_timestamp(0))")
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql("DELETE from updates WHERE type = 'indexes'")
}
