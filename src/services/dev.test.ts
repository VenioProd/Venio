import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  computeWeightedProgress,
  fetchDevProjectCockpit,
  type DevIssueStatus,
} from './dev'

const empty = (): Record<DevIssueStatus, number> => ({
  BACKLOG: 0,
  TODO: 0,
  IN_PROGRESS: 0,
  IN_REVIEW: 0,
  DONE: 0,
  CANCELLED: 0,
})

describe('computeWeightedProgress', () => {
  it('returns 0 for empty input', () => {
    expect(computeWeightedProgress(empty())).toBe(0)
  })

  it('returns 100 when all issues are DONE', () => {
    const m = empty()
    m.DONE = 5
    expect(computeWeightedProgress(m)).toBe(100)
  })

  it('ignores CANCELLED in numerator and denominator', () => {
    const m = empty()
    m.DONE = 1
    m.CANCELLED = 99
    expect(computeWeightedProgress(m)).toBe(100)
  })

  it('weights in_progress (50) and in_review (80)', () => {
    const m = empty()
    m.IN_PROGRESS = 1
    m.IN_REVIEW = 1
    // (50 + 80) / 2 = 65
    expect(computeWeightedProgress(m)).toBe(65)
  })

  it('weights mixed statuses correctly', () => {
    // 2 BACKLOG (0), 2 TODO (10), 2 IN_PROGRESS (50), 2 IN_REVIEW (80), 2 DONE (100)
    // = (0 + 20 + 100 + 160 + 200) / 10 = 48
    const m = empty()
    m.BACKLOG = 2
    m.TODO = 2
    m.IN_PROGRESS = 2
    m.IN_REVIEW = 2
    m.DONE = 2
    expect(computeWeightedProgress(m)).toBe(48)
  })
})

describe('fetchDevProjectCockpit', () => {
  const ORIGINAL_FETCH = global.fetch
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH
  })

  it('hits the admin cockpit endpoint with the project id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ project: { key: 'VEN' }, counts: { total: 0 } }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
    const res = await fetchDevProjectCockpit('507f1f77bcf86cd799439011')
    expect(fetchMock).toHaveBeenCalled()
    const calledUrl = fetchMock.mock.calls[0]![0] as string
    expect(calledUrl).toContain('/api/admin/dev/projects/507f1f77bcf86cd799439011/dashboard')
    expect(res.project.key).toBe('VEN')
  })
})
