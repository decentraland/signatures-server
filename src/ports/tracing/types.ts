export type TraceComponent = {
  getCurrentTraceParent(): string | null
  getChildTraceParent(): string | null
  getTraceState(): string | null
  getTraceStateProperties(): Record<string, string> | undefined
  getCurrentTraceParentProperties(): TraceParent | undefined
  getChildTraceParentProperties(): TraceParent | undefined
  setTraceStateProperty(key: string, value: string): void
}

export type TraceParent = {
  version: string
  /** This is the ID of the whole trace forest and is used to uniquely identify a distributed trace through a system. It is represented as a 16-byte array, for example, 4bf92f3577b34da6a3ce929d0e0e4736. All bytes as zero (00000000000000000000000000000000) is considered an invalid value. */
  traceId: string
  /** This is the ID of this request as known by the caller (in some tracing systems, this is known as the span-id, where a span is the execution of a client request). It is represented as an 8-byte array, for example, 00f067aa0ba902b7. All bytes as zero (0000000000000000) is considered an invalid value. */
  parentId: string
  /** An 8-bit field that controls tracing flags such as sampling, trace level, etc. */
  traceFlags: string
}
