import { AsyncLocalStorage } from "node:async_hooks"
import { IHttpServerComponent } from "@well-known-components/interfaces"
import { TraceComponent, TraceParent } from "./types"
import { buildTraceParent, generateParentId, generateTraceId, parseTraceParent, parseTraceState } from "./logic"

type TraceState = {
  rawTraceState?: string
  values: Record<string, string>
}

type ContextWithState = { state: { traceParent: TraceParent; traceState?: TraceState } }
const asyncLocalStorage = new AsyncLocalStorage<ContextWithState["state"]>()

export function createTraceComponent(
  components: { server: IHttpServerComponent<IHttpServerComponent.DefaultContext<any>> },
  options?: {
    parentId?: string
    traceFlags?: string
    version?: string
  }
): TraceComponent {
  const parentId = options?.parentId ?? generateParentId()

  function trace<T>(name: string, tracedFunction: () => T): T {
    const traceContext = {
      name,
    }
    const parentTraceContext = asyncLocalStorage.getStore()
    if (parentTraceContext) {
      traceContext.parentId = parentTraceContext.id
      traceContext.traceId = parentTraceContext.traceId
      traceContext.version = parentTraceContext.version
      traceContext.traceFlags = parentTraceContext.traceFlags
      traceContext.traceState = parentTraceContext.traceState
    } else {
      // Set up default values
      traceContext.parentId = parentTraceContext.id
      traceContext.traceId = parentTraceContext.traceId
      traceContext.version = parentTraceContext.version
      traceContext.traceFlags = parentTraceContext.traceFlags
      traceContext.traceState = parentTraceContext.traceState
    }
    return asyncLocalStorage.run(traceContext, tracedFunction)
  }

  components.server.use((ctx: IHttpServerComponent.DefaultContext<ContextWithState>, next) => {
    const traceParentHeader = ctx.request.headers.get("traceparent")
    const traceParent = traceParentHeader !== null ? parseTraceParent(traceParentHeader) : null
    const traceState = ctx.request.headers.get("tracestate")
    console.log("Getting trace state", traceState)
    if (!traceParent) {
      ctx.state = {
        ...ctx.state,
        traceParent: {
          ...ctx.state.traceParent,
          version: options?.version ?? "00",
          traceId: generateTraceId(),
          // Should we set an invalid parent id if there's none or auto-generate it?
          parentId: parentId,
          traceFlags: options?.traceFlags ?? "00",
        },
      }
    } else {
      ctx.state = {
        ...ctx.state,
        traceParent: {
          version: traceParent.version,
          traceId: traceParent.traceId,
          parentId: traceParent.parentId,
          traceFlags: traceParent.traceFlags,
          // childParentId: crypto.randomBytes(8).toString("hex")
        },
      }
      if (traceState) {
        ctx.state.traceState = {
          rawTraceState: traceState,
          values: parseTraceState(traceState),
        }
      }
    }

    return asyncLocalStorage.run(ctx.state, () => {
      return next().then((response) => {
        let traceHeaders: { traceparent: string; tracestate?: string } | undefined
        const traceParent = getCurrentTraceParent()
        if (traceParent) {
          traceHeaders = { traceparent: traceParent }
          const traceState = getTraceState()
          if (traceState) {
            traceHeaders.tracestate = traceState
          }
        }
        return { ...response, headers: { ...response.headers, ...traceHeaders } }
      })
    })
  })

  function getCurrentTraceParent(): string | null {
    const currentStore = asyncLocalStorage.getStore()
    if (
      currentStore === undefined ||
      currentStore.traceParent.version === null ||
      currentStore.traceParent.traceId === null ||
      currentStore.traceParent.parentId === null ||
      currentStore.traceParent.traceFlags === null
    ) {
      return null
    }
    return buildTraceParent(
      currentStore.traceParent.version,
      currentStore.traceParent.traceId,
      currentStore.traceParent.parentId,
      currentStore.traceParent.traceFlags
    )
  }

  function getChildTraceParent(): string | null {
    const currentStore = asyncLocalStorage.getStore()
    if (
      currentStore === undefined ||
      currentStore.traceParent.version === null ||
      currentStore.traceParent.traceId === null ||
      currentStore.traceParent.parentId === null ||
      currentStore.traceParent.traceFlags === null
    ) {
      return null
    }
    return buildTraceParent(
      currentStore.traceParent.version,
      currentStore.traceParent.traceId,
      // Generate or make it fixed
      generateParentId(),
      currentStore.traceParent.traceFlags
    )
  }

  function getTraceState(): string | null {
    const currentStore = asyncLocalStorage.getStore()
    return currentStore?.traceState?.rawTraceState ?? null
  }

  function getTraceStateProperties(): Record<string, string> | undefined {
    const currentStore = asyncLocalStorage.getStore()
    return currentStore?.traceState?.values
  }

  function getCurrentTraceParentProperties(): TraceParent | undefined {
    const currentStore = asyncLocalStorage.getStore()
    return currentStore?.traceParent
  }

  function getChildTraceParentProperties(): TraceParent | undefined {
    const currentStore = asyncLocalStorage.getStore()
    // Generate or have a fixed parent id?
    return currentStore?.traceParent ? { ...currentStore?.traceParent, parentId: generateParentId() } : undefined
  }

  function setTraceStateProperty(key: string, value: string): void {
    const currentStore = asyncLocalStorage.getStore()
    if (currentStore) {
      currentStore.traceState = {
        ...currentStore.traceState,
        values: { ...currentStore.traceState?.values, [key]: value },
      }
    }
  }

  return {
    getCurrentTraceParent,
    getChildTraceParent,
    getTraceState,
    getTraceStateProperties,
    getCurrentTraceParentProperties,
    getChildTraceParentProperties,
    setTraceStateProperty,
  }
}
