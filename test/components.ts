// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import { createServer } from "net"
import { createRunner, createLocalFetchComponent } from "@dcl/test-helpers"
import { ILoggerComponent } from "@well-known-components/interfaces"
import { IFetchComponent } from "@dcl/core-commons"
import { createSubgraphComponent, ISubgraphComponent } from "@dcl/thegraph-component"
import { createPgComponent, IPgComponent } from "@dcl/pg-component"
import { createConfigComponent, createDotEnvConfigComponent } from "@well-known-components/env-config-provider"
import { createServerComponent, createStatusCheckComponent } from "@dcl/http-server"
import { createTracerComponent } from "@dcl/tracer-component"
import { createMetricsComponent } from "@dcl/metrics"
import { createSchemaValidatorComponent } from "@dcl/schema-validator-component"
import { main } from "../src/service"
import { metricDeclarations } from "../src/metrics"
import { GlobalContext, TestComponents } from "../src/types"
import { createRentalsComponent, IRentalsComponent } from "../src/ports/rentals"

/** The chain the test components are configured for. Goerli has a deployed Rentals contract. */
export const TEST_CHAIN_NAME = "Goerli"

/**
 * Asks the OS for a free TCP port. A counter seeded from the jest worker id is not enough: jest
 * gives every spec file its own module registry, so all the files running in a worker would reset
 * the counter, pick the same port and race the shutdown of the previous suite's server.
 * @returns a port that was free at the time of the call.
 */
async function getFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.once("error", reject)
    server.listen(0, () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        server.close(() => reject(new Error("Could not resolve a free port for the test server")))
        return
      }
      const { port } = address
      server.close(() => resolve(port))
    })
  })
}

/**
 * Resolves the connection string of the database this jest worker owns. The databases are created
 * and migrated by the global setup, one per worker, so suites running in parallel can truncate
 * tables without racing each other.
 * @param baseConnectionString - The connection string of the configured postgres.
 * @returns the connection string of the database owned by the current jest worker.
 */
function getWorkerConnectionString(baseConnectionString: string): string {
  const url = new URL(baseConnectionString)
  const baseName = url.pathname.replace("/", "") || "db"
  url.pathname = `/${baseName}_worker_${process.env.JEST_WORKER_ID ?? "1"}`
  return url.toString()
}

/**
 * Behaves like Jest "describe" function, used to describe a test for a
 * use case, it creates a whole new program and components to run an
 * isolated test.
 *
 * State is persistent within the steps of the test.
 */
export const test = createRunner<TestComponents>({
  main,
  initComponents,
})

