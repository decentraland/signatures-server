import * as nodeFetch from "node-fetch"

export type FetchParameters = Parameters<typeof nodeFetch.default>
export type RequestInterceptor = (url: nodeFetch.RequestInfo, init?: nodeFetch.RequestInit) => FetchParameters
export type ResponseInterceptors = (
  response: nodeFetch.Response,
  url: nodeFetch.RequestInfo,
  init?: nodeFetch.RequestInit
) => Promise<nodeFetch.Response>
