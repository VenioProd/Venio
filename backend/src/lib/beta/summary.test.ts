import { describe, expect, it } from 'vitest'
import { computeCoverage, computeScenarioSummary, type SummaryRun } from './summary.js'

const run = (over: Partial<SummaryRun> = {}): SummaryRun => ({
  verdict: 'WORKS',
  status: 'OPEN',
  ...over,
})

describe('computeScenarioSummary', () => {
  it('reste non testee tant que personne n a rendu de verdict', () => {
    expect(computeScenarioSummary([])).toBe('NOT_TESTED')
  })

  it('passe au vert quand tous les verdicts sont favorables', () => {
    expect(computeScenarioSummary([run(), run()])).toBe('OK')
  })

  it('passe au rouge des qu un seul testeur signale une panne', () => {
    expect(computeScenarioSummary([run(), run({ verdict: 'BROKEN' })])).toBe('KO')
  })

  it('signale une optimisation quand rien n est casse', () => {
    expect(computeScenarioSummary([run(), run({ verdict: 'TO_OPTIMIZE' })])).toBe('TO_OPTIMIZE')
  })

  it('fait primer la panne sur l optimisation', () => {
    expect(computeScenarioSummary([run({ verdict: 'TO_OPTIMIZE' }), run({ verdict: 'BROKEN' })])).toBe('KO')
  })

  it('demande une revalidation quand une panne a ete corrigee', () => {
    expect(computeScenarioSummary([run({ verdict: 'BROKEN', status: 'FIXED' })])).toBe('TO_RETEST')
  })

  it('fait primer une panne encore ouverte sur une revalidation en attente', () => {
    expect(computeScenarioSummary([run({ verdict: 'BROKEN', status: 'FIXED' }), run({ verdict: 'BROKEN' })])).toBe('KO')
  })

  it('fait primer la revalidation sur une simple optimisation', () => {
    expect(computeScenarioSummary([run({ verdict: 'BROKEN', status: 'FIXED' }), run({ verdict: 'TO_OPTIMIZE' })])).toBe(
      'TO_RETEST',
    )
  })

  it('considere un probleme reconnu mais non corrige comme toujours ouvert', () => {
    expect(computeScenarioSummary([run({ verdict: 'BROKEN', status: 'ACKNOWLEDGED' })])).toBe('KO')
  })

  it('ignore un retour classe sans suite', () => {
    expect(computeScenarioSummary([run(), run({ verdict: 'BROKEN', status: 'REJECTED' })])).toBe('OK')
  })

  it('ne se contente pas de rejets pour declarer une demarche valide', () => {
    expect(computeScenarioSummary([run({ verdict: 'BROKEN', status: 'REJECTED' })])).toBe('NOT_TESTED')
  })
})

describe('computeCoverage', () => {
  const s1 = 's1'
  const s2 = 's2'
  const lea = 'lea'
  const max = 'max'

  it('montre les cases vides quand personne n a teste', () => {
    const coverage = computeCoverage({ scenarioIds: [s1, s2], testerIds: [lea], runs: [] })
    expect(coverage.cells[s1]![lea]).toBeNull()
    expect(coverage.testedCount).toBe(0)
    expect(coverage.expectedCount).toBe(2)
  })

  it('place chaque verdict a l intersection du testeur et de la demarche', () => {
    const coverage = computeCoverage({
      scenarioIds: [s1, s2],
      testerIds: [lea, max],
      runs: [
        { scenarioId: s1, testerId: lea, verdict: 'WORKS' },
        { scenarioId: s1, testerId: max, verdict: 'BROKEN' },
      ],
    })
    expect(coverage.cells[s1]![lea]).toBe('WORKS')
    expect(coverage.cells[s1]![max]).toBe('BROKEN')
    expect(coverage.cells[s2]![lea]).toBeNull()
    expect(coverage.testedCount).toBe(2)
    expect(coverage.expectedCount).toBe(4)
  })

  it('signale les demarches ou les testeurs ne sont pas d accord', () => {
    const coverage = computeCoverage({
      scenarioIds: [s1, s2],
      testerIds: [lea, max],
      runs: [
        { scenarioId: s1, testerId: lea, verdict: 'WORKS' },
        { scenarioId: s1, testerId: max, verdict: 'BROKEN' },
        { scenarioId: s2, testerId: lea, verdict: 'WORKS' },
        { scenarioId: s2, testerId: max, verdict: 'WORKS' },
      ],
    })
    expect(coverage.disputedScenarioIds).toEqual([s1])
  })

  it('liste les testeurs qui n ont rien rendu', () => {
    const coverage = computeCoverage({
      scenarioIds: [s1],
      testerIds: [lea, max],
      runs: [{ scenarioId: s1, testerId: lea, verdict: 'WORKS' }],
    })
    expect(coverage.silentTesterIds).toEqual([max])
  })

  it('ignore un verdict portant sur une demarche archivee', () => {
    const coverage = computeCoverage({
      scenarioIds: [s1],
      testerIds: [lea],
      runs: [
        { scenarioId: s1, testerId: lea, verdict: 'WORKS' },
        { scenarioId: 'supprimee', testerId: lea, verdict: 'BROKEN' },
      ],
    })
    expect(coverage.testedCount).toBe(1)
    expect(coverage.cells.supprimee).toBeUndefined()
  })
})
