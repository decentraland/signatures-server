import { IHttpServerComponent } from "@well-known-components/interfaces"
import { Schema } from "ajv"
import { AppComponents, Context, StatusCode } from "../types"

export const withSchemaValidatorMiddleware = (
  components: Pick<AppComponents, "validator">,
  schema: Schema
): IHttpServerComponent.IRequestHandler<Context<string>> => {
  const { validator } = components
  return async (context, next): Promise<IHttpServerComponent.IResponse> => {
    if (context.request.headers.get("Content-Type") !== "application/json") {
      return {
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: "Content-Type must be application/json",
        },
      }
    }

    let data: any

    try {
      data = await context.request.clone().json()
    } catch (error) {
      return {
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: (error as { message: string }).message,
        },
      }
    }

    const validation = validator.validateSchema(schema, data)

    if (!validation.valid) {
      return {
        status: StatusCode.BAD_REQUEST,
        body: {
          ok: false,
          message: validation.errors,
        },
      }
    }

    return next()
  }
}