export async function initComponents(): Promise<TestComponents> {
  // Reads .env.test, letting the environment win, which is how CI points the suite at its own
  // postgres service. The repo's .env is deliberately not read: it holds a fixed HTTP_SERVER_PORT
  // that every suite would try to bind, and it would take precedence over the defaults below.
  const fileConfig = await createDotEnvConfigComponent({ path: [".env.test"] })
  const databaseConnectionString = getWorkerConnectionString(
    await fileConfig.requireString("PG_COMPONENT_PSQL_CONNECTION_STRING")
  )

  const config = createConfigComponent({
    HTTP_SERVER_HOST: "0.0.0.0",
    HTTP_SERVER_PORT: (await getFreePort()).toString(),
    PG_COMPONENT_PSQL_CONNECTION_STRING: databaseConnectionString,
    MARKETPLACE_SUBGRAPH_URL: await fileConfig.requireString("MARKETPLACE_SUBGRAPH_URL"),
    RENTALS_SUBGRAPH_URL: await fileConfig.requireString("RENTALS_SUBGRAPH_URL"),
    CHAIN_NAME: await fileConfig.requireString("CHAIN_NAME"),
    MAX_CONCURRENT_RENTAL_UPDATES: await fileConfig.requireString("MAX_CONCURRENT_RENTAL_UPDATES"),
    CORS_ORIGIN: await fileConfig.requireString("CORS_ORIGIN"),
    CORS_METHODS: await fileConfig.requireString("CORS_METHODS"),
  })
  const cors = {
    origin: await config.getString("CORS_ORIGIN"),
    methods: (await config.getString("CORS_METHODS"))?.split(",").map((method) => method.trim()),
  }

  const logs = createTestConsoleLogComponent()
  const server = await createServerComponent<GlobalContext>({ config, logs }, { cors })
  const fetcher = await createTestFetchComponent()
  const metrics = await createMetricsComponent(metricDeclarations, {
    config,
  })
  const marketplaceSubgraph = await createSubgraphComponent(
    { config, logs, fetch: fetcher, metrics },
    await config.requireString("MARKETPLACE_SUBGRAPH_URL"),
  )
  const rentalsSubgraph = await createSubgraphComponent(
    { config, logs, fetch: fetcher, metrics },
    await config.requireString("RENTALS_SUBGRAPH_URL"),
  )
  // The suites run against the real database of the worker, already migrated by the global setup
  const database = await createPgComponent({ logs, config, metrics })
  const rentals = await createRentalsComponent({
    logs,
    database,
    marketplaceSubgraph,
    rentalsSubgraph,
    config,
  })
  const schemaValidator = createSchemaValidatorComponent<GlobalContext>()
  const statusChecks = await createStatusCheckComponent({ server, config })

  const updateMetadataJob = createTestJobComponent()
  const updateRentalsListingsJob = createTestJobComponent()
  const cancelRentalsListingsJob = createTestJobComponent()
  const tracer = createTracerComponent()

  return {
    config,
    logs,
    tracer,
    server,
    statusChecks,
    fetch: fetcher,
    metrics,
    database,
    marketplaceSubgraph,
    rentalsSubgraph,
    schemaValidator,
    rentals,
    localFetch: await createLocalFetchComponent(config),
    updateMetadataJob,
    updateRentalsListingsJob,
    cancelRentalsListingsJob,
  }
}

export function createTestFetchComponent({ fetch = jest.fn() } = { fetch: jest.fn() }): IFetchComponent {
  return {
    fetch,
  }
}

export function createTestConsoleLogComponent(
  { log = jest.fn(), debug = jest.fn(), error = jest.fn(), warn = jest.fn(), info = jest.fn() } = {
    log: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
): ILoggerComponent {
  return {
    getLogger: () => ({
      log,
      debug,
      error,
      warn,
      info,
    }),
  }
}

export function createTestSubgraphComponent({ query = jest.fn() } = { query: jest.fn() }): ISubgraphComponent {
  return {
    query,
  }
}

export function createTestRentalsComponent(
  {
    createRentalListing = jest.fn(),
    getRentalsListings = jest.fn(),
    refreshRentalListing = jest.fn(),
    updateMetadata = jest.fn(),
    updateRentalsListings = jest.fn(),
    cancelRentalsListings = jest.fn(),
    getRentalListingsPrices = jest.fn(),
  } = {
    createRentalListing: jest.fn(),
    getRentalsListings: jest.fn(),
    refreshRentalListing: jest.fn(),
    updateMetadata: jest.fn(),
    cancelRentalsListings: jest.fn(),
    getRentalListingsPrices: jest.fn(),
  },
): IRentalsComponent {
  return {
    getRentalsListings,
    createRentalListing,
    refreshRentalListing,
    updateMetadata,
    updateRentalsListings,
    cancelRentalsListings,
    getRentalListingsPrices,
  }
}

export function createTestJobComponent(
  { start = jest.fn(), stop = jest.fn(), onFinish = jest.fn() } = {
    start: jest.fn(),
    stop: jest.fn(),
    onFinish: jest.fn(),
  },
) {
  return {
    start,
    stop,
    onFinish,
  }
}

export function createTestDbComponent(
  {
    query = jest.fn(),
    start = jest.fn(),
    streamQuery = jest.fn(),
    getPool = jest.fn(),
    stop = jest.fn(),
    withTransaction = jest.fn(),
    withAsyncContextTransaction = jest.fn(),
  } = {
    query: jest.fn(),
    start: jest.fn(),
    streamQuery: jest.fn(),
    getPool: jest.fn(),
    stop: jest.fn(),
    withTransaction: jest.fn(),
    withAsyncContextTransaction: jest.fn(),
  },
): IPgComponent {
  return {
    start,
    streamQuery,
    query,
    getPool,
    stop,
    withTransaction,
    withAsyncContextTransaction,
  }
}
