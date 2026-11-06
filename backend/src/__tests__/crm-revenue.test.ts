import { describe, it, expect } from 'vitest'
import {
  MIN_COHORT_FOR_PIPELINE,
  addMonths,
  buildForecast,
  forecastCategory,
  leadProbability,
  leadRevenueEntries,
  monthRange,
  parisMonth,
  signedByLeadFromEntries,
  summariseRevenue,
  summariseRevenueByCurrency,
  weightedPipeline,
  weightedValue,
  type RevenueDocument,
} from '../lib/crmRevenue.js'
import { buildFunnel, type PilotageLead } from '../lib/crmPilotage.js'

function doc(overrides: Partial<RevenueDocument> = {}): RevenueDocument {
  return { type: 'QUOTE', status: 'ACCEPTED', total: 1000, ...overrides }
}

function lead(id: string, overrides: Partial<PilotageLead> = {}): PilotageLead {
  return { _id: id, status: 'LEAD', createdAt: new Date('2026-01-01'), ...overrides }
}

describe('summariseRevenue', () => {
  it('compte un devis accepté comme signé, pas comme encaissé', () => {
    const summary = summariseRevenue([doc({ type: 'QUOTE', status: 'ACCEPTED', total: 5000 })])
    expect(summary.signed).toBe(5000)
    expect(summary.collected).toBe(0)
  })

  it('compte une facture payée comme encaissée, pas comme signée', () => {
    const summary = summariseRevenue([doc({ type: 'INVOICE', status: 'PAID', total: 3000 })])
    expect(summary.collected).toBe(3000)
    expect(summary.signed).toBe(0)
  })

  it('ne compte pas deux fois un devis et sa facture', () => {
    // Le devis signé engage 5 000 ; la facture d'acompte en encaisse 2 000.
    const summary = summariseRevenue([
      doc({ type: 'QUOTE', status: 'ACCEPTED', total: 5000 }),
      doc({ type: 'INVOICE', status: 'PAID', total: 2000 }),
    ])
    expect(summary.signed).toBe(5000)
    expect(summary.collected).toBe(2000)
  })

  it('compte un devis passé à PAID une seule fois, du côté signé', () => {
    const summary = summariseRevenue([doc({ type: 'QUOTE', status: 'PAID', total: 4000 })])
    expect(summary.signed).toBe(4000)
    expect(summary.collected).toBe(0)
  })

  it('ignore un document annulé ou encore en brouillon', () => {
    const summary = summariseRevenue([
      doc({ type: 'QUOTE', status: 'CANCELLED', total: 9000 }),
      doc({ type: 'QUOTE', status: 'DRAFT', total: 8000 }),
      doc({ type: 'INVOICE', status: 'SENT', total: 7000 }),
    ])
    expect(summary.signed).toBe(0)
    expect(summary.collected).toBe(0)
  })

  it('rend des montants nuls sur un ensemble vide', () => {
    expect(summariseRevenue([])).toEqual({ signed: 0, collected: 0, documents: 0 })
  })
})

describe('summariseRevenue — devises', () => {
  it("ne mélange jamais deux devises : EUR par défaut, le reste ailleurs", () => {
    const documents = [
      doc({ total: 1000 }),
      doc({ total: 500, currency: 'USD' }),
      doc({ type: 'INVOICE', status: 'PAID', total: 200, currency: 'usd' }),
    ]
    expect(summariseRevenue(documents)).toEqual({ signed: 1000, collected: 0, documents: 1 })
    expect(summariseRevenue(documents, 'USD')).toEqual({ signed: 500, collected: 200, documents: 2 })
  })

  it('rend un objet par devise, EUR toujours présent', () => {
    const byCurrency = summariseRevenueByCurrency([doc({ total: 500, currency: 'CHF' })])
    expect(Object.keys(byCurrency).sort()).toEqual(['CHF', 'EUR'])
    expect(byCurrency.EUR).toEqual({ signed: 0, collected: 0, documents: 0 })
    expect(byCurrency.CHF!.signed).toBe(500)
  })
})

