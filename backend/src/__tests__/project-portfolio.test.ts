import { describe, it, expect } from 'vitest'
import { computeSignals, loadPercent } from '../lib/projectPortfolio.js'
import { parseBulkRequest, BULK_MAX_IDS } from '../lib/projectBulk.js'
import { sanitizeViewFilters, sanitizeViewName } from '../lib/projectViews.js'

const NOW = new Date('2026-11-01T12:00:00Z')
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000)
const base = { status: 'EN_COURS', tasksTotal: 10, tasksDone: 5, lastActivityAt: NOW }

describe('computeSignals', () => {
  it('signale un retard avec le nombre de jours et les actions associées', () => {
    const s = computeSignals({ ...base, endDate: days(-12) }, NOW)
    expect(s.overdueDays).toBe(12)
    expect(s.risks.find((r) => r.code === 'LATE')?.value).toBe(12)
    expect(s.urgency).toBeGreaterThanOrEqual(100)
    expect(s.actions).toEqual(expect.arrayContaining(['POSTPONE', 'REMIND_CLIENT', 'REASSIGN']))
  })

  it('un projet terminé n’est jamais en retard', () => {
    const s = computeSignals({ ...base, status: 'TERMINE', endDate: days(-30), billingStatus: 'FACTURE' }, NOW)
    expect(s.overdueDays).toBe(0)
    expect(s.risks).toEqual([])
  })

  it('calcule le budget consommé = facturé / budget et alerte au-delà de 100 %', () => {
    const s = computeSignals({ ...base, budgetAmount: 18000, amountInvoiced: 20160 }, NOW)
    expect(s.budgetPct).toBe(112)
    expect(s.risks.some((r) => r.code === 'BUDGET_OVER')).toBe(true)
    expect(computeSignals({ ...base, budgetAmount: 0, amountInvoiced: 10 }, NOW).budgetPct).toBeNull()
  })

  it('détecte un retard projeté quand l’avancement est loin derrière le temps écoulé', () => {
    const s = computeSignals(
      { ...base, tasksDone: 4, tasksTotal: 10, startDate: days(-27), endDate: days(3) },
      NOW,
    )
    expect(s.expectedProgress).toBe(90)
    expect(s.risks.map((r) => r.code)).toEqual(expect.arrayContaining(['PROJECTED_LATE', 'DUE_SOON']))
  })

  it('détecte l’inactivité à partir de 14 jours', () => {
    expect(computeSignals({ ...base, lastActivityAt: days(-16) }, NOW).risks.some((r) => r.code === 'STALE')).toBe(true)
    expect(computeSignals({ ...base, lastActivityAt: days(-5) }, NOW).risks.some((r) => r.code === 'STALE')).toBe(false)
  })

  it('un projet livré non facturé est à facturer', () => {
    const s = computeSignals({ ...base, status: 'TERMINE', billingStatus: 'NON_FACTURE' }, NOW)
    expect(s.risks.map((r) => r.code)).toEqual(['TO_BILL'])
    expect(s.actions).toEqual(['INVOICE', 'ARCHIVE'])
  })

  it('avancement sans tâche : 0 en cours, 100 terminé', () => {
    expect(computeSignals({ status: 'EN_COURS', tasksTotal: 0, tasksDone: 0 }, NOW).progress).toBe(0)
    expect(computeSignals({ status: 'TERMINE', tasksTotal: 0, tasksDone: 0, billingStatus: 'FACTURE' }, NOW).progress).toBe(100)
  })
})

describe('loadPercent', () => {
  it('compare les heures ouvertes à deux semaines de capacité', () => {
    expect(loadPercent({ capacityHours: 35, openHours: 70 })).toBe(100)
    expect(loadPercent({ capacityHours: 35, openHours: 73.5 })).toBe(105)
    expect(loadPercent({ capacityHours: 0, openHours: 10 })).toBe(0)
  })
})

describe('parseBulkRequest', () => {
  const id = '65a1b2c3d4e5f6a7b8c9d0e1'
  it('accepte une demande valide et dédoublonne les ids', () => {
    const r = parseBulkRequest({ action: 'archive', ids: [id, id] })
    expect(r).toEqual({ request: { action: 'archive', ids: [id], value: null } })
  })
  it('refuse action inconnue, liste vide, id invalide et dépassement', () => {
    expect('error' in parseBulkRequest({ action: 'nuke', ids: [id] })).toBe(true)
    expect('error' in parseBulkRequest({ action: 'archive', ids: [] })).toBe(true)
    expect('error' in parseBulkRequest({ action: 'archive', ids: ['x'] })).toBe(true)
    const many = Array.from({ length: BULK_MAX_IDS + 1 }, (_, i) => i.toString(16).padStart(24, '0'))
    expect('error' in parseBulkRequest({ action: 'archive', ids: many })).toBe(true)
  })
  it('valide la valeur selon l’action', () => {
    expect('error' in parseBulkRequest({ action: 'set-status', ids: [id], value: 'NOPE' })).toBe(true)
    expect('error' in parseBulkRequest({ action: 'set-status', ids: [id], value: 'TERMINE' })).toBe(false)
    expect('error' in parseBulkRequest({ action: 'set-assignee', ids: [id], value: null })).toBe(false)
    expect('error' in parseBulkRequest({ action: 'set-assignee', ids: [id], value: 'zzz' })).toBe(true)
  })
})

describe('vues sauvegardées', () => {
  it('ne garde que les filtres connus et valides', () => {
    const f = sanitizeViewFilters({ status: 'X', priority: 'HAUTE', risk: true, late: 'yes', q: '  lumen ', evil: 1, sort: 'zzz' })
    expect(f).toMatchObject({ status: '', priority: 'HAUTE', risk: true, late: false, q: 'lumen', sort: 'urgency' })
    expect(f).not.toHaveProperty('evil')
  })
  it('valide le nom', () => {
    expect(sanitizeViewName('  Mes retards ')).toBe('Mes retards')
    expect(sanitizeViewName('')).toBeNull()
    expect(sanitizeViewName('x'.repeat(61))).toBeNull()
  })
})
