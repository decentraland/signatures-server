import { ErrorObject, Schema } from "ajv"

export type Validation = {
  valid: boolean
  errors: null | ErrorObject[]
}

export type IValidatorComponent = {
  validateSchema(schema: Schema, data: any): Validation
}
