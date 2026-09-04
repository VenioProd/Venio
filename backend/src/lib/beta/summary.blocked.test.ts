import { describe, expect, it } from 'vitest'
import { computeScenarioSummary, type SummaryRun } from './summary.js'

const run = (over: Partial<SummaryRun> = {}): SummaryRun => ({ verdict: 'WORKS', status: 'OPEN', ...over })

describe('demarche que personne n a pu tester', () => {
  it('ne fait pas passer une demarche bloquee pour un echec du produit', () => {
    expect(computeScenarioSummary([run({ verdict: 'BLOCKED' })])).toBe('BLOCKED')
  })

  it('fait primer une panne constatee sur un blocage', () => {
    expect(computeScenarioSummary([run({ verdict: 'BLOCKED' }), run({ verdict: 'BROKEN' })])).toBe('KO')
  })

  // La règle : un blocage ne dit rien du produit, seulement qu'un testeur n'a
  // pas pu aller au bout. Dès qu'un autre rend un verdict sur le fond — même
  // mitigé — la question est tranchée et le blocage devient un problème d'accès
  // individuel, pas un état de la recette.
  it('s efface aussi devant un verdict mitige, qui prouve que la demarche est faisable', () => {
    expect(computeScenarioSummary([run({ verdict: 'BLOCKED' }), run({ verdict: 'TO_OPTIMIZE' })])).toBe('TO_OPTIMIZE')
  })

  it('tient tant que tous les testeurs restent bloques', () => {
    expect(computeScenarioSummary([run({ verdict: 'BLOCKED' }), run({ verdict: 'BLOCKED' })])).toBe('BLOCKED')
  })

  it('s efface des qu un autre testeur a reussi a derouler la demarche', () => {
    expect(computeScenarioSummary([run({ verdict: 'BLOCKED' }), run({ verdict: 'WORKS' })])).toBe('OK')
  })

  it('ignore un blocage classe sans suite', () => {
    expect(computeScenarioSummary([run({ verdict: 'BLOCKED', status: 'REJECTED' })])).toBe('NOT_TESTED')
  })
})
