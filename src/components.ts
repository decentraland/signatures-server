import { createDotEnvConfigComponent } from "@well-known-components/env-config-provider"
import { createServerComponent, createStatusCheckComponent } from "@well-known-components/http-server"
import { createLogComponent } from "@well-known-components/logger"
import { createSubgraphComponent } from "@well-known-components/thegraph-component"
import { createPgComponent } from "@well-known-components/pg-component"
import { createMetricsComponent } from "@well-known-components/metrics"
import { AppComponents, GlobalContext } from "./types"
import { createFetchComponent } from "./ports/fetch"
import { metricDeclarations } from "./metrics"
import { createSchemaValidatorComponent } from "./ports/schema-validator"
import { createRentalsComponent } from "./ports/rentals/component"

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: [".env.default", ".env"] })
  const SUBGRAPH_URL = await config.getString("SUBGRAPH_URL")
  if (!SUBGRAPH_URL) {
    throw new Error("Subgraph URL not set")
  }

  const logs = createLogComponent()
  const server = await createServerComponent<GlobalContext>({ config, logs }, {})
  const statusChecks = await createStatusCheckComponent({ server, config })
  const fetch = await createFetchComponent()
  const metrics = await createMetricsComponent(metricDeclarations, { server, config })
  const marketplaceSubgraph = await createSubgraphComponent({ logs, config, fetch, metrics }, SUBGRAPH_URL)
  const database = await createPgComponent({ config, logs, metrics })
  const schemaValidator = await createSchemaValidatorComponent()
  const rentals = await createRentalsComponent({ database, logs, marketplaceSubgraph })

  return {
    config,
    logs,
    server,
    statusChecks,
    fetch,
    metrics,
    database,
    marketplaceSubgraph,
    schemaValidator,
    rentals,
  }
}
