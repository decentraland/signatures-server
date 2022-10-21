import { ethers } from "ethers"
import { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate"

export const shorthands: ColumnDefinitions | undefined = undefined

const tableName = "rentals"
const columnName = "target"
const columns = {
  [columnName]: {
    type: "text",
    default: ethers.constants.AddressZero,
    notNull: false,
  },
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn(tableName, columns)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn(tableName, columnName)
}
