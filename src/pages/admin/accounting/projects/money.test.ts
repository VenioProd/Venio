import { describe, expect, it } from 'vitest'
import { formatMoney, parseMoney } from './money'

describe('montants en centimes', () => {
  it('formate les centimes en euros français', () => {
    expect(formatMoney(123450).replace(/[\u00a0\u202f]/g, ' ')).toBe('1 234,50 €')
  })
  it('convertit une saisie décimale exacte et refuse les montants invalides', () => {
    expect(parseMoney('1234,5')).toBe(123450)
    expect(parseMoney('0,01')).toBe(1)
    expect(() => parseMoney('12,345')).toThrow()
    expect(() => parseMoney('-0,01')).toThrow()
    expect(() => parseMoney('')).toThrow()
    expect(() => parseMoney('0')).toThrow()
    expect(parseMoney('0', true)).toBe(0)
  })
})
