import { describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { computeQuoteTotals, validateSelection } from '../lib/quoteTotals.js'

const id = () => new mongoose.Types.ObjectId()
const mandatoryId = id()
const optionalAId = id()
const optionalBId = id()

const lines = [
  { _id: mandatoryId, description: 'Conception', quantity: 1, unitPrice: 2000, taxRate: 20, isOptional: false },
  { _id: optionalAId, description: 'Rédaction', quantity: 2, unitPrice: 300, taxRate: 20, isOptional: true },
  { _id: optionalBId, description: 'Photos', quantity: 1, unitPrice: 450, taxRate: 10, isOptional: true },
] as never[]

describe('computeQuoteTotals', () => {
  it('ne compte que les lignes obligatoires quand rien n’est retenu', () => {
    const totals = computeQuoteTotals(lines, [])
    expect(totals.subtotal).toBe(2000)
    expect(totals.taxTotal).toBe(400)
    expect(totals.total).toBe(2400)
    expect(totals.lines).toHaveLength(1)
  })

  it('ajoute les optionnelles retenues, avec leur propre taux de TVA', () => {
    const totals = computeQuoteTotals(lines, [optionalAId, optionalBId])
    expect(totals.subtotal).toBe(3050)
    expect(totals.taxTotal).toBe(565)
    expect(totals.total).toBe(3615)
    expect(totals.lines).toHaveLength(3)
  })

  it('arrondit au centime sans dériver', () => {
    const centimes = [
      { _id: id(), description: 'Tiers', quantity: 3, unitPrice: 33.333, taxRate: 20, isOptional: false },
    ] as never[]
    const totals = computeQuoteTotals(centimes, [])
    expect(totals.subtotal).toBe(100)
    expect(totals.taxTotal).toBe(20)
    expect(totals.total).toBe(120)
  })
})

describe('validateSelection', () => {
  it('accepte une sélection ne portant que sur des optionnelles', () => {
    expect(validateSelection(lines, [optionalAId])).toEqual({ valid: true })
  })

  it('rejette un identifiant inconnu', () => {
    const unknown = id()
    expect(validateSelection(lines, [unknown])).toEqual({ valid: false, invalidIds: [String(unknown)] })
  })

  it('rejette la sélection d’une ligne obligatoire', () => {
    expect(validateSelection(lines, [mandatoryId])).toEqual({ valid: false, invalidIds: [String(mandatoryId)] })
  })
})