describe('leadRevenueEntries — devis rattachés directement au lead', () => {
  const lines = [{ _id: 'l1', description: 'Site', quantity: 2, unitPrice: 500, taxRate: 20, isOptional: false }] as never
  const none = new Map<string, string>()

  it('compte un devis signé sans projet, TTC, depuis ses lignes', () => {
    const entries = leadRevenueEntries({
      documents: [],
      leadByProject: none,
      proposals: [{ _id: 'p1', leadId: 'L1', status: 'SIGNED', project: null, lines, selectedOptionalLineIds: [] }],
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]!.leadId).toBe('L1')
    expect(summariseRevenue(entries.map((entry) => entry.document)).signed).toBe(1200)
  })

  it("ignore un devis non signé", () => {
    const entries = leadRevenueEntries({
      documents: [],
      leadByProject: none,
      proposals: [
        { _id: 'a', leadId: 'L1', status: 'SENT', lines },
        { _id: 'b', leadId: 'L1', status: 'DRAFT', lines },
        { _id: 'c', leadId: 'L1', status: 'CANCELLED', lines },
      ],
    })
    expect(entries).toEqual([])
  })

  it('ne recompte pas un devis dont le document de facturation est déjà compté', () => {
    const entries = leadRevenueEntries({
      documents: [{ _id: 'd1', project: 'P1', type: 'QUOTE', status: 'ACCEPTED', total: 1200 }],
      leadByProject: new Map([['P1', 'L1']]),
      proposals: [{ _id: 'p1', leadId: 'L1', status: 'SIGNED', project: 'P1', billingDocument: 'd1', lines }],
    })
    expect(entries).toHaveLength(1)
  })

  it("ne recompte pas un devis d'un projet rattaché au lead, même sans document lié", () => {
    const entries = leadRevenueEntries({
      documents: [],
      leadByProject: new Map([['P1', 'L1']]),
      proposals: [{ _id: 'p1', leadId: 'L1', status: 'SIGNED', project: 'P1', lines }],
    })
    expect(entries).toEqual([])
  })

  it("compte un devis d'un projet non rattaché dont le document n'est pas compté", () => {
    const entries = leadRevenueEntries({
      documents: [],
      leadByProject: none,
      proposals: [{ _id: 'p1', leadId: 'L1', status: 'SIGNED', project: 'P9', billingDocument: 'dX', lines }],
    })
    expect(entries).toHaveLength(1)
  })

  it('ne retient une option que cochée', () => {
    const withOption = [
      ...(lines as unknown as object[]),
      { _id: 'opt', description: 'Option', quantity: 1, unitPrice: 100, taxRate: 0, isOptional: true },
    ] as never
    const [unchecked] = leadRevenueEntries({
      documents: [],
      leadByProject: none,
      proposals: [{ _id: 'p', leadId: 'L', status: 'SIGNED', lines: withOption, selectedOptionalLineIds: [] }],
    })
    const [checked] = leadRevenueEntries({
      documents: [],
      leadByProject: none,
      proposals: [{ _id: 'p', leadId: 'L', status: 'SIGNED', lines: withOption, selectedOptionalLineIds: ['opt'] }],
    })
    expect(unchecked!.document.total).toBe(1200)
    expect(checked!.document.total).toBe(1300)
  })

  it('agrège le signé par lead, par devise', () => {
    const entries = leadRevenueEntries({
      documents: [
        { _id: 'd1', project: 'P1', type: 'QUOTE', status: 'ACCEPTED', total: 1000 },
        { _id: 'd2', project: 'P1', type: 'QUOTE', status: 'ACCEPTED', total: 400, currency: 'USD' },
      ],
      leadByProject: new Map([['P1', 'L1']]),
      proposals: [{ _id: 'p', leadId: 'L1', status: 'SIGNED', lines }],
    })
    expect(signedByLeadFromEntries(entries).get('L1')).toBe(2200)
    expect(signedByLeadFromEntries(entries, 'USD').get('L1')).toBe(400)
  })
})

