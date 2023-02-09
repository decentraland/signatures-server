import { IFetchComponent } from "@well-known-components/http-server"
import * as nodeFetch from "node-fetch"
import { FetchParameters, RequestInterceptor, ResponseInterceptors } from "./types"

export function createFetchComponent(
  fetcher: typeof nodeFetch.default,
  options?: {
    requestInterceptors?: RequestInterceptor[]
    responseInterceptors?: ResponseInterceptors[]
  }
): IFetchComponent {
  async function fetch(url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit): Promise<nodeFetch.Response> {
    let fetchParameters: FetchParameters = [url, init]
    const requestInterceptors = options?.requestInterceptors
    const responseInterceptors = options?.responseInterceptors

    // Apply interceptors to the HTTP request
    fetchParameters =
      requestInterceptors?.reduce((parameters, requestInterceptor) => {
        return requestInterceptor(...parameters)
      }, fetchParameters) ?? fetchParameters

    // Apply interceptors to the response
    return (
      responseInterceptors?.reduce(
        (promiseOfAResponse, responseInterceptor) =>
          promiseOfAResponse.then((response) => responseInterceptor(response, url, init)),
        fetcher(...fetchParameters)
      ) ?? fetcher(...fetchParameters)
    )
  }

  return {
    fetch,
  }
}
