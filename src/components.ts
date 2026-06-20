import path from "path"
import { createDotEnvConfigComponent } from "@well-known-components/env-config-provider"
import {
  createServerComponent,
  createStatusCheckComponent,
  instrumentHttpServerWithPromClientRegistry,
} from "@dcl/http-server"
import { createLogComponent } from "@well-known-components/logger"
import { createSubgraphComponent } from "@dcl/thegraph-component"
import { createPgComponent } from "@dcl/pg-component"
import { createTracerComponent } from "@well-known-components/tracer-component"
import { instrumentHttpServerWithRequestLogger } from "@well-known-components/http-requests-logger-component"
import { createHttpTracerComponent } from "@dcl/http-tracer-component"
import { createMetricsComponent } from "@dcl/metrics"
import { createTracedFetcherComponent } from "@dcl/traced-fetch-component"
import { createSchemaValidatorComponent } from "@dcl/schema-validator-component"
import { createJobComponent } from "@dcl/job-component"
import { AppComponents, GlobalContext } from "./types"
import { metricDeclarations } from "./metrics"
import { createRentalsComponent } from "./ports/rentals/component"

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: [".env.default", ".env"] })
  const MARKETPLACE_SUBGRAPH_URL = await config.requireString("MARKETPLACE_SUBGRAPH_URL")
  const RENTALS_SUBGRAPH_URL = await config.requireString("RENTALS_SUBGRAPH_URL")
  const thirtySeconds = 30 * 1000
  const fiveMinutes = 5 * 60 * 1000

  const cors = {
    origin: (await config.requireString("CORS_ORIGIN")).split(";").map((origin) => new RegExp(origin)),
    methods: (await config.requireString("CORS_METHODS")).split(",").map((method) => method.trim()),
  }

  const tracer = createTracerComponent()
  const logs = await createLogComponent({ tracer })
  const server = await createServerComponent<GlobalContext>({ config, logs }, { cors })
  createHttpTracerComponent({ server, tracer })
  // The HTTP requests logger still types its server against the node-fetch-flavoured
  // @well-known-components interfaces. It only reads the request method/url and the response
  // status at runtime, so it is structurally compatible with the native-fetch core http-server;
  // the cast bridges the two type worlds.
  instrumentHttpServerWithRequestLogger({
    server: server as unknown as Parameters<typeof instrumentHttpServerWithRequestLogger>[0]["server"],
    logger: logs,
  })
  const statusChecks = await createStatusCheckComponent({ server, config })

  const fetch = await createTracedFetcherComponent({ tracer })
  const metrics = await createMetricsComponent(metricDeclarations, { config })
  // The metrics component no longer wires the `/metrics` endpoint or the HTTP request
  // instrumentation by itself (that was previously done by passing `server` to
  // `createMetricsComponent`). With the core components split this is wired explicitly here.
  if (!metrics.registry) {
    throw new Error("The metrics component did not expose a prom-client registry")
  }
  await instrumentHttpServerWithPromClientRegistry({ server, config, metrics, registry: metrics.registry })
  const marketplaceSubgraph = await createSubgraphComponent({ logs, config, fetch, metrics }, MARKETPLACE_SUBGRAPH_URL)
  const rentalsSubgraph = await createSubgraphComponent({ logs, config, fetch, metrics }, RENTALS_SUBGRAPH_URL)
  // The pg component resolves its connection from config (PG_COMPONENT_PSQL_CONNECTION_STRING or
  // the individual PG_COMPONENT_PSQL_* variables) and runs migrations against that pool, so the
  // migration options no longer take a `databaseUrl`.
  const database = await createPgComponent(
    { config, logs, metrics },
    {
      migration: {
        dir: path.resolve(__dirname, "migrations"),
        migrationsTable: "pgmigrations",
        ignorePattern: ".*\\.map", // avoid sourcemaps
        direction: "up",
      },
    }
  )

  const schemaValidator = createSchemaValidatorComponent<GlobalContext>()
  const rentals = await createRentalsComponent({ database, logs, marketplaceSubgraph, rentalsSubgraph, config })
  const updateMetadataJob = createJobComponent(
    { logs },
    () => tracer.span("Update metadata job", () => rentals.updateMetadata()),
    fiveMinutes,
    {
      startupDelay: thirtySeconds,
    }
  )
  const updateRentalsListingsJob = createJobComponent(
    { logs },
    () => tracer.span("Update rentals listings job", () => rentals.updateRentalsListings()),
    fiveMinutes,
    {
      startupDelay: thirtySeconds,
    }
  )
  const cancelRentalsListingsJob = createJobComponent(
    { logs },
    () => tracer.span("Update rentals listings job", () => rentals.cancelRentalsListings()),
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
    tracer,
    marketplaceSubgraph,
    rentalsSubgraph,
    schemaValidator,
    rentals,
    updateMetadataJob,
    updateRentalsListingsJob,
    cancelRentalsListingsJob,
  }
}
