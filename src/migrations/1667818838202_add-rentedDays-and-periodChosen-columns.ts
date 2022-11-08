/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate"

export const shorthands: ColumnDefinitions | undefined = undefined

const tableName = "rentals"
const rentedDaysColumn = "rented_days"
const periodIndexChosen = "period_chosen"
const columns = {
  [rentedDaysColumn]: {
    type: "integer",
    notNull: false,
  },
  [periodIndexChosen]: {
    type: "uuid",
    references: "periods(id)",
    notNull: false,
  },
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns(tableName, columns)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns(tableName, columns)
}
