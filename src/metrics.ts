import { IMetricsComponent } from "@well-known-components/interfaces"
import { validateMetricsDeclaration } from "@well-known-components/metrics"
import { metricDeclarations as loggerMetricsDeclarations } from "@well-known-components/logger"

export const metricDeclarations = {
  test_ping_counter: {
    help: "Count calls to ping",
    type: IMetricsComponent.CounterType,
    labelNames: ["pathname"],
  },
  ...loggerMetricsDeclarations,
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
