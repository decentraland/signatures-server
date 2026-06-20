import type { IFetchComponent, IHttpServerComponent } from "@dcl/core-commons"
import type {
  IConfigComponent,
  ILoggerComponent,
  IBaseComponent,
  IMetricsComponent,
  ITracerComponent,
} from "@well-known-components/interfaces"
import { IPgComponent } from "@dcl/pg-component"
import { ISubgraphComponent } from "@dcl/thegraph-component"
import { ISchemaValidatorComponent } from "@dcl/schema-validator-component"
import { IJobComponent } from "@dcl/job-component"
import { IRentalsComponent } from "./ports/rentals/types"
import { metricDeclarations } from "./metrics"

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
  schemaValidator: ISchemaValidatorComponent<GlobalContext>
  rentals: IRentalsComponent
  tracer: ITracerComponent
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
  UNSUPPORTED_MEDIA_TYPE = 415,
  ERROR = 500,
}
