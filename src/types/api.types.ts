export interface ApiResponse<T = unknown> {
  data?: T
  meta?: PaginationMeta
  error?: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

/**
 * Options accepted by the JSON API client.
 *
 * `body` deliberately remains a `BodyInit`: callers that send JSON can keep
 * passing `JSON.stringify(payload)`, while the shared client can forward the
 * standard fetch options (notably `signal`) without narrowing them away.
 */
export interface ApiFetchOptions extends Omit<RequestInit, 'body' | 'headers'> {
  headers?: HeadersInit
  body?: BodyInit | null
}
