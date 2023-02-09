import path from "path"
import * as nodeFetch from "node-fetch"
import { createDotEnvConfigComponent } from "@well-known-components/env-config-provider"
import { createServerComponent, createStatusCheckComponent } from "@well-known-components/http-server"
import { createLogComponent } from "@well-known-components/logger"
import { createSubgraphComponent } from "@well-known-components/thegraph-component"
import { createPgComponent } from "@well-known-components/pg-component"
import { createMetricsComponent } from "@well-known-components/metrics"
import { AppComponents, GlobalContext } from "./types"
import { createFetchComponent } from "./ports/fetch/fetch"
import { metricDeclarations } from "./metrics"
import { createSchemaValidatorComponent } from "./ports/schema-validator"
import { createRentalsComponent } from "./ports/rentals/component"
import { createJobComponent } from "./ports/job/component"
import { createTraceComponent } from "./ports/tracing"
import { RequestInterceptor } from "./ports/fetch"

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: [".env.default", ".env"] })
  const MARKETPLACE_SUBGRAPH_URL = await config.requireString("MARKETPLACE_SUBGRAPH_URL")
  const RENTALS_SUBGRAPH_URL = await config.requireString("RENTALS_SUBGRAPH_URL")
  const LOG_LEVEL = await config.requireString("LOG_LEVEL")
  const thirtySeconds = 30 * 1000
  const fiveMinutes = 5 * 60 * 1000

  const cors = {
    origin: await config.requireString("CORS_ORIGIN"),
    methods: await config.requireString("CORS_METHODS"),
  }

  const logs = createLogComponent({ config: { logLevel: LOG_LEVEL } })
  const server = await createServerComponent<GlobalContext>({ config, logs }, { cors })
  const trace = createTraceComponent({ server })
  const statusChecks = await createStatusCheckComponent({ server, config })
  const traceRequestInterceptor: RequestInterceptor = (url, init) => {
    const headers: nodeFetch.HeadersInit = { ...init?.headers }
    const traceParent = trace.getChildTraceParent()
    if (traceParent) {
      ;(headers as { [key: string]: string }).traceparent = traceParent
      const traceState = trace.getTraceState()
      if (traceState) {
        ;(headers as { [key: string]: string }).tracestate = traceState
      }
    }

    return [url, { ...init, headers }]
  }

  const fetch = createFetchComponent(nodeFetch.default, { requestInterceptors: [traceRequestInterceptor] })
  const metrics = await createMetricsComponent(metricDeclarations, { server, config })
  const marketplaceSubgraph = await createSubgraphComponent({ logs, config, fetch, metrics }, MARKETPLACE_SUBGRAPH_URL)
  const rentalsSubgraph = await createSubgraphComponent({ logs, config, fetch, metrics }, RENTALS_SUBGRAPH_URL)
  const database = await createPgComponent(
    { config, logs, metrics },
    {
      migration: {
        databaseUrl: await config.requireString("PG_COMPONENT_PSQL_CONNECTION_STRING"),
        dir: path.resolve(__dirname, "migrations"),
        migrationsTable: "pgmigrations",
        ignorePattern: ".*\\.map", // avoid sourcemaps
        direction: "up",
      },
    }
  )

  const schemaValidator = await createSchemaValidatorComponent()
  const rentals = await createRentalsComponent({ database, logs, marketplaceSubgraph, trace, rentalsSubgraph, config })
  const updateMetadataJob = await createJobComponent({ logs }, () => rentals.updateMetadata(), fiveMinutes, {
    startupDelay: thirtySeconds,
  })
  const updateRentalsListingsJob = await createJobComponent(
    { logs },
    () => rentals.updateRentalsListings(),
    fiveMinutes,
    {
      startupDelay: thirtySeconds,
    }
  )
  const cancelRentalsListingsJob = await createJobComponent(
    { logs },
    () => rentals.cancelRentalsListings(),
    fiveMinutes,
    {
      startupDelay: thirtySeconds,
    }
  )

  return {
    config,
    logs,
    server,
    statusChecks,
    fetch,
    metrics,
    database,
    trace,
    marketplaceSubgraph,
    rentalsSubgraph,
    schemaValidator,
    rentals,
    updateMetadataJob,
    updateRentalsListingsJob,
    cancelRentalsListingsJob,
  }
}
