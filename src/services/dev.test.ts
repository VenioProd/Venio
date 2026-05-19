import { describe, it, expect } from 'vitest'
import { computeWeightedProgress, type DevIssueStatus } from './dev'

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
