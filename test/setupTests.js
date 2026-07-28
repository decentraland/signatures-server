const path = require("path")
const { existsSync, copyFileSync } = require("fs")
const dotenv = require("dotenv")
const { Pool } = require("pg")
const { runner } = require("node-pg-migrate")

/**
 * Name of the database a given jest worker owns. Each worker gets its own so suites running in
 * parallel can truncate tables without racing each other.
 */
function workerDatabaseName(baseName, workerId) {
  return `${baseName}_worker_${workerId}`
}

/** Creates the worker database if it is missing and brings it up to date with the migrations. */
async function createAndMigrateDatabase(adminPool, connectionUrl, baseName, workerId) {
  const database = workerDatabaseName(baseName, workerId)

  const { rowCount } = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [database])
  if (rowCount === 0) {
    // The identifier is derived from the worker id, it is not user input
    await adminPool.query(`CREATE DATABASE "${database}"`)
  }

  const databaseUrl = new URL(connectionUrl.toString())
  databaseUrl.pathname = `/${database}`

  const pool = new Pool({ connectionString: databaseUrl.toString() })
  try {
    // The rentals migration defaults ids to uuid_generate_v4() but never creates the extension
    // that provides it, so it has to exist before the migrations run.
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    await runner({
      databaseUrl: databaseUrl.toString(),
      dir: path.join(__dirname, "../src/migrations"),
      migrationsTable: "pgmigrations",
      ignorePattern: ".*\\.map",
      direction: "up",
      log: () => undefined,
    })
  } finally {
    await pool.end()
  }
}

/**
 * Prepares the environment the suites run in. Migrations are run from here, outside of the jest
 * environment, because node-pg-migrate imports the migration files dynamically and jest tears its
 * module registry down before those imports resolve.
 */
module.exports = async function (globalConfig) {
  const defaultEnvironmentFilePath = path.join(__dirname, "../.env.default")
  const environmentFilePath = path.join(__dirname, "../.env")

  if (!existsSync(environmentFilePath)) {
    if (!existsSync(defaultEnvironmentFilePath)) {
      throw new Error("An .env file is needed to run the tests")
    }

    copyFileSync(defaultEnvironmentFilePath, environmentFilePath)
  }

  // The environment wins over .env.test, which is how CI points the suites at its own postgres
  const { parsed } = dotenv.config({ path: path.join(__dirname, "../.env.test") })
  const connectionString =
    process.env.PG_COMPONENT_PSQL_CONNECTION_STRING ?? parsed?.PG_COMPONENT_PSQL_CONNECTION_STRING
  if (!connectionString) {
    throw new Error("PG_COMPONENT_PSQL_CONNECTION_STRING is required to run the tests")
  }
  process.env.PG_COMPONENT_PSQL_CONNECTION_STRING = connectionString

  const connectionUrl = new URL(connectionString)
  const baseName = connectionUrl.pathname.replace("/", "") || "db"
  const workers = Math.max(globalConfig?.maxWorkers ?? 1, 1)

  const adminPool = new Pool({ connectionString })
  try {
    for (let workerId = 1; workerId <= workers; workerId++) {
      await createAndMigrateDatabase(adminPool, connectionUrl, baseName, workerId)
    }
  } finally {
    await adminPool.end()
  }
}
