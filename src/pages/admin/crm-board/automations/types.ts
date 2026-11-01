import { intlLocale, translate, type MessageKey } from '../../../../i18n'
import { formatDate, formatNumber } from '../../../../i18n/format'

export type RuleStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED'
export type RunStatus = 'OK' | 'ERR' | 'SKIP' | 'SIM' | 'PENDING' | 'RUNNING'

export const TRIGGER_TYPES = [
  'LEAD_CREATED',
  'STATUS_CHANGED',
  'LEAD_ASSIGNED',
  'LEAD_INACTIVE',
  'ACTION_OVERDUE',
  'SCORE_AT_LEAST',
  'INTERACTION_LOGGED',
] as const
export type TriggerType = (typeof TRIGGER_TYPES)[number]

export const ACTION_TYPES = [
  'CREATE_TASK',
  'NOTIFY',
  'ASSIGN',
  'SET_STATUS',
  'ADD_TAG',
  'SET_FIELD',
  'SEND_EMAIL',
  'CREATE_CLIENT',
  'CREATE_PROJECT',
  'ARCHIVE',
] as const
export type ActionType = (typeof ACTION_TYPES)[number]

export type ConditionField =
  | 'status'
  | 'project'
  | 'source'
  | 'budget'
  | 'probability'
  | 'leadTemperature'
  | 'score'
  | 'tags'
  | 'assignedTo'
  | 'externalRep'
  | 'daysSinceActivity'
  | 'daysInStage'
  | 'archived'
export type ConditionOperator = 'eq' | 'neq' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'empty' | 'notEmpty'

export interface RuleCondition {
  field: ConditionField
  operator: ConditionOperator
  value?: unknown
}
export interface RuleAction {
  type: ActionType
  params: Record<string, unknown>
}
export interface RuleLimits {
  perLead: 'ONCE' | 'DAYS' | 'NONE'
  days: number
  maxPerRun: number
}
export interface CrmRule {
  _id: string
  name: string
  description: string
  status: RuleStatus
  system: boolean
  trigger: { type: TriggerType; params: Record<string, unknown> }
  conditions: { op: 'AND' | 'OR'; items: RuleCondition[] }
  actions: RuleAction[]
  limits: RuleLimits
  requireApproval: boolean
  stats: { runs: number; ok: number; errors: number; lastRunAt: string | null }
  createdAt?: string
  updatedAt?: string
}

export interface RunStep {
  action: string
  status: 'OK' | 'ERR' | 'SKIP' | 'PENDING'
  message: string
  payload?: Record<string, unknown>
  at: string
}
export interface CrmRuleRun {
  _id: string
  rule: string
  ruleName: string
  lead: string
  leadLabel: string
  trigger: string
  status: RunStatus
  steps: RunStep[]
  durationMs: number
  createdAt: string
}
export interface RunsPage {
  items: CrmRuleRun[]
  page: number
  pageSize: number
  total: number
}
export interface SimulationResult {
  total: number
  leads: Array<{ id: string; company: string; status: string }>
}

/** Contenu éditable d'une règle (corps des POST / PATCH). */
export interface RuleDraft {
  name: string
  description: string
  trigger: CrmRule['trigger']
  conditions: CrmRule['conditions']
  actions: RuleAction[]
  limits: RuleLimits
  requireApproval: boolean
}

export const LEAD_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST']
/** Libellé d'un statut de lead dans la langue active (repli : le code brut). */
export const leadStatusLabel = (status: string): string => (LEAD_STATUSES.includes(status) ? translate(`crmAuto.status.${status}` as MessageKey) : status)

export const triggerLabel = (type: string): string => (TRIGGER_TYPES.includes(type as TriggerType) ? translate(`crmAuto.trigger.${type}` as MessageKey) : type)

export const actionLabel = (type: string): string => (ACTION_TYPES.includes(type as ActionType) ? translate(`crmAuto.action.${type}` as MessageKey) : type)

const CONDITION_FIELDS: ConditionField[] = ['status', 'project', 'source', 'budget', 'probability', 'leadTemperature', 'score', 'tags', 'assignedTo', 'externalRep', 'daysSinceActivity', 'daysInStage', 'archived']
export const CONDITION_FIELD_LIST = CONDITION_FIELDS
export const fieldLabel = (field: string): string => (CONDITION_FIELDS.includes(field as ConditionField) ? translate(`crmAuto.field.${field}` as MessageKey) : field)
export const NUMERIC_FIELDS: ConditionField[] = ['budget', 'probability', 'score', 'daysSinceActivity', 'daysInStage']

export const operatorLabel = (operator: string): string => translate(`crmAuto.op.${operator}` as MessageKey)
export const NUMERIC_OPERATORS: ConditionOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty']
export const TEXT_OPERATORS: ConditionOperator[] = ['eq', 'neq', 'in', 'nin', 'contains', 'empty', 'notEmpty']
export const BOOL_OPERATORS: ConditionOperator[] = ['eq', 'neq']

export const runStatusLabel = (status: string): string => translate(`crmAuto.run.${status}` as MessageKey)
export const RUN_STATUS_COLORS: Record<RunStatus, string> = {
  OK: 'var(--mint)',
  ERR: 'var(--rose)',
  SKIP: 'var(--dim)',
  SIM: 'var(--vio)',
  PENDING: 'var(--amber)',
  RUNNING: 'var(--sky)',
}
export const ruleStatusLabel = (status: RuleStatus): string => translate(`crmAuto.ruleStatus.${status}` as MessageKey)

