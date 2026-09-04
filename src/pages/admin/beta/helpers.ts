import type {
  BetaCoverage,
  BetaRun,
  BetaRunStatus,
  BetaScenario,
  BetaScenarioStatus,
  BetaSeverity,
  BetaVerdict,
} from '../../../services/beta'

export type Tone = 'ok' | 'warn' | 'fail' | 'retest' | 'neutral'

export const SCENARIO_STATUS_LABEL: Record<BetaScenarioStatus, string> = {
  NOT_TESTED: 'Non testée',
  OK: 'Fonctionne',
  KO: 'Ne fonctionne pas',
  TO_OPTIMIZE: 'À optimiser',
  TO_RETEST: 'À revalider',
}

export const VERDICT_LABEL: Record<BetaVerdict, string> = {
  WORKS: 'Fonctionne',
  BROKEN: 'Ne fonctionne pas',
  TO_OPTIMIZE: 'À optimiser',
}

export const SEVERITY_LABEL: Record<BetaSeverity, string> = {
  BLOCKER: 'Bloquant',
  MAJOR: 'Majeur',
  MINOR: 'Mineur',
  COSMETIC: 'Cosmétique',
}

export const REPRODUCIBILITY_LABEL: Record<string, string> = {
  ALWAYS: 'Systématique',
  SOMETIMES: 'Aléatoire',
  ONCE: 'Vu une fois',
}

export const RUN_STATUS_LABEL: Record<BetaRunStatus, string> = {
  OPEN: 'À traiter',
  ACKNOWLEDGED: 'Pris en compte',
  FIXED: 'Corrigé',
  REJECTED: 'Sans suite',
}

const SCENARIO_TONES: Record<BetaScenarioStatus, Tone> = {
  OK: 'ok',
  KO: 'fail',
  TO_OPTIMIZE: 'warn',
  TO_RETEST: 'retest',
  NOT_TESTED: 'neutral',
}

export function scenarioTone(status: BetaScenarioStatus): Tone {
  return SCENARIO_TONES[status]
}

export function verdictTone(verdict: BetaVerdict): Tone {
  if (verdict === 'WORKS') return 'ok'
  if (verdict === 'BROKEN') return 'fail'
  return 'warn'
}

/**
 * Ordre de lecture de la liste des démarches : ce qui réclame une action
 * remonte. Une démarche jamais testée passe devant une démarche validée —
 * l'absence de verdict est une information, pas un succès.
 */
const ATTENTION_ORDER: Record<BetaScenarioStatus, number> = {
  KO: 0,
  TO_RETEST: 1,
  TO_OPTIMIZE: 2,
  NOT_TESTED: 3,
  OK: 4,
}

export function sortScenariosByAttention(scenarios: BetaScenario[]): BetaScenario[] {
  return [...scenarios].sort((a, b) => {
    const byAttention = ATTENTION_ORDER[a.summaryStatus] - ATTENTION_ORDER[b.summaryStatus]
    if (byAttention !== 0) return byAttention
    return a.rank - b.rank || a.number - b.number
  })
}

export function coverageRatio(coverage: BetaCoverage): number {
  if (coverage.expectedCount === 0) return 0
  return Math.round((coverage.testedCount / coverage.expectedCount) * 100)
}

/** Une ligne courte sur l'appareil du testeur, à afficher sous son retour. */
export function describeContext(run: Pick<BetaRun, 'context'>): string {
  const context = run.context
  if (!context) return ''

  const parts: string[] = []
  if (context.isMobile != null) parts.push(context.isMobile ? 'Mobile' : 'Ordinateur')
  if (context.viewportWidth && context.viewportHeight) {
    parts.push(`${context.viewportWidth}×${context.viewportHeight}`)
  }
  return parts.join(' · ')
}

export function formatRelative(date: string | null | undefined): string {
  if (!date) return ''
  const value = new Date(date)
  const diff = Date.now() - value.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "à l'instant"
  if (diff < hour) return `il y a ${Math.floor(diff / minute)} min`
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`
  return value.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}
