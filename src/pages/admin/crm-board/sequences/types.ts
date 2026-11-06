import type { MessageKey } from '../../../../i18n'

export type SequenceStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED'
export type StepType = 'EMAIL' | 'TASK' | 'WAIT'
export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'STOPPED' | 'PAUSED'

export const SEQUENCE_STATUSES: SequenceStatus[] = ['DRAFT', 'ACTIVE', 'PAUSED']
export const STEP_TYPES: StepType[] = ['EMAIL', 'TASK', 'WAIT']
export const ENROLLMENT_STATUSES: EnrollmentStatus[] = ['ACTIVE', 'COMPLETED', 'STOPPED', 'PAUSED']
export const MAX_STEPS = 20
export const MIN_HOUR = 8
export const MAX_HOUR = 19
export const DEFAULT_HOUR = 9
export const SEND_HOURS = Array.from({ length: MAX_HOUR - MIN_HOUR + 1 }, (_, i) => MIN_HOUR + i)

export const STOP_REASONS = [
  'REPLY',
  'STATUS_CHANGE',
  'DO_NOT_CONTACT',
  'UNSUBSCRIBE',
  'ANONYMIZED',
  'ARCHIVED',
  'NO_EMAIL',
  'MANUAL',
  'LEAD_DELETED',
  'SEND_FAILED',
] as const

export const REFUSE_REASONS = [
  'NOT_FOUND',
  'ANONYMIZED',
  'DO_NOT_CONTACT',
  'SUPPRESSED',
  'NO_EMAIL',
  'CLOSED',
  'ARCHIVED',
  'ENTITY_MISMATCH',
  'ALREADY_ENROLLED',
] as const

export interface SequenceStep {
  type: StepType
  delayDays: number
  sendHourParis: number
  subject: string
  body: string
  taskTitle: string
}

export interface StopOn {
  reply: boolean
  statusChange: boolean
  statuses: string[]
}

export interface SequenceStats {
  total: number
  active: number
  paused: number
  completed: number
  stopped: number
  stoppedByReason: Record<string, number>
}

export interface Sequence {
  _id: string
  name: string
  description: string
  entity: string | null
  status: SequenceStatus
  steps: SequenceStep[]
  stopOn: StopOn
  createdBy?: string
  activatedAt?: string | null
  createdAt?: string
  updatedAt?: string
  stats: SequenceStats
}

export interface HistoryEntry {
  step: number
  type: StepType
  status: 'OK' | 'SKIP' | 'ERR' | 'INFO'
  message: string
  at: string
}

export interface Enrollment {
  _id: string
  /** Id de la séquence, ou séquence peuplée (fiche lead). */
  sequence: string | { _id: string; name: string; status: SequenceStatus; steps: SequenceStep[] }
  lead?: { _id: string; company: string; contactName?: string; status: string }
  currentStep: number
  status: EnrollmentStatus
  nextRunAt: string | null
  stoppedReason: string | null
  enrolledAt?: string
  completedAt?: string | null
  stoppedAt?: string | null
  history: HistoryEntry[]
}

export interface EnrollmentsPage {
  items: Enrollment[]
  page: number
  pageSize: number
  total: number
}

export interface EnrollResult {
  sequenceId: string
  sequenceStatus: SequenceStatus
  enrolled: Array<{ leadId: string; enrollmentId: string; nextRunAt: string | null }>
  refused: Array<{ leadId: string; reason: string }>
}

export interface UnenrollResult {
  sequenceId: string
  stopped: string[]
  notEnrolled: string[]
}

export interface SequenceDraft {
  name: string
  description: string
  entity: string
  steps: Array<SequenceStep & { uid: string }>
  stopOn: StopOn
}

export interface SequencePayload {
  name: string
  description: string
  entity: string | null
  steps: SequenceStep[]
  stopOn: StopOn
}

/** Variables disponibles dans les objets et textes (cf. le moteur d'envoi). */
export const TEMPLATE_VARIABLES = [
  { token: '{contact}', key: 'contact' },
  { token: '{company}', key: 'company' },
  { token: '{owner}', key: 'owner' },
  { token: '{amount}', key: 'amount' },
] as const

export type StepField = 'subject' | 'body' | 'taskTitle'