describe('valeur pondérée — définition unique', () => {
  it('= budget × probabilité du lead / 100, au centime', () => {
    expect(weightedValue({ status: 'DEMO', budget: 1000, probability: 40 })).toBe(400)
    expect(weightedValue({ status: 'DEMO', budget: 333.33, probability: 33 })).toBe(110)
  })

  it("retombe sur la probabilité de l'étape, puis sur 10", () => {
    expect(weightedValue({ status: 'PROPOSAL', budget: 1000, probability: null })).toBe(650)
    expect(weightedValue({ status: 'INCONNU', budget: 1000 })).toBe(100)
  })

  it('vaut 0 pour un lead fermé, archivé ou sans budget', () => {
    expect(weightedValue({ status: 'WON', budget: 1000, probability: 100 })).toBe(0)
    expect(weightedValue({ status: 'LOST', budget: 1000, probability: 0 })).toBe(0)
    expect(weightedValue({ status: 'DEMO', budget: 1000, probability: 50, archivedAt: new Date() })).toBe(0)
    expect(weightedValue({ status: 'DEMO', budget: null, probability: 50 })).toBe(0)
    expect(weightedValue({ status: 'DEMO', budget: -5, probability: 50 })).toBe(0)
  })

  it('borne la probabilité à 0–100', () => {
    expect(leadProbability({ status: 'DEMO', probability: 250 })).toBe(100)
    expect(leadProbability({ status: 'DEMO', probability: -3 })).toBe(0)
  })

  it('classe en engagé ≥ 70, probable 40–69, pipeline < 40', () => {
    expect(forecastCategory(100)).toBe('committed')
    expect(forecastCategory(70)).toBe('committed')
    expect(forecastCategory(69)).toBe('probable')
    expect(forecastCategory(40)).toBe('probable')
    expect(forecastCategory(39)).toBe('pipeline')
    expect(forecastCategory(0)).toBe('pipeline')
  })
})

describe('weightedPipeline', () => {
  /** Cohorte de 20 leads : 10 atteignent PROPOSAL, 5 signent. */
  function referenceFunnel() {
    const leads: PilotageLead[] = []
    const transitions = []
    for (let index = 0; index < 20; index += 1) {
      const id = 'c' + index
      const status = index < 5 ? 'WON' : index < 10 ? 'PROPOSAL' : 'LEAD'
      leads.push(lead(id, { status }))
      if (status !== 'LEAD') transitions.push({ leadId: id, from: 'LEAD', to: status, at: new Date('2026-01-05') })
    }
    return buildFunnel(leads, transitions)
  }

  it('pondère chaque lead par sa probabilité, comme le reste du CRM', () => {
    const pipeline = weightedPipeline(
      [lead('a', { status: 'PROPOSAL', budget: 10000, probability: 80 }), lead('b', { status: 'DEMO', budget: 1000 })],
      referenceFunnel(),
    )
    // 10 000 × 80 % + 1 000 × 50 % (défaut de l'étape DEMO)
    expect(pipeline.total).toBe(8500)
    expect(pipeline.currency).toBe('EUR')
    expect(pipeline.reliable).toBe(true)
  })

  it('ne dépend plus du taux observé, qui reste indicatif', () => {
    const pipeline = weightedPipeline([lead('a', { status: 'PROPOSAL', budget: 10000 })], referenceFunnel())
    const proposal = pipeline.stages.find((stage) => stage.stage === 'PROPOSAL')!
    expect(proposal.weighted).toBe(6500)
    expect(proposal.probability).toBeCloseTo(0.65)
    expect(proposal.observedRate).toBeCloseTo(0.5)
  })

  it('exclut les leads gagnés, perdus ou archivés', () => {
    const pipeline = weightedPipeline(
      [
        lead('a', { status: 'WON', budget: 10000 }),
        lead('b', { status: 'LOST', budget: 10000 }),
        lead('c', { status: 'PROPOSAL', budget: 10000, archivedAt: new Date() }),
      ],
      referenceFunnel(),
    )
    expect(pipeline.total).toBe(0)
  })

  it('compte à zéro un lead sans budget, et le signale', () => {
    const pipeline = weightedPipeline(
      [lead('a', { status: 'PROPOSAL', budget: null }), lead('b', { status: 'PROPOSAL', budget: 10000 })],
      referenceFunnel(),
    )
    expect(pipeline.withoutBudget).toBe(1)
    expect(pipeline.total).toBe(6500)
  })

  it('marque les taux observés non fiables sous le seuil de cohorte, sans taire le montant', () => {
    const small = buildFunnel(
      [lead('x', { status: 'WON' }), lead('y', { status: 'PROPOSAL' })],
      [
        { leadId: 'x', from: 'LEAD', to: 'WON', at: new Date('2026-01-02') },
        { leadId: 'y', from: 'LEAD', to: 'PROPOSAL', at: new Date('2026-01-02') },
      ],
    )
    const pipeline = weightedPipeline([lead('a', { status: 'PROPOSAL', budget: 1000 })], small)

    expect(pipeline.reliable).toBe(false)
    expect(pipeline.cohortSize).toBeLessThan(MIN_COHORT_FOR_PIPELINE)
    expect(pipeline.total).toBeGreaterThan(0)
  })

  it("ne divise pas par zéro quand aucune affaire n'a jamais été gagnée", () => {
    const funnel = buildFunnel(
      Array.from({ length: 25 }, (_, index) => lead('c' + index, { status: 'PROPOSAL' })),
      [],
    )
    const pipeline = weightedPipeline([lead('a', { status: 'PROPOSAL', budget: 10000 })], funnel)

    expect(Number.isNaN(pipeline.total)).toBe(false)
    expect(pipeline.stages.every((stage) => Number.isFinite(stage.observedRate))).toBe(true)
  })
})

