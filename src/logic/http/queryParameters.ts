import { InvalidParameterError } from "./errors"

function getParameter<T>(values: T[], parameterName: string, parameterValue: T | null): T | null {
  if (parameterValue === null) {
    return null
  }

  if (parameterValue && !values.includes(parameterValue)) {
    throw new InvalidParameterError(parameterName, (parameterValue as any).toString())
  }

  return parameterValue
}

export function getTypedStringQueryParameter<T>(
  values: T[],
  queryParameters: URLSearchParams,
  parameterName: string
): T | null {
  const parameterValue = queryParameters.get(parameterName) as T | null
  return getParameter(values, parameterName, parameterValue)
}

export function getTypedArrayStringQueryParameter<T>(
  values: T[],
  queryParameters: URLSearchParams,
  parameterName: string
) {
  const parameterValue = queryParameters.get(parameterName) as T[] | null

  if (
    parameterValue === null ||
    !Array.isArray(parameterName) ||
    (Array.isArray(parameterName) && parameterValue.length === 0)
  ) {
    return null
  }

  return parameterValue.map((value) => getParameter(values, parameterName, value))
}
