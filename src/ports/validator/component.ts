import Ajv, { Schema } from "ajv"
import addFormats from "ajv-formats"
import { Validation, IValidatorComponent } from "./types"

export function createValidatorComponent(): IValidatorComponent {
  const ajv = new Ajv({ removeAdditional: true })
  addFormats(ajv)

  function validateSchema(schema: Schema, data: any): Validation {
    const validate = ajv.compile(schema)
    const valid = validate(data)

    return {
      valid,
      errors: validate.errors ?? null,
    }
  }

  return {
    validateSchema,
  }
}
