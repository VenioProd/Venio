import { describe, it, expect } from 'vitest'
import {
  FUNNEL_STAGES,
  assessCoverage,
  buildFunnel,
  buildLossBreakdown,
  computeVelocity,
  groupPerformance,
  type PilotageLead,
  type StatusTransition,
} from '../lib/crmPilotage.js'

const DAY = 24 * 60 * 60 * 1000
const T0 = new Date('2026-01-01T09:00:00Z')

function at(days: number): Date {
  return new Date(T0.getTime() + days * DAY)
}

function lead(id: string, overrides: Partial<PilotageLead> = {}): PilotageLead {
  return { _id: id, status: 'LEAD', createdAt: T0, ...overrides }
}

function move(leadId: string, from: string, to: string, days: number): StatusTransition {
  return { leadId, from, to, at: at(days) }
}

describe('buildFunnel', () => {
  it("compte un lead à toutes les étapes qu'il a atteintes ou dépassées", () => {
    const funnel = buildFunnel(
      [lead('a', { status: 'PROPOSAL' })],
      [move('a', 'LEAD', 'QUALIFIED', 1), move('a', 'QUALIFIED', 'DEMO', 3), move('a', 'DEMO', 'PROPOSAL', 5)],
    )
    const counts = Object.fromEntries(funnel.stages.map((stage) => [stage.stage, stage.count]))

    // CONTACTED a été sauté, mais le lead l'a dépassé : un entonnoir se lit en
    // « arrivé au moins jusque-là », sinon il devient non monotone.
    expect(counts.LEAD).toBe(1)
    expect(counts.QUALIFIED).toBe(1)
    expect(counts.CONTACTED).toBe(1)
    expect(counts.DEMO).toBe(1)
    expect(counts.PROPOSAL).toBe(1)
    expect(counts.WON).toBe(0)
  })

  it('reste monotone décroissant', () => {
    const funnel = buildFunnel(
      [lead('a', { status: 'LEAD' }), lead('b', { status: 'DEMO' }), lead('c', { status: 'WON' })],
      [
        move('b', 'LEAD', 'QUALIFIED', 1),
        move('b', 'QUALIFIED', 'DEMO', 2),
        move('c', 'LEAD', 'QUALIFIED', 1),
        move('c', 'QUALIFIED', 'PROPOSAL', 2),
        move('c', 'PROPOSAL', 'WON', 4),
      ],
    )
    const counts = funnel.stages.map((stage) => stage.count)
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]!)
    }
    expect(counts[0]).toBe(3)
  })

  it("retient la progression maximale d'un lead revenu en arrière", () => {
    const funnel = buildFunnel(
      [lead('a', { status: 'CONTACTED' })],
      [move('a', 'LEAD', 'DEMO', 2), move('a', 'DEMO', 'CONTACTED', 4)],
    )
    const counts = Object.fromEntries(funnel.stages.map((stage) => [stage.stage, stage.count]))
    expect(counts.DEMO).toBe(1)
  })

  it("ne compte pas un lead perdu au-delà de l'étape où il est sorti", () => {
    const funnel = buildFunnel(
      [lead('a', { status: 'LOST' })],
      [move('a', 'LEAD', 'DEMO', 2), move('a', 'DEMO', 'LOST', 5)],
    )
    const counts = Object.fromEntries(funnel.stages.map((stage) => [stage.stage, stage.count]))
    expect(counts.DEMO).toBe(1)
    expect(counts.PROPOSAL).toBe(0)
    expect(counts.WON).toBe(0)
  })

  it('situe un lead sans transition à son statut courant', () => {
    const funnel = buildFunnel([lead('a', { status: 'PROPOSAL' })], [])
    const counts = Object.fromEntries(funnel.stages.map((stage) => [stage.stage, stage.count]))
    expect(counts.PROPOSAL).toBe(1)
  })

  it("calcule le taux de passage d'une étape à la suivante", () => {
    const funnel = buildFunnel(
      [lead('a', { status: 'QUALIFIED' }), lead('b', { status: 'QUALIFIED' }), lead('c', { status: 'LEAD' })],
      [move('a', 'LEAD', 'QUALIFIED', 1), move('b', 'LEAD', 'QUALIFIED', 1)],
    )
    const qualified = funnel.stages.find((stage) => stage.stage === 'QUALIFIED')!
    expect(qualified.count).toBe(2)
    // 2 des 3 leads ont atteint QUALIFIED
    expect(qualified.rateFromPrevious).toBeCloseTo(2 / 3)
  })

  it('rend un entonnoir vide sans diviser par zéro', () => {
    const funnel = buildFunnel([], [])
    expect(funnel.stages).toHaveLength(FUNNEL_STAGES.length)
    expect(funnel.stages.every((stage) => stage.count === 0)).toBe(true)
    expect(funnel.stages.every((stage) => stage.rateFromPrevious === null)).toBe(true)
  })
})

