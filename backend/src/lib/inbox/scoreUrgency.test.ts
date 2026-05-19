import { describe, it, expect } from 'vitest'
import { scoreUrgency } from './scoreUrgency.js'

describe('scoreUrgency', () => {
  it('décision URGENTE = 100 (70 base + 30 bonus)', () => {
    expect(scoreUrgency({ type: 'decision', priority: 'URGENTE' })).toBe(100)
  })

  it('décision sans priorité = 70', () => {
    expect(scoreUrgency({ type: 'decision' })).toBe(70)
  })

  it('brief P1 = 80 (60 base + 20 bonus)', () => {
    expect(scoreUrgency({ type: 'brief', priority: 'P1' })).toBe(80)
  })

  it('deadline dépassée ajoute +20', () => {
    const past = new Date(Date.now() - 86400 * 1000)
    expect(scoreUrgency({ type: 'task', deadline: past })).toBe(50)  // 30 + 20
    expect(scoreUrgency({ type: 'task' })).toBe(30)
  })

  it('daysSinceContact > 14 ajoute +10', () => {
    expect(scoreUrgency({ type: 'lead', daysSinceContact: 20 })).toBe(60)
    expect(scoreUrgency({ type: 'lead', daysSinceContact: 10 })).toBe(50)
  })

  it('cap à 100', () => {
    const past = new Date(Date.now() - 86400 * 1000)
    expect(scoreUrgency({ type: 'decision', priority: 'URGENTE', deadline: past })).toBe(100)
  })

  it('type system = 35', () => {
    expect(scoreUrgency({ type: 'system' })).toBe(35)
  })

  it('type pin = 25', () => {
    expect(scoreUrgency({ type: 'pin' })).toBe(25)
  })
})
