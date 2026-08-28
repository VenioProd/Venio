import { describe, it, expect } from 'vitest'
import { MIN_COHORT_FOR_PIPELINE, summariseRevenue, weightedPipeline, type RevenueDocument } from '../lib/crmRevenue.js'
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

describe('weightedPipeline', () => {
  /** Cohorte de 20 leads : 10 atteignent PROPOSAL, 5 signent. */
  function referenceFunnel() {
    const leads: PilotageLead[] = []
    const transitions = []
    for (let index = 0; index < 20; index += 1) {
      const id = `c${index}`
      const status = index < 5 ? 'WON' : index < 10 ? 'PROPOSAL' : 'LEAD'
      leads.push(lead(id, { status }))
      if (status !== 'LEAD') transitions.push({ leadId: id, from: 'LEAD', to: status, at: new Date('2026-01-05') })
    }
    return buildFunnel(leads, transitions)
  }

  it('pondère chaque lead actif par le taux observé depuis son étape', () => {
    const funnel = referenceFunnel()
    // 5 WON sur 10 arrivés en PROPOSAL : un lead en proposition vaut la moitié.
    const pipeline = weightedPipeline([lead('a', { status: 'PROPOSAL', budget: 10000 })], funnel)

    expect(pipeline.total).toBeCloseTo(5000)
    expect(pipeline.reliable).toBe(true)
  })

  it('exclut les leads déjà gagnés ou perdus', () => {
    const pipeline = weightedPipeline(
      [lead('a', { status: 'WON', budget: 10000 }), lead('b', { status: 'LOST', budget: 10000 })],
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
    expect(pipeline.total).toBeCloseTo(5000)
  })

  it('marque la projection non fiable sous le seuil de cohorte', () => {
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
    // Le montant reste calculé : le taire suggérerait un pipeline vide.
    expect(pipeline.total).toBeGreaterThan(0)
  })

  it("ne divise pas par zéro quand aucune affaire n'a jamais été gagnée", () => {
    const funnel = buildFunnel(
      Array.from({ length: 25 }, (_, index) => lead(`c${index}`, { status: 'PROPOSAL' })),
      [],
    )
    const pipeline = weightedPipeline([lead('a', { status: 'PROPOSAL', budget: 10000 })], funnel)

    expect(pipeline.total).toBe(0)
    expect(Number.isNaN(pipeline.total)).toBe(false)
  })

  it('détaille la valeur par étape', () => {
    const pipeline = weightedPipeline(
      [lead('a', { status: 'PROPOSAL', budget: 10000 }), lead('b', { status: 'LEAD', budget: 20000 })],
      referenceFunnel(),
    )
    const proposal = pipeline.stages.find((stage) => stage.stage === 'PROPOSAL')!
    expect(proposal.count).toBe(1)
    expect(proposal.weighted).toBeCloseTo(5000)

    // 5 WON sur 20 entrés : un lead au tout début vaut le quart de son budget.
    const first = pipeline.stages.find((stage) => stage.stage === 'LEAD')!
    expect(first.weighted).toBeCloseTo(5000)
  })
})