describe('computeVelocity', () => {
  it('mesure la durée passée dans une étape entre deux transitions', () => {
    const velocity = computeVelocity(
      [lead('a', { status: 'DEMO' })],
      [move('a', 'LEAD', 'QUALIFIED', 2), move('a', 'QUALIFIED', 'DEMO', 6)],
    )
    const qualified = velocity.stages.find((stage) => stage.stage === 'QUALIFIED')!
    expect(qualified.medianDays).toBe(4)
    expect(qualified.samples).toBe(1)
  })

  it("exclut une étape jamais quittée : sa durée n'est pas encore connue", () => {
    const velocity = computeVelocity([lead('a', { status: 'DEMO' })], [move('a', 'LEAD', 'DEMO', 3)])
    const demo = velocity.stages.find((stage) => stage.stage === 'DEMO')!
    expect(demo.samples).toBe(0)
    expect(demo.medianDays).toBeNull()
  })

  it('résiste à une valeur aberrante là où une moyenne dérive', () => {
    const leads = [lead('a'), lead('b'), lead('c')]
    const transitions = [
      move('a', 'LEAD', 'QUALIFIED', 1),
      move('a', 'QUALIFIED', 'DEMO', 3),
      move('b', 'LEAD', 'QUALIFIED', 1),
      move('b', 'QUALIFIED', 'DEMO', 4),
      move('c', 'LEAD', 'QUALIFIED', 1),
      move('c', 'QUALIFIED', 'DEMO', 601), // lead oublié pendant 20 mois
    ]
    const qualified = computeVelocity(leads, transitions).stages.find((s) => s.stage === 'QUALIFIED')!

    expect(qualified.medianDays).toBe(3)
    expect(qualified.averageDays).toBeGreaterThan(100)
  })

  it('mesure le cycle complet de la création à la signature', () => {
    const velocity = computeVelocity(
      [lead('a', { status: 'WON' })],
      [move('a', 'LEAD', 'PROPOSAL', 5), move('a', 'PROPOSAL', 'WON', 12)],
    )
    expect(velocity.cycle.medianDays).toBe(12)
    expect(velocity.cycle.samples).toBe(1)
  })

  it('ignore les leads jamais gagnés dans le cycle', () => {
    const velocity = computeVelocity([lead('a', { status: 'LOST' })], [move('a', 'LEAD', 'LOST', 4)])
    expect(velocity.cycle.samples).toBe(0)
    expect(velocity.cycle.medianDays).toBeNull()
  })

  it('prend la médiane basse sur un nombre pair de mesures', () => {
    const leads = [lead('a'), lead('b')]
    const velocity = computeVelocity(leads, [move('a', 'LEAD', 'WON', 2), move('b', 'LEAD', 'WON', 6)])
    expect(velocity.cycle.medianDays).toBe(4)
  })
})

