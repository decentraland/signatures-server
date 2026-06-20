import { IMetricsComponent } from "@well-known-components/interfaces"
import { validateMetricsDeclaration } from "@dcl/metrics"
import { getDefaultHttpMetrics } from "@dcl/http-server"
import { metricDeclarations as loggerMetricsDeclarations } from "@well-known-components/logger"
import { metricDeclarations as graphMetrics } from "@dcl/thegraph-component"

export const metricDeclarations = {
  test_ping_counter: {
    help: "Count calls to ping",
    type: IMetricsComponent.CounterType,
    labelNames: ["pathname"],
  },
  ...getDefaultHttpMetrics(),
  ...loggerMetricsDeclarations,
  ...graphMetrics,
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
