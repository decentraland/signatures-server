export function buildQueryParameters<T extends Record<string, any>>(
  filterBy?: Partial<T>,
  first?: number,
  orderBy?: keyof T,
  orderDirection?: "desc" | "asc"
): { querySignature: string; queryVariables: string } {
  let querySignature = ""
  let queryVariables = ""

  if (first) {
    querySignature += `first: ${first} `
  }
  if (orderBy) {
    querySignature += `orderBy: ${orderBy.toString()} `
  }
  if (orderDirection) {
    querySignature += `orderDirection: ${orderDirection} `
  }
  if (filterBy) {
    querySignature += `where: { ${Object.keys(filterBy)
      .filter((key) => filterBy[key] !== undefined)
      .reduce((acc, key) => `${acc} ${key}: $${key}`, "")} }`
    queryVariables += Object.entries(filterBy)
      .filter(([_, value]) => value !== undefined)
      .map(([key, value]) => {
        let type: string
        if (typeof value === "string") {
          type = "String"
        } else if (typeof value === "number") {
          type = "Int"
        } else if (typeof value === "boolean") {
          type = "Boolean"
        } else {
          throw new Error("Can't parse filter by type")
        }

        return `$${key}: ${type}`
      })
      .join(" ")
  }

  return {
    querySignature,
    queryVariables,
  }
}
