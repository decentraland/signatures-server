const MAX_LIMIT = 50
const DEFAULT_PAGE = 0

export const getPaginationParams = (params: URLSearchParams): { limit: number; page: number } => {
  const limit = params.get("limit")
  const page = params.get("page")
  const parsedLimit = parseInt(limit as string, 10)
  const parsedPage = parseInt(page as string, 10)
  return {
    limit: limit && !isNaN(parsedLimit) && parsedLimit <= MAX_LIMIT ? parsedLimit : MAX_LIMIT,
    page: page && !isNaN(parsedPage) ? parsedPage : DEFAULT_PAGE,
  }
}
