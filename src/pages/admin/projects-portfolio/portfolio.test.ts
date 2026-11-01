import { describe, it, expect } from 'vitest'
import { applyFilters, EMPTY_FILTERS, sameFilters, dueLabel, BUILTIN_VIEWS, type PortfolioItem } from './portfolio'

const mk = (o: Partial<PortfolioItem>): PortfolioItem => ({
  _id: 'x',
  name: 'P',
  projectNumber: '',
  status: 'EN_COURS',
  priority: 'NORMALE',
  client: { _id: 'c', name: 'Acme' },
  assignedTo: { _id: 'u1', name: 'Camille' },
  endDate: null,
  budget: { amount: null, invoiced: null, currency: 'EUR' },
  tasks: { total: 0, done: 0 },
  progress: 0,
  expectedProgress: null,
  daysToDue: null,
  overdueDays: 0,
  budgetPct: null,
  staleDays: 0,
  risks: [],
  urgency: 0,
  actions: [],
  ...o,
})

const items = [
  mk({ _id: '1', name: 'Lumen', overdueDays: 12, urgency: 112, risks: [{ code: 'LATE', value: 12 }] }),
  mk({ _id: '2', name: 'Orsay', assignedTo: { _id: 'u2', name: 'Thomas' }, urgency: 50, daysToDue: 3, risks: [{ code: 'DUE_SOON', value: 3 }] }),
  mk({ _id: '3', name: 'Cèdre', status: 'TERMINE', urgency: 30, risks: [{ code: 'TO_BILL', value: null }] }),
  mk({ _id: '4', name: 'Boréal', urgency: 0 }),
]

describe('applyFilters', () => {
  it('trie par urgence décroissante par défaut', () => {
    expect(applyFilters(items, EMPTY_FILTERS, 'u1').map((i) => i._id)).toEqual(['1', '2', '3', '4'])
  })
  it('filtre les vues prédéfinies', () => {
    const f = (id: string) => BUILTIN_VIEWS.find((v) => v.id === id)!.filters
    expect(applyFilters(items, f('late'), 'u1').map((i) => i._id)).toEqual(['1'])
    expect(applyFilters(items, f('toBill'), 'u1').map((i) => i._id)).toEqual(['3'])
    expect(applyFilters(items, f('risk'), 'u1').map((i) => i._id)).toEqual(['1', '2'])
    expect(applyFilters(items, f('mine'), 'u2').map((i) => i._id)).toEqual(['2'])
  })
  it('recherche par nom ou client et combine les filtres', () => {
    expect(applyFilters(items, { ...EMPTY_FILTERS, q: 'lum' }, 'u1')).toHaveLength(1)
    expect(applyFilters(items, { ...EMPTY_FILTERS, q: 'acme' }, 'u1')).toHaveLength(4)
    expect(applyFilters(items, { ...EMPTY_FILTERS, q: 'acme', status: 'TERMINE' }, 'u1')).toHaveLength(1)
  })
  it('trie par échéance, sans date en dernier', () => {
    const out = applyFilters(items, { ...EMPTY_FILTERS, sort: 'dueDate' }, 'u1')
    expect(out[0]._id).toBe('2')
  })
})

describe('helpers', () => {
  it('compare des filtres', () => {
    expect(sameFilters(EMPTY_FILTERS, { ...EMPTY_FILTERS })).toBe(true)
    expect(sameFilters(EMPTY_FILTERS, { ...EMPTY_FILTERS, late: true })).toBe(false)
  })
  it('formate l’échéance', () => {
    expect(dueLabel({ endDate: null, daysToDue: null, overdueDays: 0, status: 'EN_COURS' })).toBe('—')
    expect(dueLabel({ endDate: '2026-10-20', daysToDue: -12, overdueDays: 12, status: 'EN_COURS' })).toBe('−12 j')
    expect(dueLabel({ endDate: '2026-11-04', daysToDue: 3, overdueDays: 0, status: 'EN_COURS' })).toBe('J−3')
  })
})
