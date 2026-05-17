import type { Request } from 'express'

/**
 * Pagination simple par numéro de page pour les listes de l'API agent.
 *
 * Convention : ?page=1&pageSize=50
 *   - page minimum : 1 (par défaut)
 *   - pageSize : 50 par défaut, cap à 200
 *   - Toute valeur non numérique ou hors borne est clampée silencieusement.
 *
 * Réponse standardisée :
 *   { items: T[], page, pageSize, total }
 */

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

export interface ParsedPagination {
  page: number
  pageSize: number
  skip: number
  limit: number
}

export interface PaginatedResponse<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

/**
 * Parse `?page` et `?pageSize` d'une requête. Clamp dans les bornes.
 */
export function parsePagination(req: Request): ParsedPagination {
  const rawPage = Number(req.query.page)
  const rawSize = Number(req.query.pageSize)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const sizeCandidate = Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : DEFAULT_PAGE_SIZE
  const pageSize = Math.min(MAX_PAGE_SIZE, sizeCandidate)
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    limit: pageSize,
  }
}

/**
 * Construit la réponse paginée standardisée à partir des items + total.
 */
export function paginatedResponse<T>(
  items: T[],
  pagination: ParsedPagination,
  total: number
): PaginatedResponse<T> {
  return {
    items,
    page: pagination.page,
    pageSize: pagination.pageSize,
    total,
  }
}
