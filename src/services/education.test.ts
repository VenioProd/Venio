import { describe, it, expect } from 'vitest'
import { nextAttendanceState } from './education'

describe('nextAttendanceState', () => {
  it('passe NON_RENSEIGNE → PRESENT (premier tap)', () => {
    expect(nextAttendanceState('NON_RENSEIGNE')).toBe('PRESENT')
  })

  it('cycle PRESENT → RETARD → ABSENT → EXCUSE → PRESENT', () => {
    expect(nextAttendanceState('PRESENT')).toBe('RETARD')
    expect(nextAttendanceState('RETARD')).toBe('ABSENT')
    expect(nextAttendanceState('ABSENT')).toBe('EXCUSE')
    expect(nextAttendanceState('EXCUSE')).toBe('PRESENT')
  })
})