export const DEFAULT_LIMITS: RuleLimits = { perLead: 'DAYS', days: 7, maxPerRun: 50 }

export function emptyDraft(): RuleDraft {
  return {
    name: '',
    description: '',
    trigger: { type: 'LEAD_INACTIVE', params: { days: 7, statuses: ['CONTACTED', 'DEMO', 'PROPOSAL'] } },
    conditions: { op: 'AND', items: [] },
    actions: [{ type: 'CREATE_TASK', params: { title: translate('crmAuto.default.taskTitle'), dueInDays: 1, assignTo: 'owner' } }],
    limits: { ...DEFAULT_LIMITS },
    requireApproval: true,
  }
}

export function draftFromRule(rule: CrmRule, asCopy = false): RuleDraft {
  return {
    name: asCopy ? translate('crmAuto.copyName', { name: rule.name }).slice(0, 120) : rule.name,
    description: rule.description ?? '',
    trigger: { type: rule.trigger.type, params: { ...(rule.trigger.params ?? {}) } },
    conditions: { op: rule.conditions?.op ?? 'AND', items: (rule.conditions?.items ?? []).map((c) => ({ ...c })) },
    actions: (rule.actions ?? []).map((a) => ({ type: a.type, params: { ...(a.params ?? {}) } })),
    limits: { ...DEFAULT_LIMITS, ...(rule.limits ?? {}) },
    requireApproval: rule.requireApproval ?? true,
  }
}

// ───────────────────────── Libellés lisibles ─────────────────────────

const statusList = (value: unknown): string =>
  (Array.isArray(value) ? value : [])
    .map((s) => leadStatusLabel(String(s)))
    .join(', ')

export function describeTrigger(trigger: CrmRule['trigger']): { title: string; detail: string } {
  const p = trigger.params ?? {}
  const title = triggerLabel(trigger.type)
  switch (trigger.type) {
    case 'STATUS_CHANGED': {
      const to = statusList(p.to)
      const from = statusList(p.from)
      return { title, detail: [to && translate('crmAuto.describe.toStatus', { status: to }), from && translate('crmAuto.describe.fromStatus', { status: from })].filter(Boolean).join(' · ') || translate('crmAuto.describe.anyStatus') }
    }
    case 'LEAD_INACTIVE': {
      const st = statusList(p.statuses)
      return { title, detail: `${translate('crmAuto.describe.inactiveFor', { days: Number(p.days) || 7 })}${st ? translate('crmAuto.describe.inactiveStatus', { status: st }) : ''}` }
    }
    case 'SCORE_AT_LEAST':
      return { title, detail: translate('crmAuto.describe.scoreAtLeast', { score: Number(p.threshold) || 0 }) }
    default:
      return { title, detail: '' }
  }
}

export function formatConditionValue(c: RuleCondition): string {
  if (c.operator === 'empty' || c.operator === 'notEmpty') return ''
  if (c.field === 'archived') return c.value === true || c.value === 'true' ? translate('crmAuto.describe.yes') : translate('crmAuto.describe.no')
  const raw = Array.isArray(c.value) ? c.value : [c.value]
  return raw
    .map((v) => (c.field === 'status' ? leadStatusLabel(String(v)) : String(v ?? '')))
    .join(', ')
}

export function describeCondition(c: RuleCondition): string {
  return `${fieldLabel(c.field)} ${operatorLabel(c.operator)} ${formatConditionValue(c)}`.trim()
}

export function describeAction(a: RuleAction, requireApproval = false): string {
  const p = a.params ?? {}
  const label = actionLabel(a.type)
  switch (a.type) {
    case 'CREATE_TASK':
      return translate('crmAuto.describe.createTask', { label, title: String(p.title ?? translate('crmAuto.default.taskTitle')), days: Number(p.dueInDays ?? 1) })
    case 'NOTIFY':
      return translate(p.recipients === 'admins' ? 'crmAuto.describe.notifyAdmins' : 'crmAuto.describe.notifyOwner', { label })
    case 'ASSIGN':
      return translate(p.strategy === 'user' ? 'crmAuto.describe.assignUser' : 'crmAuto.describe.assignRound', { label })
    case 'SET_STATUS':
      return translate('crmAuto.describe.setStatus', { label, status: p.status == null ? '' : leadStatusLabel(String(p.status)) })
    case 'ADD_TAG':
      return translate('crmAuto.describe.addTag', { label, tag: String(p.tag ?? '') })
    case 'SET_FIELD':
      return `${label} ${String(p.field ?? '')} = ${String(p.value ?? '')}`
    case 'SEND_EMAIL':
      return `${translate('crmAuto.describe.sendEmail', { label, subject: String(p.subject ?? '') })}${requireApproval ? translate('crmAuto.describe.humanApproval') : ''}`
    default:
      return label
  }
}

export function describeLimits(l: RuleLimits): string {
  if (l.perLead === 'ONCE') return translate('crmAuto.limits.once')
  if (l.perLead === 'NONE') return translate('crmAuto.limits.none')
  return translate('crmAuto.limits.days', { days: l.days })
}

export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—'
  const relative = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' })
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = (t - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return translate('crmAuto.justNow')
  if (abs < 3600) return relative.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return relative.format(Math.round(diff / 86400), 'day')
  return formatDate(t)
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 1) return '—'
  return ms < 1000 ? `${Math.round(ms)} ms` : `${formatNumber(ms / 1000, { maximumFractionDigits: 1 })} s`
}