describe('buildLossBreakdown', () => {
  it('regroupe les pertes par motif et calcule leur part', () => {
    const breakdown = buildLossBreakdown(
      [
        lead('a', { status: 'LOST', lostReason: 'Prix' }),
        lead('b', { status: 'LOST', lostReason: 'Prix' }),
        lead('c', { status: 'LOST', lostReason: 'Délai' }),
      ],
      [],
    )
    expect(breakdown.total).toBe(3)
    const prix = breakdown.byReason.find((entry) => entry.reason === 'Prix')!
    expect(prix.count).toBe(2)
    expect(prix.share).toBeCloseTo(2 / 3)
  })

  it('regroupe les motifs absents sous « non renseigné » plutôt que de les taire', () => {
    const breakdown = buildLossBreakdown([lead('a', { status: 'LOST' })], [])
    expect(breakdown.byReason[0]!.reason).toBe('NON_RENSEIGNE')
    expect(breakdown.unspecified).toBe(1)
  })

  it("déduit l'étape de sortie de la transition vers LOST", () => {
    const breakdown = buildLossBreakdown(
      [lead('a', { status: 'LOST', lostReason: 'Prix' })],
      [move('a', 'LEAD', 'PROPOSAL', 3), move('a', 'PROPOSAL', 'LOST', 8)],
    )
    expect(breakdown.byStage.find((entry) => entry.stage === 'PROPOSAL')!.count).toBe(1)
  })

  it('ignore les leads qui ne sont pas perdus', () => {
    const breakdown = buildLossBreakdown([lead('a', { status: 'WON' })], [])
    expect(breakdown.total).toBe(0)
  })
})

describe('groupPerformance', () => {
  it('calcule le taux de réussite sur les affaires conclues, pas sur le total', () => {
    const rows = groupPerformance(
      [
        lead('a', { source: 'Ads', status: 'WON', budget: 1000 }),
        lead('b', { source: 'Ads', status: 'LOST' }),
        lead('c', { source: 'Ads', status: 'DEMO' }),
      ],
      'source',
    )
    const ads = rows.find((row) => row.key === 'Ads')!
    expect(ads.total).toBe(3)
    expect(ads.active).toBe(1)
    // 1 gagné sur 2 conclues : les affaires en cours ne pénalisent pas le taux.
    expect(ads.winRate).toBeCloseTo(0.5)
    expect(ads.wonBudget).toBe(1000)
  })

  it('rend un taux nul et non une division par zéro sans affaire conclue', () => {
    const rows = groupPerformance([lead('a', { source: 'Site', status: 'DEMO' })], 'source')
    expect(rows[0]!.winRate).toBeNull()
  })

  it('regroupe les valeurs absentes sous un libellé explicite', () => {
    const rows = groupPerformance([lead('a', { status: 'WON' })], 'source')
    expect(rows[0]!.key).toBe('NON_RENSEIGNE')
  })

  it('trie par volume décroissant', () => {
    const rows = groupPerformance(
      [lead('a', { source: 'Site' }), lead('b', { source: 'Ads' }), lead('c', { source: 'Ads' })],
      'source',
    )
    expect(rows.map((row) => row.key)).toEqual(['Ads', 'Site'])
  })

  it('ventile aussi par commercial', () => {
    const rows = groupPerformance(
      [lead('a', { assignedTo: 'u1', status: 'WON' }), lead('b', { assignedTo: 'u2' })],
      'assignedTo',
    )
    expect(rows).toHaveLength(2)
  })
})

describe('assessCoverage', () => {
  it('ne reproche rien à un lead neuf resté à la première étape', () => {
    const coverage = assessCoverage([lead('a', { status: 'LEAD' })], [])
    expect(coverage.withoutHistory).toBe(0)
    expect(coverage.ratio).toBe(1)
  })

  it("signale un lead avancé dont le parcours n'a pas été journalisé", () => {
    const coverage = assessCoverage([lead('a', { status: 'PROPOSAL' })], [])
    expect(coverage.withoutHistory).toBe(1)
    expect(coverage.withHistory).toBe(0)
    expect(coverage.ratio).toBe(0)
  })

  it('rend un ratio de 1 sur une cohorte vide plutôt que NaN', () => {
    expect(assessCoverage([], []).ratio).toBe(1)
  })
})
