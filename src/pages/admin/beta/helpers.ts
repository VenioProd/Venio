import type {
  BetaCoverage,
  BetaRun,
  BetaRunStatus,
  BetaScenario,
  BetaScenarioStatus,
  BetaSeverity,
  BetaVerdict,
} from '../../../services/beta'
import { translate, type MessageKey } from '../../../i18n'
import { formatDate } from '../../../i18n/format'

export type Tone = 'ok' | 'warn' | 'fail' | 'retest' | 'blocked' | 'neutral'

export const SCENARIO_STATUS_LABEL_KEY = {
  NOT_TESTED: 'beta.scenarios.statusNotTested',
  OK: 'beta.scenarios.statusOk',
  KO: 'beta.scenarios.statusKo',
  TO_OPTIMIZE: 'beta.scenarios.statusToOptimize',
  TO_RETEST: 'beta.scenarios.statusToRetest',
  BLOCKED: 'beta.scenarios.statusBlocked',
} as const satisfies Record<BetaScenarioStatus, MessageKey>

export const VERDICT_LABEL_KEY = {
  WORKS: 'beta.verdict.works',
  BROKEN: 'beta.verdict.broken',
  TO_OPTIMIZE: 'beta.verdict.toOptimize',
  BLOCKED: 'beta.verdict.blocked',
} as const satisfies Record<BetaVerdict, MessageKey>

export const SEVERITY_LABEL_KEY = {
  BLOCKER: 'beta.severity.blocker',
  MAJOR: 'beta.severity.major',
  MINOR: 'beta.severity.minor',
  COSMETIC: 'beta.severity.cosmetic',
} as const satisfies Record<BetaSeverity, MessageKey>

export const REPRODUCIBILITY_LABEL_KEY = {
  ALWAYS: 'beta.repro.always',
  SOMETIMES: 'beta.repro.sometimes',
  ONCE: 'beta.repro.once',
} as const satisfies Record<string, MessageKey>

export const RUN_STATUS_LABEL_KEY = {
  OPEN: 'beta.runStatus.open',
  ACKNOWLEDGED: 'beta.shared.acknowledged',
  FIXED: 'beta.runStatus.fixed',
  REJECTED: 'beta.runStatus.rejected',
} as const satisfies Record<BetaRunStatus, MessageKey>

const SCENARIO_TONES: Record<BetaScenarioStatus, Tone> = {
  OK: 'ok',
  KO: 'fail',
  TO_OPTIMIZE: 'warn',
  TO_RETEST: 'retest',
  NOT_TESTED: 'neutral',
  BLOCKED: 'blocked',
}

export function scenarioTone(status: BetaScenarioStatus): Tone {
  return SCENARIO_TONES[status]
}

export function verdictTone(verdict: BetaVerdict): Tone {
  if (verdict === 'WORKS') return 'ok'
  if (verdict === 'BROKEN') return 'fail'
  if (verdict === 'BLOCKED') return 'blocked'
  return 'warn'
}

/**
 * Ordre de lecture de la liste des démarches : ce qui réclame une action
 * remonte. Une démarche jamais testée passe devant une démarche validée —
 * l'absence de verdict est une information, pas un succès.
 */
const ATTENTION_ORDER: Record<BetaScenarioStatus, number> = {
  KO: 0,
  BLOCKED: 1,
  TO_RETEST: 2,
  TO_OPTIMIZE: 3,
  NOT_TESTED: 4,
  OK: 5,
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
  if (context.isMobile != null) parts.push(translate(context.isMobile ? 'beta.context.mobile' : 'beta.context.desktop'))
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
  if (diff < minute) return translate('beta.relative.now')
  if (diff < hour) return translate('beta.relative.minutes', { count: Math.floor(diff / minute) })
  if (diff < day) return translate('beta.relative.hours', { count: Math.floor(diff / hour) })
  if (diff < 7 * day) return translate('beta.relative.days', { count: Math.floor(diff / day) })
  return formatDate(value, { day: '2-digit', month: 'short' })
}
