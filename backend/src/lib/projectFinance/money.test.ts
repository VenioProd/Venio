import { describe, expect, it } from 'vitest'
import { divHalfUp, floorBp, toCents, vatCents } from './money.js'

describe('toCents', () => {
  it('absorbe le bruit des flottants', () => {
    expect(toCents(1.005)).toBe(101)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(9999.99)).toBe(999999)
    expect(toCents(1199.88)).toBe(119988)
  })

  it('arrondit symétriquement les négatifs', () => {
    expect(toCents(-1.005)).toBe(-101)
    expect(toCents(-0)).toBe(0)
  })

  it('refuse les valeurs non finies', () => {
    expect(() => toCents(Number.NaN)).toThrow()
    expect(() => toCents(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('floorBp', () => {
  it('arrondit vers −∞', () => {
    expect(floorBp(33333, 3500)).toBe(11666)
    expect(floorBp(-33333, 3500)).toBe(-11667)
    expect(floorBp(999999, 3333)).toBe(333299)
  })

  it('reste exact au-delà de Number.MAX_SAFE_INTEGER pour le produit intermédiaire', () => {
    // 90 000 000 000 000 centimes × 9 999 bp dépasse 2^53 avant division.
    expect(floorBp(90_000_000_000_000, 9_999)).toBe(89_991_000_000_000)
  })

  it('refuse les entrées non entières ou hors bornes', () => {
    expect(() => floorBp(10.5, 100)).toThrow()
    expect(() => floorBp(100, 10_001)).toThrow()
    expect(() => floorBp(100, -1)).toThrow()
  })
})

describe('divHalfUp et vatCents', () => {
  it('arrondit le demi en s’éloignant de zéro', () => {
    expect(divHalfUp(5, 2)).toBe(3)
    expect(divHalfUp(-5, 2)).toBe(-3)
    expect(divHalfUp(4, 3)).toBe(1)
  })

  it('refuse un dénominateur nul', () => {
    expect(() => divHalfUp(1, 0)).toThrow()
  })

  it('calcule la TVA au demi-centime supérieur', () => {
    expect(vatCents(333299, 2000)).toBe(66660)
    expect(vatCents(333401, 2000)).toBe(66680)
    expect(vatCents(11666, 2000)).toBe(2333)
  })
})
