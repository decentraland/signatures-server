import { TraceParent } from "./types"
import crypto from "crypto"

/**
 * Parses the transtate header into an object.
 * @param traceParent - The transtate header.
 * @returns An object which contains each property and its value found in the transtate header or null.
 */
export function parseTraceState(traceState: string): Record<string, string> {
  return traceState.split(",").reduce((acc, curr) => {
    const [key, value] = curr.split("=")
    acc[key] = value
    return acc
  }, {} as Record<string, string>)
}

/**
 * Parses the transparent header into an object.
 * @param traceParent - The traceparent header.
 * @returns An object which contains each property of the tranceparent header or null if it can't be parsed.
 */
export function parseTraceParent(traceParent: string): TraceParent | null {
  const traceParentProperties = traceParent.split("-")
  if (traceParentProperties.length !== 4) {
    return null
  }

  const versionHasTheWrongSize = traceParentProperties[0].length !== 2
  const traceIdHasTheWrongSize = traceParentProperties[1].length !== 32
  const parentIdHasTheWrongSize = traceParentProperties[2].length !== 16
  const traceFlagsHaveTheWrongSize = traceParentProperties[3].length !== 2
  const traceIdIsInvalid = traceParentProperties[1] === "00000000000000000000000000000000"
  const parentIdIsInvalid = traceParentProperties[2] === "0000000000000000"

  return versionHasTheWrongSize ||
    traceIdHasTheWrongSize ||
    parentIdHasTheWrongSize ||
    traceFlagsHaveTheWrongSize ||
    traceIdIsInvalid ||
    parentIdIsInvalid
    ? null
    : {
        version: traceParentProperties[0],
        traceId: traceParentProperties[1],
        parentId: traceParentProperties[2],
        traceFlags: traceParentProperties[3],
      }
}

/**
 * Builds a traceparent header based on their properties.
 * @param version - The traceparent header version.
 * @param traceId - The traceparent header trace id.
 * @param parentId - The traceparent header parent id.
 * @param parentId - The traceparent header trace flags.
 */
export function buildTraceParent(version: string, traceId: string, parentId: string, traceFlags: string): string {
  return `${version}-${traceId}-${parentId}-${traceFlags}`
}

export function buildTraceState(traceState: Record<string, string>): string | null {
  return Object.keys(traceState).length > 0
    ? Object.entries(traceState).reduce(
        (acc, curr, index, arr) => `${acc}=${curr}${index !== arr.length - 1 ? "," : ""}`,
        ""
      )
    : null
}

/**
 * Generates a random set of bytes and then converts them into a lowercased hex string.
 * @param length - The length in bytes from where to generate the hex string.
 */
function generateRandomBytesHexString(length: number): string {
  return crypto.randomBytes(length).toString("hex").toLowerCase()
}

/**
 * Generates a random trace id represented as an hex string.
 */
export function generateTraceId(): string {
  return generateRandomBytesHexString(8)
}

/**
 * Generates a random parent id represented as an hex string.
 */
export function generateParentId(): string {
  return generateRandomBytesHexString(16)
}
