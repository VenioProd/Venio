import { describe, it, expect } from 'vitest'
import { computeProgress, STATUS_WEIGHT } from '../lib/dev/stats.js'
import type { DevIssueStatus } from '../models/DevIssue.js'

const empty: Record<DevIssueStatus, number> = {
  BACKLOG: 0, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, DONE: 0, CANCELLED: 0,
}

describe('computeProgress', () => {
  it('returns 0 when there are no issues', () => {
    expect(computeProgress(empty)).toBe(0)
  })

  it('returns 100 when all non-cancelled issues are DONE', () => {
    expect(computeProgress({ ...empty, DONE: 5, CANCELLED: 2 })).toBe(100)
  })

  it('returns 0 when only CANCELLED issues exist', () => {
    expect(computeProgress({ ...empty, CANCELLED: 3 })).toBe(0)
  })

  it('ignores CANCELLED in both numerator and denominator', () => {
    // 2 DONE (100) + 2 CANCELLED → 200 / (2*100) = 100
    expect(computeProgress({ ...empty, DONE: 2, CANCELLED: 2 })).toBe(100)
  })

  it('weights mixed statuses correctly', () => {
    // 1 BACKLOG (0) + 1 TODO (10) + 1 IN_PROGRESS (50) + 1 IN_REVIEW (80) + 1 DONE (100)
    // = 240 / 500 = 48
    expect(
      computeProgress({ ...empty, BACKLOG: 1, TODO: 1, IN_PROGRESS: 1, IN_REVIEW: 1, DONE: 1 })
    ).toBe(48)
  })

  it('rounds to nearest integer', () => {
    // 1 TODO (10) + 2 IN_PROGRESS (50) = 110 / 300 = 36.666... → 37
    expect(computeProgress({ ...empty, TODO: 1, IN_PROGRESS: 2 })).toBe(37)
  })

  it('exposes the documented weight map', () => {
    expect(STATUS_WEIGHT).toEqual({
      BACKLOG: 0, TODO: 10, IN_PROGRESS: 50, IN_REVIEW: 80, DONE: 100, CANCELLED: 0,
    })
  })
})
