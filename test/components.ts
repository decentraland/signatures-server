// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import {
  createRunner,
  createLocalFetchCompoment as createLocalFetchComponent,
} from "@well-known-components/test-helpers"
import { ILoggerComponent } from "@well-known-components/interfaces"
import { createSubgraphComponent, ISubgraphComponent } from "@well-known-components/thegraph-component"
import { createPgComponent, IPgComponent } from "@well-known-components/pg-component"
import { createDotEnvConfigComponent } from "@well-known-components/env-config-provider"
import { createServerComponent, createStatusCheckComponent, IFetchComponent } from "@well-known-components/http-server"
import { createMetricsComponent } from "@well-known-components/metrics"
import { createSchemaValidatorComponent } from "../src/ports/schema-validator"
import { main } from "../src/service"
import { metricDeclarations } from "../src/metrics"
import { GlobalContext, TestComponents } from "../src/types"
import { createRentalsComponent, IRentalsComponent } from "../src/ports/rentals"

let lastUsedPort = 19000 + parseInt(process.env.JEST_WORKER_ID || "1") * 1000
function getFreePort() {
  return lastUsedPort + 1
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
  const currentPort = getFreePort()
  const defaultConfig = {
    HTTP_SERVER_PORT: (currentPort + 1).toString(),
    HTTP_SERVER_HOST: "localhost",
    MARKETPLACE_SUBGRAPH_URL: "https://some-url.com",
    RENTALS_SUBGRAPH_URL: "https://some-url.com",
  }

  const config = await createDotEnvConfigComponent({}, defaultConfig)
  const cors = {
    origin: await config.getString("CORS_ORIGIN"),
    method: await config.getString("CORS_METHOD"),
  }

  const logs = createTestConsoleLogComponent()
  const server = await createServerComponent<GlobalContext>({ config, logs }, { cors, compression: {} })
  const fetcher = await createTestFetchComponent()
  const metrics = await createMetricsComponent(metricDeclarations, {
    server,
    config,
  })
  const marketplaceSubgraph = await createSubgraphComponent(
    { config, logs, fetch: fetcher, metrics },
    await config.requireString("MARKETPLACE_SUBGRAPH_URL")
  )
  const rentalsSubgraph = await createSubgraphComponent(
    { config, logs, fetch: fetcher, metrics },
    await config.requireString("RENTALS_SUBGRAPH_URL")
  )
  const database = await createPgComponent({ logs, config, metrics })
  const rentals = await createRentalsComponent({
    logs,
    database,
    marketplaceSubgraph,
    rentalsSubgraph,
    config,
  })
  const schemaValidator = await createSchemaValidatorComponent()
  const statusChecks = await createStatusCheckComponent({ server, config })
  // Mock the start function to avoid connecting to a local database
  jest.spyOn(database, "start").mockResolvedValue()

  const updateMetadataJob = createTestJobComponent()
  const updateRentalsListingsJob = createTestJobComponent()

  return {
    config,
    logs,
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
  }
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
  } = {
    createRentalListing: jest.fn(),
    getRentalsListings: jest.fn(),
    refreshRentalListing: jest.fn(),
    updateMetadata: jest.fn(),
    updateRentalsListings: jest.fn(),
  }
): IRentalsComponent {
  return {
    getRentalsListings,
    createRentalListing,
    refreshRentalListing,
    updateMetadata,
    updateRentalsListings,
  }
}

export function createTestJobComponent(
  { start = jest.fn(), stop = jest.fn(), onFinish = jest.fn() } = {
    start: jest.fn(),
    stop: jest.fn(),
    onFinish: jest.fn(),
  }
) {
  return {
    start,
    stop,
    onFinish,
  }
}

export function createTestDbComponent(
  { query = jest.fn(), start = jest.fn(), streamQuery = jest.fn(), getPool = jest.fn(), stop = jest.fn() } = {
    query: jest.fn(),
    start: jest.fn(),
    streamQuery: jest.fn(),
    getPool: jest.fn(),
    stop: jest.fn(),
  }
): IPgComponent {
  return {
    start,
    streamQuery,
    query,
    getPool,
    stop,
  }
}
