/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

const NFT_FILTER_COLUMNS = {
  distance_to_plaza: {
    type: "integer",
    notNull: false,
  },
  adjacent_to_road: {
    type: "boolean",
    default: false,
    notNull: true
  },
  estate_size: {
    type: "integer",
    default: 0,
    notNull: true
  }
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("metadata", NFT_FILTER_COLUMNS)
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("metadata", NFT_FILTER_COLUMNS)
}
