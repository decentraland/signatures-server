import { JSONSchemaType } from "ajv"
import { PeriodCreation } from "../types"

export const PeriodCreationSchema: JSONSchemaType<PeriodCreation> = {
  type: "object",
  properties: {
    min: { type: "integer", minimum: 0 },
    max: { type: "integer" },
    price: { type: "string", pattern: "^[0-9]+$" },
  },
  additionalProperties: false,
  required: ["min", "max", "price"],
}
