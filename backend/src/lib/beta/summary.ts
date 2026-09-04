import type { BetaScenarioStatus } from '../../models/BetaScenario.js'
import type { BetaRunStatus, BetaVerdict } from '../../models/BetaRun.js'

export interface SummaryRun {
  verdict: BetaVerdict
  status: BetaRunStatus
}

/**
 * Statut affiché d'une démarche, dérivé des verdicts individuels.
 *
 * L'ordre de priorité répond à « qu'est-ce qui demande une action ? » :
 * une panne ouverte d'abord, puis une correction à revalider — parce qu'un
 * statut qu'on sait périmé est plus trompeur qu'un point d'optimisation connu.
 * Un retour classé sans suite ne pèse rien.
 */
export function computeScenarioSummary(runs: SummaryRun[]): BetaScenarioStatus {
  const meaningful = runs.filter((run) => run.status !== 'REJECTED')
  if (meaningful.length === 0) return 'NOT_TESTED'

  const isOpen = (run: SummaryRun) => run.status === 'OPEN' || run.status === 'ACKNOWLEDGED'

  if (meaningful.some((run) => run.verdict === 'BROKEN' && isOpen(run))) return 'KO'
  if (meaningful.some((run) => run.status === 'FIXED')) return 'TO_RETEST'

  // Un blocage ne vaut que tant que personne n'a réussi à passer : dès qu'un
  // testeur déroule la démarche, la question est tranchée.
  const someoneGotThrough = meaningful.some((run) => run.verdict !== 'BLOCKED')
  if (!someoneGotThrough && meaningful.some((run) => run.verdict === 'BLOCKED' && isOpen(run))) {
    return 'BLOCKED'
  }

  if (meaningful.some((run) => run.verdict === 'TO_OPTIMIZE' && isOpen(run))) return 'TO_OPTIMIZE'
  if (meaningful.every((run) => run.verdict === 'BLOCKED')) return 'BLOCKED'
  return 'OK'
}

export interface CoverageRun {
  scenarioId: string
  testerId: string
  verdict: BetaVerdict
}

export interface CoverageInput {
  scenarioIds: string[]
  testerIds: string[]
  runs: CoverageRun[]
}

export interface Coverage {
  /** cells[scenarioId][testerId] : le verdict rendu, ou null si rien encore. */
  cells: Record<string, Record<string, BetaVerdict | null>>
  testedCount: number
  expectedCount: number
  disputedScenarioIds: string[]
  silentTesterIds: string[]
}

/** Grille testeurs × démarches : ce qui manque et ce qui diverge. */
export function computeCoverage({ scenarioIds, testerIds, runs }: CoverageInput): Coverage {
  const cells: Record<string, Record<string, BetaVerdict | null>> = {}
  for (const scenarioId of scenarioIds) {
    cells[scenarioId] = Object.fromEntries(testerIds.map((testerId) => [testerId, null]))
  }

  const known = new Set(scenarioIds)
  const knownTesters = new Set(testerIds)
  let testedCount = 0
  const active = new Set<string>()

  for (const run of runs) {
    // Un verdict peut survivre à l'archivage de sa démarche ou au retrait d'un
    // testeur : il ne doit alors plus peser sur la grille.
    if (!known.has(run.scenarioId) || !knownTesters.has(run.testerId)) continue
    cells[run.scenarioId]![run.testerId] = run.verdict
    testedCount += 1
    active.add(run.testerId)
  }

  const disputedScenarioIds = scenarioIds.filter((scenarioId) => {
    const verdicts = Object.values(cells[scenarioId]!).filter((v): v is BetaVerdict => v !== null)
    return new Set(verdicts).size > 1
  })

  return {
    cells,
    testedCount,
    expectedCount: scenarioIds.length * testerIds.length,
    disputedScenarioIds,
    silentTesterIds: testerIds.filter((testerId) => !active.has(testerId)),
  }
}