describe('buildForecast', () => {
  const opts = { from: '2026-11', months: 3 }

  it('regroupe les leads ouverts par mois de clôture prévue, brut et pondéré', () => {
    const forecast = buildForecast(
      [
        { status: 'DEMO', budget: 1000, probability: 50, expectedCloseAt: '2026-11-10T10:00:00Z' },
        { status: 'PROPOSAL', budget: 2000, probability: 80, expectedCloseAt: '2026-11-20T10:00:00Z' },
        { status: 'LEAD', budget: 500, probability: 10, expectedCloseAt: '2027-01-05T10:00:00Z' },
      ],
      opts,
    )
    const [nov, dec, jan] = forecast.months
    expect(nov).toMatchObject({ month: '2026-11', openCount: 2, gross: 3000, weighted: 2100 })
    expect(dec).toMatchObject({ month: '2026-12', openCount: 0, gross: 0, weighted: 0 })
    expect(jan).toMatchObject({ month: '2027-01', openCount: 1, gross: 500, weighted: 50 })
    expect(forecast.totals).toMatchObject({ openCount: 3, gross: 3500, weighted: 2150 })
    expect(forecast.currency).toBe('EUR')
  })

  it('ventile par catégorie : engagé ≥ 70, probable 40–69, pipeline < 40', () => {
    const forecast = buildForecast(
      [
        { status: 'PROPOSAL', budget: 1000, probability: 70, expectedCloseAt: '2026-11-10T10:00:00Z' },
        { status: 'DEMO', budget: 1000, probability: 69, expectedCloseAt: '2026-11-10T10:00:00Z' },
        { status: 'DEMO', budget: 1000, probability: 40, expectedCloseAt: '2026-11-10T10:00:00Z' },
        { status: 'LEAD', budget: 1000, probability: 39, expectedCloseAt: '2026-11-10T10:00:00Z' },
      ],
      opts,
    )
    const categories = forecast.months[0]!.categories
    expect(categories.committed).toEqual({ count: 1, gross: 1000, weighted: 700 })
    expect(categories.probable).toEqual({ count: 2, gross: 2000, weighted: 1090 })
    expect(categories.pipeline).toEqual({ count: 1, gross: 1000, weighted: 390 })
  })

  it("classe les dates dans le mois de Paris, pas le mois UTC", () => {
    const forecast = buildForecast(
      [
        // 30 nov. 23:30 UTC = 1er déc. 00:30 à Paris (UTC+1)
        { status: 'DEMO', budget: 1000, probability: 50, expectedCloseAt: '2026-11-30T23:30:00Z' },
        // 31 oct. 23:30 UTC = 1er nov. 00:30 à Paris (UTC+1) : déjà novembre
        { status: 'DEMO', budget: 400, probability: 50, expectedCloseAt: '2026-10-31T23:30:00Z' },
        // 31 oct. 22:30 UTC = 31 oct. 23:30 à Paris : encore octobre, donc avant la fenêtre
        { status: 'DEMO', budget: 200, probability: 50, expectedCloseAt: '2026-10-31T22:30:00Z' },
      ],
      opts,
    )
    expect(forecast.months[0]).toMatchObject({ month: '2026-11', openCount: 1, weighted: 200 })
    expect(forecast.months[1]).toMatchObject({ month: '2026-12', openCount: 1, weighted: 500 })
    expect(forecast.overdue.count).toBe(1)
  })

  it('exclut les leads fermés ou archivés des mois, et rend à part retard et sans date', () => {
    const forecast = buildForecast(
      [
        { status: 'LOST', budget: 1000, expectedCloseAt: '2026-11-10T10:00:00Z' },
        { status: 'DEMO', budget: 1000, probability: 50, expectedCloseAt: '2026-11-10T10:00:00Z', archivedAt: new Date() },
        { status: 'DEMO', budget: 800, probability: 50, expectedCloseAt: '2026-09-10T10:00:00Z' },
        { status: 'DEMO', budget: 600, probability: 50, expectedCloseAt: null },
        { status: 'DEMO', budget: 100, probability: 50, expectedCloseAt: '2028-01-01T10:00:00Z' },
      ],
      opts,
    )
    expect(forecast.totals.openCount).toBe(0)
    expect(forecast.overdue).toEqual({ count: 1, gross: 800, weighted: 400 })
    expect(forecast.unscheduled).toEqual({ count: 1, gross: 600, weighted: 300 })
  })

  it("mesure le réalisé par statusChangedAt (mois de Paris), pas par clôture prévue", () => {
    const forecast = buildForecast(
      [
        { status: 'WON', budget: 5000, probability: 100, expectedCloseAt: '2026-12-01T10:00:00Z', statusChangedAt: '2026-11-15T10:00:00Z' },
        { status: 'WON', budget: 700, statusChangedAt: '2026-11-30T23:30:00Z' },
        { status: 'WON', budget: 900, statusChangedAt: null },
      ],
      opts,
    )
    expect(forecast.months[0]).toMatchObject({ wonCount: 1, wonAmount: 5000 })
    expect(forecast.months[1]).toMatchObject({ wonCount: 1, wonAmount: 700 })
    expect(forecast.totals).toMatchObject({ wonCount: 2, wonAmount: 5700, openCount: 0 })
  })

  it("rattache l'objectif du périmètre exact et mesure l'avancement", () => {
    const goals = [
      { _id: 'g1', period: '2026-11', entity: null, userId: null, amountTarget: 10000, wonCountTarget: 4 },
      { _id: 'g2', period: '2026-11', entity: 'ARROW', userId: null, amountTarget: 2000, wonCountTarget: 0 },
    ]
    const leads = [
      { status: 'WON', budget: 2500, statusChangedAt: '2026-11-03T10:00:00Z' },
      { status: 'DEMO', budget: 1000, probability: 50, expectedCloseAt: '2026-11-20T10:00:00Z' },
    ]
    const group = buildForecast(leads, { ...opts, goals }).months[0]!.goal!
    expect(group).toMatchObject({ _id: 'g1', amountTarget: 10000, amountProgress: 0.25, countProgress: 0.25 })
    expect(group.projectedAmount).toBe(3000)
    expect(group.projectedProgress).toBe(0.3)

    const arrow = buildForecast(leads, { ...opts, goals, scope: { entity: 'ARROW' } }).months[0]!.goal!
    expect(arrow).toMatchObject({ _id: 'g2', amountProgress: 1.25, countProgress: null })

    expect(buildForecast(leads, { ...opts, goals, scope: { userId: 'u1' } }).months[0]!.goal).toBeNull()
    expect(buildForecast(leads, { ...opts, goals }).months[1]!.goal).toBeNull()
  })

  it('calcule les mois à travers un changement d\'année', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(monthRange('2026-12', 3)).toEqual(['2026-12', '2027-01', '2027-02'])
    expect(parisMonth(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01')
  })
})
