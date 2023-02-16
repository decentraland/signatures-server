import { IFetchComponent } from "@well-known-components/http-server"
import { ITracerComponent } from "@well-known-components/tracer-component"
import * as nodeFetch from "node-fetch"

export async function createFetchComponent(components: { tracer: ITracerComponent }): Promise<IFetchComponent> {
  const { tracer } = components

  const fetch: IFetchComponent = {
    fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
      const headers: nodeFetch.HeadersInit = { ...init?.headers }
      const traceParent = tracer.isInsideOfTraceSpan() ? tracer.getTraceChildString() : null
      if (traceParent) {
        ;(headers as { [key: string]: string }).traceparent = traceParent
        const traceState = tracer.getTraceStateString()
        if (traceState) {
          ;(headers as { [key: string]: string }).tracestate = traceState
        }
      }

      return nodeFetch.default(url, { ...init, headers })
    },
  }

  return fetch
}
