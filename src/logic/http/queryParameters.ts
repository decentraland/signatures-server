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

export function getTypedArrayStringQueryParameter<T extends string>(
  values: T[],
  queryParameters: URLSearchParams,
  parameterName: string
): T[] {
  return queryParameters
    .getAll(parameterName)
    .map((parameterValue) => getParameter(values, parameterName, parameterValue as T))
    .filter(Boolean) as T[]
}

export function getBooleanParameter(parameterName: string, parameterValue: string | null): boolean | undefined {
  if (parameterValue === null) {
    return undefined
  }

  if (parameterValue !== 'true' && parameterValue !== 'false') {
    throw new InvalidParameterError(parameterName, parameterValue)
  }

  return parameterValue === 'true'
}

export function getNumberParameter(parameterName: string, parameterValue: string | null): number | undefined {
  if (parameterValue === null) {
    return undefined
  }

  const valueAsNumber = Number.parseInt(parameterValue)
  if (Number.isNaN(valueAsNumber)) {
    throw new InvalidParameterError(parameterName, parameterValue)
  }

  return valueAsNumber
}
