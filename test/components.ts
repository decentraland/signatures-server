// This file is the "test-environment" analogous for src/components.ts
// Here we define the test components to be used in the testing environment

import {
  createRunner,
  createLocalFetchCompoment as createLocalFetchComponent,
} from "@well-known-components/test-helpers"
import { ILoggerComponent } from "@well-known-components/interfaces"
import { ISubgraphComponent } from "@well-known-components/thegraph-component"
import { IPgComponent } from "@well-known-components/pg-component"
import { initComponents as originalInitComponents } from "../src/components"
import { main } from "../src/service"
import { TestComponents } from "../src/types"
import { IRentalsComponent } from "../src/ports/rentals"

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
  const components = await originalInitComponents()

  const { config, database } = components

  jest.spyOn(database, "start").mockResolvedValue()

  return {
    ...components,
    localFetch: await createLocalFetchComponent(config),
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