export const DEFAULT_STOP_ON: StopOn = { reply: true, statusChange: true, statuses: ['WON', 'LOST'] }

let uidCounter = 0
const nextUid = () => `s${Date.now().toString(36)}${(uidCounter++).toString(36)}`

export const emptyStep = (type: StepType = 'EMAIL'): SequenceStep & { uid: string } => ({
  uid: nextUid(),
  type,
  delayDays: type === 'EMAIL' ? 0 : 1,
  sendHourParis: DEFAULT_HOUR,
  subject: '',
  body: '',
  taskTitle: '',
})

export const emptyDraft = (): SequenceDraft => ({
  name: '',
  description: '',
  entity: '',
  steps: [emptyStep('EMAIL')],
  stopOn: { ...DEFAULT_STOP_ON, statuses: [...DEFAULT_STOP_ON.statuses] },
})

export const draftFromSequence = (seq: Sequence): SequenceDraft => ({
  name: seq.name,
  description: seq.description ?? '',
  entity: seq.entity ?? '',
  steps: (seq.steps ?? []).map((s) => ({ ...emptyStep(s.type), ...s, uid: nextUid() })),
  stopOn: { ...(seq.stopOn ?? DEFAULT_STOP_ON), statuses: [...(seq.stopOn?.statuses ?? [])] },
})

export const payloadFromDraft = (draft: SequenceDraft): SequencePayload => ({
  name: draft.name.trim(),
  description: draft.description.trim(),
  entity: draft.entity || null,
  steps: draft.steps.map(({ uid: _uid, ...step }) => {
    void _uid
    return {
      type: step.type,
      delayDays: Math.min(365, Math.max(0, Math.round(Number(step.delayDays) || 0))),
      sendHourParis: Math.min(MAX_HOUR, Math.max(MIN_HOUR, Math.round(Number(step.sendHourParis) || DEFAULT_HOUR))),
      subject: step.type === 'EMAIL' ? step.subject : '',
      body: step.type === 'WAIT' ? '' : step.body,
      taskTitle: step.type === 'TASK' ? step.taskTitle : '',
    }
  }),
  stopOn: draft.stopOn,
})

/** Premier problème de saisie (clé i18n + paramètres) ou null. */
export function validateDraft(draft: SequenceDraft): { key: MessageKey; params?: Record<string, string | number> } | null {
  if (!draft.name.trim()) return { key: 'crmSeq.builder.needName' }
  if (draft.steps.length > MAX_STEPS) return { key: 'crmSeq.builder.tooMany', params: { max: MAX_STEPS } }
  for (let i = 0; i < draft.steps.length; i++) {
    const s = draft.steps[i]
    if (s.type === 'EMAIL') {
      if (!s.subject.trim()) return { key: 'crmSeq.builder.needSubject', params: { n: i + 1 } }
      if (!s.body.trim()) return { key: 'crmSeq.builder.needBody', params: { n: i + 1 } }
    }
    if (s.type === 'TASK' && !s.taskTitle.trim()) return { key: 'crmSeq.builder.needTask', params: { n: i + 1 } }
  }
  return null
}

export interface SampleValues {
  contact: string
  company: string
  owner: string
  amount: string
}

/** Rend un modèle avec des valeurs d'exemple. */
export const renderTemplate = (text: string, sample: SampleValues): string =>
  text.replace(/\{(contact|company|owner|amount)\}/g, (_m, key: keyof SampleValues) => sample[key])

export const planLabel = (n: number, total: number) => Math.min(Math.max(n, 0) + 1, Math.max(total, 1))

export const stepKeyFor = (type: StepType): MessageKey => `crmSeq.step.type.${type}`
export const sequenceStatusKey = (s: SequenceStatus): MessageKey => `crmSeq.status.${s}`
export const enrollmentStatusKey = (s: EnrollmentStatus): MessageKey => `crmSeq.enr.status.${s}`
export const stopReasonKey = (r: string): MessageKey | null =>
  (STOP_REASONS as readonly string[]).includes(r) ? (`crmSeq.stop.${r}` as MessageKey) : null
export const refuseReasonKey = (r: string): MessageKey | null =>
  (REFUSE_REASONS as readonly string[]).includes(r) ? (`crmSeq.refuse.${r}` as MessageKey) : null
