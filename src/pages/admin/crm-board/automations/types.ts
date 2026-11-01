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

export const LEAD_STATUS_LABELS: Record<string, string> = {
  LEAD: 'Lead',
  QUALIFIED: 'Qualifié',
  CONTACTED: 'Contacté',
  DEMO: 'Démo',
  PROPOSAL: 'Proposition',
  WON: 'Gagné',
  LOST: 'Perdu',
}
export const LEAD_STATUSES = Object.keys(LEAD_STATUS_LABELS)

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  LEAD_CREATED: 'Lead créé',
  STATUS_CHANGED: 'Changement de statut',
  LEAD_ASSIGNED: 'Lead assigné',
  LEAD_INACTIVE: 'Lead inactif',
  ACTION_OVERDUE: 'Action en retard',
  SCORE_AT_LEAST: 'Score franchit un seuil',
  INTERACTION_LOGGED: 'Interaction consignée',
}

export const ACTION_LABELS: Record<ActionType, string> = {
  CREATE_TASK: 'Créer une tâche',
  NOTIFY: 'Notifier',
  ASSIGN: 'Assigner',
  SET_STATUS: 'Changer le statut',
  ADD_TAG: 'Ajouter un tag',
  SET_FIELD: 'Modifier un champ',
  SEND_EMAIL: 'Envoyer un e-mail',
  CREATE_CLIENT: 'Créer le compte client',
  CREATE_PROJECT: 'Créer un projet',
  ARCHIVE: 'Archiver',
}

export const FIELD_LABELS: Record<ConditionField, string> = {
  status: 'Statut',
  project: 'Plateforme',
  source: 'Source',
  budget: 'Montant',
  probability: 'Probabilité',
  leadTemperature: 'Température',
  score: 'Score',
  tags: 'Tags',
  assignedTo: 'Commercial',
  externalRep: 'Partenaire',
  daysSinceActivity: 'Jours sans activité',
  daysInStage: 'Jours dans l’étape',
  archived: 'Archivé',
}
export const NUMERIC_FIELDS: ConditionField[] = ['budget', 'probability', 'score', 'daysSinceActivity', 'daysInStage']

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: 'est',
  neq: 'n’est pas',
  in: 'est dans',
  nin: 'n’est pas dans',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  contains: 'contient',
  empty: 'est vide',
  notEmpty: 'est renseigné',
}
export const NUMERIC_OPERATORS: ConditionOperator[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty']
export const TEXT_OPERATORS: ConditionOperator[] = ['eq', 'neq', 'in', 'nin', 'contains', 'empty', 'notEmpty']
export const BOOL_OPERATORS: ConditionOperator[] = ['eq', 'neq']

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  OK: 'Succès',
  ERR: 'Erreur',
  SKIP: 'Ignorée',
  SIM: 'Simulation',
  PENDING: 'À valider',
  RUNNING: 'En cours',
}
export const RUN_STATUS_COLORS: Record<RunStatus, string> = {
  OK: 'var(--mint)',
  ERR: 'var(--rose)',
  SKIP: 'var(--dim)',
  SIM: 'var(--vio)',
  PENDING: 'var(--amber)',
  RUNNING: 'var(--sky)',
}
export const RULE_STATUS_LABELS: Record<RuleStatus, string> = { DRAFT: 'Brouillon', ACTIVE: 'Active', PAUSED: 'En pause' }

export const DEFAULT_LIMITS: RuleLimits = { perLead: 'DAYS', days: 7, maxPerRun: 50 }

export function emptyDraft(): RuleDraft {
  return {
    name: '',
    description: '',
    trigger: { type: 'LEAD_INACTIVE', params: { days: 7, statuses: ['CONTACTED', 'DEMO', 'PROPOSAL'] } },
    conditions: { op: 'AND', items: [] },
    actions: [{ type: 'CREATE_TASK', params: { title: 'Relancer {contact}', dueInDays: 1, assignTo: 'owner' } }],
    limits: { ...DEFAULT_LIMITS },
    requireApproval: true,
  }
}

