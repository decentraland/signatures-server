import type { IFetchComponent } from "@well-known-components/http-server"
import type {
  IConfigComponent,
  ILoggerComponent,
  IHttpServerComponent,
  IBaseComponent,
  IMetricsComponent,
} from "@well-known-components/interfaces"
import { IPgComponent } from "@well-known-components/pg-component"
import { ISubgraphComponent } from "@well-known-components/thegraph-component"
import { ISchemaValidatorComponent } from "./ports/schema-validator"
import { IRentalsComponent } from "./ports/rentals/types"
import { metricDeclarations } from "./metrics"
import { IJobComponent } from "./ports/job/types"
import { TraceComponent } from "./ports/tracing/types"

export type GlobalContext = {
  components: BaseComponents
}

// components used in every environment
export type BaseComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<GlobalContext>
  fetch: IFetchComponent
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  database: IPgComponent
  marketplaceSubgraph: ISubgraphComponent
  rentalsSubgraph: ISubgraphComponent
  schemaValidator: ISchemaValidatorComponent
  rentals: IRentalsComponent
  trace: TraceComponent
  updateMetadataJob: IJobComponent
  updateRentalsListingsJob: IJobComponent
  cancelRentalsListingsJob: IJobComponent
}

// components used in runtime
export type AppComponents = BaseComponents & {
  statusChecks: IBaseComponent
}

// components used in tests
export type TestComponents = AppComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
}

// this type simplifies the typings of http handlers
export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>

export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>

export enum StatusCode {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  NOT_FOUND = 404,
  LOCKED = 423,
  CONFLICT = 409,
  ERROR = 500,
}
