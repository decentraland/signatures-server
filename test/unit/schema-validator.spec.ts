import { createConfigComponent } from "@well-known-components/env-config-provider"
import { createTestServerComponent } from "@well-known-components/http-server"
import { createTestMetricsComponent } from "@well-known-components/metrics"
import { createFetchComponent } from "../../src/ports/fetch"
import { createSchemaValidatorComponent } from "../../src/ports/schema-validator"
import { BaseComponents, StatusCode } from "../../src/types"
import {
  createTestRentalsComponent,
  createTestConsoleLogComponent,
  createTestDbComponent,
  createTestSubgraphComponent,
  createTestJobComponent,
} from "../components"

let middleware: ReturnType<ReturnType<typeof createSchemaValidatorComponent>["withSchemaValidatorMiddleware"]>
let components: BaseComponents

beforeEach(async () => {
  components = {
    fetch: await createFetchComponent(),
    server: createTestServerComponent(),
    rentals: createTestRentalsComponent(),
    logs: createTestConsoleLogComponent(),
    config: createConfigComponent({}),
    metrics: createTestMetricsComponent({}),
    database: createTestDbComponent(),
    marketplaceSubgraph: createTestSubgraphComponent(),
    rentalsSubgraph: createTestSubgraphComponent(),
    schemaValidator: createSchemaValidatorComponent(),
    updateMetadataJob: createTestJobComponent(),
    updateRentalsListingsJob: createTestJobComponent(),
    cancelRentalsListingsJob: createTestJobComponent(),
  }
  middleware = createSchemaValidatorComponent().withSchemaValidatorMiddleware({
    type: "object",
    properties: {
      aTestProp: {
        type: "string",
      },
    },
    required: ["aTestProp"],
  })
})

describe("when validating a request that doesn't have a JSON body", () => {
  it("should return a bad request error signaling that it must contain a JSON body", () => {
    return expect(
      middleware(
        {
          components,
          params: {},
          request: {
            headers: {
              get: jest.fn().mockImplementationOnce((header) => {
                if (header === "Content-Type") {
                  return null
                }
                throw new Error("Error")
              }),
            } as any,
          } as any,
          url: {} as URL,
        },
        jest.fn()
      )
    ).resolves.toEqual({
      status: StatusCode.BAD_REQUEST,
      body: {
        ok: false,
        message: "Content-Type must be application/json",
      },
    })
  })
})

describe("when validating a request that has a body that can't be parsed", () => {
  it("should return a bad request error containing the parsing error", () => {
    return expect(
      middleware(
        {
          components,
          params: {},
          request: {
            clone: jest.fn().mockReturnValue({
              json: () => {
                throw new Error("JSON Parsing Error")
              },
            }),
            headers: {
              get: jest.fn().mockImplementationOnce((header) => {
                if (header === "Content-Type") {
                  return "application/json"
                }
                throw new Error("Error")
              }),
            } as any,
          } as any,
          url: {} as URL,
        },
        jest.fn()
      )
    ).resolves.toEqual({
      status: StatusCode.BAD_REQUEST,
      body: {
        ok: false,
        message: "JSON Parsing Error",
      },
    })
  })
})

describe("when validating a request that has a valid schema that doesn't match the JSON body", () => {
  it("should return a bad request error signaling that the JSON body is invalid", () => {
    return expect(
      middleware(
        {
          components,
          params: {},
          request: {
            clone: jest.fn().mockReturnValue({
              json: () => ({ someProp: "someValue" }),
            }),
            headers: {
              get: jest.fn().mockImplementationOnce((header) => {
                if (header === "Content-Type") {
                  return "application/json"
                }
                throw new Error("Error")
              }),
            } as any,
          } as any,
          url: {} as URL,
        },
        jest.fn()
      )
    ).resolves.toEqual({
      status: StatusCode.BAD_REQUEST,
      body: {
        ok: false,
        message: "Invalid JSON body",
        data: [
          {
            instancePath: "",
            keyword: "required",
            message: "must have required property 'aTestProp'",
            params: {
              missingProperty: "aTestProp",
            },
            schemaPath: "#/required",
          },
        ],
      },
    })
  })
})

describe("when validating a request that has a valid schema that matches the JSON body", () => {
  let next: jest.Mock
  beforeEach(() => {
    next = jest.fn()
  })

  it("should call next to continue handling the next middleware", async () => {
    await expect(
      middleware(
        {
          components,
          params: {},
          request: {
            clone: jest.fn().mockReturnValue({
              json: () => ({ aTestProp: "someValue" }),
            }),
            headers: {
              get: jest.fn().mockImplementationOnce((header) => {
                if (header === "Content-Type") {
                  return "application/json"
                }
                throw new Error("Error")
              }),
            } as any,
          } as any,
          url: {} as URL,
        },
        next
      )
    )

    expect(next).toBeCalled()
  })
})
