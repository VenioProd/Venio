import { describe, it, expect } from 'vitest'
import type { Request } from 'express'
import {
  parsePagination,
  paginatedResponse,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from '../routes/agent/_middleware/pagination.js'

function mkReq(query: Record<string, string>): Request {
  return { query } as unknown as Request
}

describe('Agent / parsePagination', () => {
  it('defaults to page=1, pageSize=50 when query is empty', () => {
    const p = parsePagination(mkReq({}))
    expect(p.page).toBe(1)
    expect(p.pageSize).toBe(DEFAULT_PAGE_SIZE)
    expect(p.skip).toBe(0)
    expect(p.limit).toBe(DEFAULT_PAGE_SIZE)
  })

  it('parses valid integers', () => {
    const p = parsePagination(mkReq({ page: '3', pageSize: '20' }))
    expect(p.page).toBe(3)
    expect(p.pageSize).toBe(20)
    expect(p.skip).toBe(40)
    expect(p.limit).toBe(20)
  })

  it('caps pageSize at MAX_PAGE_SIZE', () => {
    const p = parsePagination(mkReq({ pageSize: '5000' }))
    expect(p.pageSize).toBe(MAX_PAGE_SIZE)
  })

  it('clamps non-positive page to 1', () => {
    expect(parsePagination(mkReq({ page: '0' })).page).toBe(1)
    expect(parsePagination(mkReq({ page: '-5' })).page).toBe(1)
  })

  it('falls back to defaults on garbage input', () => {
    const p = parsePagination(mkReq({ page: 'abc', pageSize: 'xyz' }))
    expect(p.page).toBe(1)
    expect(p.pageSize).toBe(DEFAULT_PAGE_SIZE)
  })

  it('floors fractional values', () => {
    const p = parsePagination(mkReq({ page: '2.7', pageSize: '15.9' }))
    expect(p.page).toBe(2)
    expect(p.pageSize).toBe(15)
  })
})

describe('Agent / paginatedResponse', () => {
  it('builds the standardized response shape', () => {
    const p = parsePagination(mkReq({ page: '2', pageSize: '10' }))
    const result = paginatedResponse([{ id: 1 }, { id: 2 }], p, 87)
    expect(result).toEqual({
      items: [{ id: 1 }, { id: 2 }],
      page: 2,
      pageSize: 10,
      total: 87,
    })
  })
})