export function draftFromRule(rule: CrmRule, asCopy = false): RuleDraft {
  return {
    name: asCopy ? `${rule.name} (copie)`.slice(0, 120) : rule.name,
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
    .map((s) => LEAD_STATUS_LABELS[String(s)] ?? String(s))
    .join(', ')

export function describeTrigger(trigger: CrmRule['trigger']): { title: string; detail: string } {
  const p = trigger.params ?? {}
  const title = TRIGGER_LABELS[trigger.type] ?? trigger.type
  switch (trigger.type) {
    case 'STATUS_CHANGED': {
      const to = statusList(p.to)
      const from = statusList(p.from)
      return { title, detail: [to && `vers ${to}`, from && `depuis ${from}`].filter(Boolean).join(' · ') || 'vers n’importe quel statut' }
    }
    case 'LEAD_INACTIVE': {
      const st = statusList(p.statuses)
      return { title, detail: `pendant ${Number(p.days) || 7} jours${st ? ` · statut ${st}` : ''}` }
    }
    case 'SCORE_AT_LEAST':
      return { title, detail: `score ≥ ${Number(p.threshold) || 0}` }
    default:
      return { title, detail: '' }
  }
}

export function formatConditionValue(c: RuleCondition): string {
  if (c.operator === 'empty' || c.operator === 'notEmpty') return ''
  if (c.field === 'archived') return c.value === true || c.value === 'true' ? 'oui' : 'non'
  const raw = Array.isArray(c.value) ? c.value : [c.value]
  return raw
    .map((v) => (c.field === 'status' ? (LEAD_STATUS_LABELS[String(v)] ?? String(v)) : String(v ?? '')))
    .join(', ')
}

export function describeCondition(c: RuleCondition): string {
  return `${FIELD_LABELS[c.field] ?? c.field} ${OPERATOR_LABELS[c.operator] ?? c.operator} ${formatConditionValue(c)}`.trim()
}

export function describeAction(a: RuleAction, requireApproval = false): string {
  const p = a.params ?? {}
  const label = ACTION_LABELS[a.type] ?? a.type
  switch (a.type) {
    case 'CREATE_TASK':
      return `${label} « ${String(p.title ?? 'Relancer {contact}')} » (J+${Number(p.dueInDays ?? 1)})`
    case 'NOTIFY':
      return `${label} ${p.recipients === 'admins' ? 'les responsables CRM' : 'le commercial'}`
    case 'ASSIGN':
      return p.strategy === 'user' ? `${label} à un utilisateur précis` : `${label} à tour de rôle`
    case 'SET_STATUS':
      return `${label} : ${LEAD_STATUS_LABELS[String(p.status)] ?? String(p.status ?? '')}`
    case 'ADD_TAG':
      return `${label} « ${String(p.tag ?? '')} »`
    case 'SET_FIELD':
      return `${label} ${String(p.field ?? '')} = ${String(p.value ?? '')}`
    case 'SEND_EMAIL':
      return `${label} « ${String(p.subject ?? '')} »${requireApproval ? ' (validation humaine)' : ''}`
    default:
      return label
  }
}

export function describeLimits(l: RuleLimits): string {
  if (l.perLead === 'ONCE') return '1 fois par lead'
  if (l.perLead === 'NONE') return 'Sans limite par lead'
  return `1 fois par lead tous les ${l.days} j`
}

const RELATIVE = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = (t - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 60) return 'à l’instant'
  if (abs < 3600) return RELATIVE.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return RELATIVE.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return RELATIVE.format(Math.round(diff / 86400), 'day')
  return new Date(t).toLocaleDateString('fr-FR')
}

export function formatDuration(ms: number): string {
  if (!ms || ms < 1) return '—'
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`
}
