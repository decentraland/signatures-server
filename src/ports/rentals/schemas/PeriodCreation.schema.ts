import { JSONSchemaType } from "ajv"
import { PeriodCreation } from "../types"

export const PeriodCreationSchema: JSONSchemaType<PeriodCreation> = {
  type: "object",
  properties: {
    minDays: { type: "integer", minimum: 0, maximum: 2147483647 },
    maxDays: { type: "integer", maximum: 2147483647 },
    pricePerDay: { type: "string", pattern: "^[0-9]+$" },
  },
  additionalProperties: false,
  required: ["minDays", "maxDays", "pricePerDay"],
}
