import { describe, expect, it } from 'vitest'
import type { BetaCoverage, BetaRun, BetaScenario } from '../../../services/beta'
import { coverageRatio, describeContext, scenarioTone, sortScenariosByAttention, verdictTone } from './helpers'

const scenario = (over: Partial<BetaScenario> = {}): BetaScenario => ({
  _id: 's1',
  campaign: 'c1',
  number: 1,
  identifier: 'BETA-1',
  title: 'Demander un devis',
  description: '',
  steps: [],
  rank: 1,
  summaryStatus: 'NOT_TESTED',
  ...over,
})

describe('scenarioTone', () => {
  it('associe chaque etat a une intention visuelle distincte', () => {
    expect(scenarioTone('OK')).toBe('ok')
    expect(scenarioTone('KO')).toBe('fail')
    expect(scenarioTone('TO_OPTIMIZE')).toBe('warn')
    expect(scenarioTone('TO_RETEST')).toBe('retest')
    expect(scenarioTone('NOT_TESTED')).toBe('neutral')
  })
})

describe('verdictTone', () => {
  it('distingue le verdict favorable du reste', () => {
    expect(verdictTone('WORKS')).toBe('ok')
    expect(verdictTone('BROKEN')).toBe('fail')
    expect(verdictTone('TO_OPTIMIZE')).toBe('warn')
  })
})

describe('sortScenariosByAttention', () => {
  it('remonte ce qui demande une action avant ce qui va bien', () => {
    const sorted = sortScenariosByAttention([
      scenario({ _id: 'ok', summaryStatus: 'OK' }),
      scenario({ _id: 'vierge', summaryStatus: 'NOT_TESTED' }),
      scenario({ _id: 'casse', summaryStatus: 'KO' }),
      scenario({ _id: 'revalider', summaryStatus: 'TO_RETEST' }),
      scenario({ _id: 'optimiser', summaryStatus: 'TO_OPTIMIZE' }),
    ])
    expect(sorted.map((s) => s._id)).toEqual(['casse', 'revalider', 'optimiser', 'vierge', 'ok'])
  })

  it('garde l ordre de la campagne entre demarches de meme etat', () => {
    const sorted = sortScenariosByAttention([
      scenario({ _id: 'b', number: 2, rank: 2, summaryStatus: 'KO' }),
      scenario({ _id: 'a', number: 1, rank: 1, summaryStatus: 'KO' }),
    ])
    expect(sorted.map((s) => s._id)).toEqual(['a', 'b'])
  })

  it('ne modifie pas le tableau recu', () => {
    const input = [scenario({ _id: 'ok', summaryStatus: 'OK' }), scenario({ _id: 'casse', summaryStatus: 'KO' })]
    sortScenariosByAttention(input)
    expect(input.map((s) => s._id)).toEqual(['ok', 'casse'])
  })
})

describe('coverageRatio', () => {
  const coverage = (over: Partial<BetaCoverage> = {}): BetaCoverage => ({
    cells: {},
    testedCount: 0,
    expectedCount: 0,
    disputedScenarioIds: [],
    silentTesterIds: [],
    ...over,
  })

  it('exprime la couverture en pourcentage', () => {
    expect(coverageRatio(coverage({ testedCount: 3, expectedCount: 4 }))).toBe(75)
  })

  it('ne divise pas par zero quand rien n est attendu', () => {
    expect(coverageRatio(coverage())).toBe(0)
  })

  it('arrondit au point le plus proche', () => {
    expect(coverageRatio(coverage({ testedCount: 1, expectedCount: 3 }))).toBe(33)
  })
})

describe('describeContext', () => {
  const run = (context: BetaRun['context']): BetaRun => ({ context }) as BetaRun

  it('resume l appareil et l ecran en une ligne lisible', () => {
    expect(
      describeContext(run({ url: null, userAgent: null, viewportWidth: 390, viewportHeight: 844, isMobile: true })),
    ).toBe('Mobile · 390×844')
  })

  it('se contente de ce qui est connu', () => {
    expect(
      describeContext(run({ url: null, userAgent: null, viewportWidth: null, viewportHeight: null, isMobile: false })),
    ).toBe('Ordinateur')
    expect(describeContext(run(null))).toBe('')
  })
})
