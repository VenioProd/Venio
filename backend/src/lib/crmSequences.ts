import mongoose, { type Types } from 'mongoose'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import Interaction from '../models/Interaction.js'
import PersonalTask from '../models/PersonalTask.js'
import SchedulerLock, { acquireSchedulerLock, releaseSchedulerLock } from '../models/SchedulerLock.js'
import CrmSequence, {
  DEFAULT_SEND_HOUR,
  DEFAULT_STOP_STATUSES,
  SEND_HOUR_MAX,
  SEND_HOUR_MIN,
  SEQUENCE_MAX_STEPS,
  SEQUENCE_STATUSES,
  SEQUENCE_STEP_TYPES,
  type ICrmSequence,
  type ISequenceStep,
  type SequenceStatus,
} from '../models/CrmSequence.js'
import CrmSequenceEnrollment, {
  OPEN_ENROLLMENT_STATUSES,
  enrollmentOpenKey,
  type ICrmSequenceEnrollment,
  type IEnrollmentHistory,
  type StopReason,
} from '../models/CrmSequenceEnrollment.js'
import { parisParts, parisWallTimeToDate } from '../automation/jobs/crmParisTime.js'
import { checkProspectContact, normalizeEmail, suppressedAmong, DO_NOT_CONTACT } from './crmPrivacy.js'
import { deliverEmail, renderTemplate } from './crmRules.js'
import { logLeadActivity } from './crmAutomations.js'
import { isGroupEntity, leadEntityOf } from './groupEntities.js'
import logger from './logger.js'

/**
 * Séquences d'e-mails du CRM (lot 5) : modèles, inscription, moteur.
 *
 * - Une séquence est une suite d'étapes `EMAIL`, `TASK` ou `WAIT`. Chaque
 *   étape attend `delayDays` jours calendaires depuis la précédente (ou
 *   l'inscription), puis s'exécute à `sendHourParis` (heure de Paris), un jour
 *   ouvré (lundi à vendredi) : un samedi ou un dimanche reporte au lundi.
 * - Rien ne s'exécute tant que la séquence n'est pas ACTIVE : en brouillon ou
 *   en pause, les inscriptions attendent.
 * - Le job `crm.sequences` (toutes les 5 minutes) appelle `runSequenceTick`.
 *   Chaque étape d'une inscription est protégée par un `SchedulerLock`
 *   (`crm-sequence:<inscription>:<étape>`) : une seule instance l'exécute,
 *   même après un redémarrage. Un verrou resté orphelin (instance arrêtée en
 *   pleine étape) fait passer l'étape sans la rejouer : au plus un envoi.
 * - Avant chaque étape, l'inscription s'arrête si le prospect a répondu (une
 *   `Interaction` entrante après l'inscription), s'il est passé à un statut
 *   d'arrêt, s'il s'est opposé ou désinscrit, s'il est archivé ou anonymisé.
 *   Avant chaque e-mail, l'opposition et la liste de suppression sont
 *   revérifiées (`checkProspectContact`), puis l'envoi passe par la même
 *   fonction que les règles (`deliverEmail` : lien de désinscription, échange
 *   journalisé sur le lead).
 * - Le moteur n'écrit jamais le lead lui-même ; les arrêts déclenchés par une
 *   modification du lead sont appelés par `applyLeadChange`.
 */

export const ENROLL_MAX = 200
const DAY_MS = 24 * 3600 * 1000
/** Fin (exclue) de la plage d'exécution, heure de Paris. */
export const SEND_WINDOW_END_HOUR = 20
/** Durée de vie d'un verrou d'étape. */
export const STEP_LOCK_TTL_MS = 60 * DAY_MS
/** Au-delà, un verrou d'étape encore présent sur une inscription non avancée est orphelin. */
export const STALE_LOCK_MS = 15 * 60 * 1000
/** Échecs d'envoi tolérés sur une étape avant l'arrêt de l'inscription. */
export const MAX_STEP_ATTEMPTS = 3
const RETRY_DELAY_MS = 60 * 60 * 1000
const CLOSED_LEAD_STATUSES = ['WON', 'LOST']
const LEAD_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'PROPOSAL', 'WON', 'LOST']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type LeadDoc = InstanceType<typeof Lead>
type PlainLead = Record<string, any>
type SequenceLike = Pick<ICrmSequence, '_id' | 'name' | 'steps' | 'stopOn' | 'status' | 'entity'>

export const STOP_LABELS: Record<StopReason, string> = {
  REPLY: 'le prospect a répondu',
  STATUS_CHANGE: 'changement de statut',
  DO_NOT_CONTACT: 'ne pas contacter',
  UNSUBSCRIBE: 'désinscription',
  ANONYMIZED: 'lead anonymisé',
  ARCHIVED: 'lead archivé',
  NO_EMAIL: 'pas d’adresse e-mail valide',
  MANUAL: 'désinscription manuelle',
  LEAD_DELETED: 'lead supprimé',
  SEND_FAILED: 'envois en échec',
}

// ───────────────────────── Heure de Paris, jours ouvrés ─────────────────────────

const isBusinessDay = (weekday: number) => weekday >= 1 && weekday <= 5

export function clampSendHour(value: unknown): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return DEFAULT_SEND_HOUR
  return Math.min(SEND_HOUR_MAX, Math.max(SEND_HOUR_MIN, n))
}

/** Vrai un jour ouvré (lundi à vendredi), entre 08:00 et 20:00 heure de Paris. */
export function isInSendWindow(now: Date): boolean {
  const p = parisParts(now)
  return isBusinessDay(p.weekday) && p.hour >= SEND_HOUR_MIN && p.hour < SEND_WINDOW_END_HOUR
}

/**
 * Prochaine exécution d'une étape : jour de Paris de `from` + `delayDays`, à
 * `sendHour` heure de Paris, reporté au jour ouvré suivant. Délai nul et heure
 * passée : tout de suite si l'on est dans la plage d'exécution, sinon le
 * lendemain (ouvré) à l'heure prévue.
 */
export function computeNextRunAt(from: Date, delayDays: number, sendHour: number): Date {
  const hour = clampSendHour(sendHour)
  const p = parisParts(from)
  const delay = Math.max(0, Math.floor(Number(delayDays) || 0))
  // Arithmétique sur le jour calendaire de Paris (date UTC « nue »), puis conversion à l'heure murale.
  let day = new Date(Date.UTC(p.year, p.month - 1, p.day + delay))
  const wall = (d: Date) => parisWallTimeToDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour * 60)
  const nextDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))
  if (wall(day).getTime() < from.getTime()) {
    if (isInSendWindow(from)) return from
    day = nextDay(day)
  }
  while (!isBusinessDay(day.getUTCDay())) day = nextDay(day)
  return wall(day)
}

// ───────────────────────── Modèles de texte ─────────────────────────

/** Variables `{contact}`, `{company}`, `{amount}` (comme les règles) et `{owner}` (responsable du lead). */
export function renderSequenceTemplate(template: string, lead: PlainLead, ownerName = ''): string {
  // Un seul passage : une valeur qui contient « {contact} » n'est pas substituée à son tour.
  const vars: Record<string, string> = {
    contact: renderTemplate('{contact}', lead),
    company: renderTemplate('{company}', lead),
    amount: renderTemplate('{amount}', lead),
    owner: ownerName,
  }
  return String(template ?? '').replace(/\{(contact|company|amount|owner)\}/g, (_, k: string) => vars[k])
}

async function ownerNameOf(lead: PlainLead): Promise<string> {
  const id = lead.assignedTo ?? lead.createdBy
  if (!id) return ''
  const user = await User.findById(id).select('name').lean()
  return user?.name ?? ''
}

// ───────────────────────── Validation ─────────────────────────

export interface SequencePayloadResult {
  data: Record<string, any>
  errors: string[]
}

function normalizeStep(raw: any, index: number, errors: string[]): ISequenceStep | null {
  if (!raw || typeof raw !== 'object' || !(SEQUENCE_STEP_TYPES as readonly string[]).includes(raw.type)) {
    errors.push(`Étape ${index + 1} : type attendu ${SEQUENCE_STEP_TYPES.join(', ')}`)
    return null
  }
  const delay = Number(raw.delayDays ?? 0)
  const hour =
    raw.sendHourParis === undefined || raw.sendHourParis === null || raw.sendHourParis === ''
      ? DEFAULT_SEND_HOUR
      : Number(raw.sendHourParis)
  if (!Number.isInteger(delay) || delay < 0 || delay > 365)
    errors.push(`Étape ${index + 1} : délai entre 0 et 365 jours`)
  if (!Number.isInteger(hour) || hour < SEND_HOUR_MIN || hour > SEND_HOUR_MAX)
    errors.push(`Étape ${index + 1} : heure d’envoi entre ${SEND_HOUR_MIN} et ${SEND_HOUR_MAX}`)
  const step: ISequenceStep = {
    type: raw.type,
    delayDays: Number.isInteger(delay) ? Math.min(365, Math.max(0, delay)) : 0,
    sendHourParis: clampSendHour(hour),
    subject: typeof raw.subject === 'string' ? raw.subject.trim().slice(0, 300) : '',
    body: typeof raw.body === 'string' ? raw.body.slice(0, 20000) : '',
    taskTitle: typeof raw.taskTitle === 'string' ? raw.taskTitle.trim().slice(0, 300) : '',
  }
  if (step.type === 'EMAIL' && (!step.subject || !step.body.trim()))
    errors.push(`Étape ${index + 1} : objet et texte de l’e-mail requis`)
  if (step.type === 'TASK' && !step.taskTitle) errors.push(`Étape ${index + 1} : titre de la tâche requis`)
  return step
}

/** Normalise un corps de création ou de modification ; `errors` non vide : rien ne doit être écrit. Le statut est traité à part. */
export function normalizeSequencePayload(
  body: Record<string, any> = {},
  opts: { creating?: boolean } = {},
): SequencePayloadResult {
  const data: Record<string, any> = {}
  const errors: string[] = []
  if (body.name !== undefined || opts.creating) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : ''
    if (!name) errors.push('Le nom de la séquence est requis')
    else data.name = name
  }
  if (typeof body.description === 'string') data.description = body.description.slice(0, 500)
  if (body.entity !== undefined) {
    if (body.entity === null || body.entity === '') data.entity = null
    else if (isGroupEntity(body.entity)) data.entity = body.entity
    else errors.push('Entité inconnue')
  }
  if (body.steps !== undefined) {
    if (!Array.isArray(body.steps)) errors.push('steps : liste attendue')
    else if (body.steps.length > SEQUENCE_MAX_STEPS) errors.push(`${SEQUENCE_MAX_STEPS} étapes au maximum`)
    else data.steps = body.steps.map((s: unknown, i: number) => normalizeStep(s, i, errors)).filter(Boolean)
  }
  if (body.stopOn !== undefined) {
    const s = body.stopOn && typeof body.stopOn === 'object' ? body.stopOn : {}
    const statuses = Array.isArray(s.statuses)
      ? [...new Set(s.statuses.map(String).filter((x: string) => LEAD_STATUSES.includes(x)))]
      : [...DEFAULT_STOP_STATUSES]
    data.stopOn = {
      reply: s.reply !== false,
      statusChange: s.statusChange !== false,
      statuses: statuses.length ? statuses : [...DEFAULT_STOP_STATUSES],
    }
  }
  return { data, errors }
}

export function isSequenceStatus(value: unknown): value is SequenceStatus {
  return typeof value === 'string' && (SEQUENCE_STATUSES as readonly string[]).includes(value)
}

export const hasEmailStep = (sequence: Pick<ICrmSequence, 'steps'>) =>
  (sequence.steps ?? []).some((s) => s.type === 'EMAIL')

/** Une séquence ne s'active qu'avec au moins une étape. */
export function activationProblem(sequence: Pick<ICrmSequence, 'steps'>): string | null {
  return (sequence.steps ?? []).length === 0 ? 'Une séquence sans étape ne peut pas être activée' : null
}

// ───────────────────────── Inscription ─────────────────────────

export type EnrollRefusalReason =
  | 'NOT_FOUND'
  | 'ANONYMIZED'
  | 'DO_NOT_CONTACT'
  | 'SUPPRESSED'
  | 'NO_EMAIL'
  | 'CLOSED'
  | 'ARCHIVED'
  | 'ENTITY_MISMATCH'
  | 'ALREADY_ENROLLED'

export interface EnrollResult {
  enrolled: Array<{ leadId: string; enrollmentId: string; nextRunAt: Date }>
  refused: Array<{ leadId: string; reason: EnrollRefusalReason }>
}

const history = (
  step: number,
  type: string,
  status: IEnrollmentHistory['status'],
  message: string,
  at: Date,
): IEnrollmentHistory => ({ step, type, status, message, at })

/**
 * Inscrit des leads. `scope` : filtre de périmètre d'écriture de l'appelant
 * (un lead hors périmètre est rendu `NOT_FOUND`, comme l'action groupée).
 * Sont refusés : lead anonymisé, opposé, adresse dans la liste de suppression,
 * sans e-mail valide (si la séquence envoie des e-mails), gagné ou perdu,
 * archivé, d'une autre entité que celle de la séquence, déjà inscrit.
 */
export async function enrollLeads(
  sequence: SequenceLike,
  leadIds: string[],
  opts: { actorId: string | null; scope?: Record<string, unknown>; now?: Date },
): Promise<EnrollResult> {
  const now = opts.now ?? new Date()
  const ids = [...new Set(leadIds.map(String))]
  const result: EnrollResult = { enrolled: [], refused: [] }
  const valid = ids.filter((id) => mongoose.isValidObjectId(id))
  const leads = await Lead.find({ _id: { $in: valid }, ...(opts.scope ?? {}) })
  const byId = new Map(leads.map((l) => [String(l._id), l]))
  const suppressed = await suppressedAmong(leads.map((l) => l.contactEmail ?? ''))
  const open = await CrmSequenceEnrollment.find({
    sequence: sequence._id,
    lead: { $in: leads.map((l) => l._id) },
    status: { $in: OPEN_ENROLLMENT_STATUSES },
  })
    .select('lead')
    .lean()
  const alreadyIn = new Set(open.map((e) => String(e.lead)))
  const needsEmail = hasEmailStep(sequence)
  const first = sequence.steps[0]

  for (const id of ids) {
    const lead = byId.get(id)
    const refuse = (reason: EnrollRefusalReason) => result.refused.push({ leadId: id, reason })
    if (!lead) {
      refuse('NOT_FOUND')
      continue
    }
    const email = normalizeEmail(lead.contactEmail)
    if (lead.anonymizedAt) {
      refuse('ANONYMIZED')
      continue
    }
    if (lead.doNotContact) {
      refuse('DO_NOT_CONTACT')
      continue
    }
    if (email && suppressed.has(email)) {
      refuse('SUPPRESSED')
      continue
    }
    if (needsEmail && !EMAIL_RE.test(email)) {
      refuse('NO_EMAIL')
      continue
    }
    if (CLOSED_LEAD_STATUSES.includes(String(lead.status))) {
      refuse('CLOSED')
      continue
    }
    if (lead.archivedAt) {
      refuse('ARCHIVED')
      continue
    }
    if (sequence.entity && leadEntityOf(lead) !== sequence.entity) {
      refuse('ENTITY_MISMATCH')
      continue
    }
    if (alreadyIn.has(id)) {
      refuse('ALREADY_ENROLLED')
      continue
    }
    const nextRunAt = first ? computeNextRunAt(now, first.delayDays, first.sendHourParis) : now
    try {
      const enrollment = await CrmSequenceEnrollment.create({
        sequence: sequence._id,
        lead: lead._id,
        currentStep: 0,
        status: 'ACTIVE',
        nextRunAt,
        enrolledAt: now,
        enrolledBy: opts.actorId,
        openKey: enrollmentOpenKey(sequence._id, lead._id),
        history: [history(0, 'ENROLL', 'INFO', 'Inscription', now)],
      })
      result.enrolled.push({ leadId: id, enrollmentId: String(enrollment._id), nextRunAt })
      await logLeadActivity(
        lead._id,
        'SEQUENCE_ENROLLED',
        `Inscrit à la séquence « ${sequence.name} »`,
        { sequenceId: String(sequence._id) },
        opts.actorId,
      )
    } catch (err) {
      // Inscription concurrente : l'index unique des inscriptions ouvertes tranche.
      if ((err as { code?: number }).code === 11000) refuse('ALREADY_ENROLLED')
      else throw err
    }
  }
  return result
}

/** Clôt une inscription ouverte (au plus une fois) et le consigne sur le lead. */
export async function stopEnrollment(
  enrollment: Pick<ICrmSequenceEnrollment, '_id' | 'lead' | 'currentStep'>,
  reason: StopReason,
  opts: {
    sequenceName?: string
    sequenceId?: unknown
    actorId?: string | null
    now?: Date
    message?: string
    logActivity?: boolean
  } = {},
): Promise<boolean> {
  const now = opts.now ?? new Date()
  const res = await CrmSequenceEnrollment.updateOne(
    { _id: enrollment._id, status: { $in: OPEN_ENROLLMENT_STATUSES } },
    {
      $set: { status: 'STOPPED', stoppedReason: reason, stoppedAt: now, nextRunAt: null },
      $unset: { openKey: 1 },
      $push: {
        history: history(enrollment.currentStep, 'STOP', 'INFO', opts.message ?? `Arrêt : ${STOP_LABELS[reason]}`, now),
      },
    },
  )
  if (res.modifiedCount === 0) return false
  if (opts.logActivity !== false) {
    await logLeadActivity(
      enrollment.lead,
      'SEQUENCE_STOPPED',
      `Séquence « ${opts.sequenceName ?? ''} » arrêtée : ${STOP_LABELS[reason]}`,
      { sequenceId: opts.sequenceId ? String(opts.sequenceId) : null, reason },
      opts.actorId ?? null,
    ).catch(() => null)
  }
  return true
}

/** Désinscription manuelle de leads d'une séquence (périmètre d'écriture de l'appelant). */
export async function unenrollLeads(
  sequence: SequenceLike,
  leadIds: string[],
  opts: { actorId: string | null; scope?: Record<string, unknown>; now?: Date },
): Promise<{ stopped: string[]; notEnrolled: string[] }> {
  const ids = [...new Set(leadIds.map(String))].filter((id) => mongoose.isValidObjectId(id))
  const leads = await Lead.find({ _id: { $in: ids }, ...(opts.scope ?? {}) })
    .select('_id')
    .lean()
  const allowed = new Set(leads.map((l) => String(l._id)))
  const open = await CrmSequenceEnrollment.find({
    sequence: sequence._id,
    lead: { $in: [...allowed] },
    status: { $in: OPEN_ENROLLMENT_STATUSES },
  })
  const stopped: string[] = []
  for (const enrollment of open) {
    if (
      await stopEnrollment(enrollment, 'MANUAL', {
        sequenceName: sequence.name,
        sequenceId: sequence._id,
        actorId: opts.actorId,
        now: opts.now,
      })
    ) {
      stopped.push(String(enrollment.lead))
    }
  }
  return { stopped, notEnrolled: [...new Set(leadIds.map(String))].filter((id) => !stopped.includes(id)) }
}

// ───────────────────────── Arrêts déclenchés par le lead ─────────────────────────

const isStopStatus = (sequence: Pick<ICrmSequence, 'stopOn'>, status: string) =>
  Boolean(sequence.stopOn?.statusChange) &&
  (sequence.stopOn?.statuses?.length ? sequence.stopOn.statuses : DEFAULT_STOP_STATUSES).includes(status)

const oppositionReason = (lead: PlainLead): StopReason =>
  lead.doNotContactReason === 'UNSUBSCRIBE_LINK' ? 'UNSUBSCRIBE' : 'DO_NOT_CONTACT'

/**
 * Appelé par `applyLeadChange` après chaque écriture : opposition,
 * désinscription, anonymisation, archivage ou passage à un statut d'arrêt
 * closent les inscriptions ouvertes du lead. Ne lève jamais.
 */
export async function stopSequencesOnLeadChange(
  lead: PlainLead,
  before: { status?: string } | null,
  actorId: string | null = null,
): Promise<number> {
  try {
    const statusChanged = Boolean(before?.status) && before!.status !== lead.status
    if (!lead.doNotContact && !lead.anonymizedAt && !lead.archivedAt && !statusChanged) return 0
    const open = await CrmSequenceEnrollment.find({ lead: lead._id, status: { $in: OPEN_ENROLLMENT_STATUSES } })
    if (open.length === 0) return 0
    const sequences = await CrmSequence.find({ _id: { $in: open.map((e) => e.sequence) } })
      .select('name stopOn')
      .lean()
    const byId = new Map(sequences.map((s) => [String(s._id), s]))
    let count = 0
    for (const enrollment of open) {
      const sequence = byId.get(String(enrollment.sequence))
      const reason: StopReason | null = lead.anonymizedAt
        ? 'ANONYMIZED'
        : lead.doNotContact
          ? oppositionReason(lead)
          : lead.archivedAt
            ? 'ARCHIVED'
            : statusChanged && (!sequence || isStopStatus(sequence, String(lead.status)))
              ? 'STATUS_CHANGE'
              : null
      if (!reason) continue
      if (
        await stopEnrollment(enrollment, reason, {
          sequenceName: sequence?.name,
          sequenceId: enrollment.sequence,
          actorId,
        })
      )
        count++
    }
    return count
  } catch (err) {
    logger.error({ data: (err as Error).message }, '[crm-sequences] stopSequencesOnLeadChange')
    return 0
  }
}

/** Échange entrant consigné sur un lead (réponse du prospect) : arrêt des séquences qui le demandent. Ne lève jamais. */
export async function stopSequencesOnInboundInteraction(
  leadId: Types.ObjectId | string,
  occurredAt: Date,
): Promise<number> {
  try {
    const open = await CrmSequenceEnrollment.find({
      lead: leadId,
      status: { $in: OPEN_ENROLLMENT_STATUSES },
      enrolledAt: { $lte: occurredAt },
    })
    if (open.length === 0) return 0
    const sequences = await CrmSequence.find({ _id: { $in: open.map((e) => e.sequence) } })
      .select('name stopOn')
      .lean()
    const byId = new Map(sequences.map((s) => [String(s._id), s]))
    let count = 0
    for (const enrollment of open) {
      const sequence = byId.get(String(enrollment.sequence))
      if (sequence && sequence.stopOn?.reply === false) continue
      if (await stopEnrollment(enrollment, 'REPLY', { sequenceName: sequence?.name, sequenceId: enrollment.sequence }))
        count++
    }
    return count
  } catch (err) {
    logger.error({ data: (err as Error).message }, '[crm-sequences] stopSequencesOnInboundInteraction')
    return 0
  }
}

// ───────────────────────── Moteur ─────────────────────────

export type TickOutcome =
  'SENT' | 'TASK' | 'WAITED' | 'SKIPPED_STEP' | 'COMPLETED' | 'STOPPED' | 'RESCHEDULED' | 'LOCKED' | 'RETRY' | 'ERROR'

export interface TickSummary {
  due: number
  outcomes: Partial<Record<TickOutcome, number>>
}

export const stepLockKey = (enrollmentId: unknown, step: number) => `crm-sequence:${String(enrollmentId)}:${step}`

/** Raison d'arrêt constatée avant d'exécuter une étape, ou `null`. */
async function preflightStop(
  lead: LeadDoc,
  sequence: SequenceLike,
  enrollment: ICrmSequenceEnrollment,
  step: ISequenceStep,
): Promise<StopReason | null> {
  if (lead.anonymizedAt) return 'ANONYMIZED'
  if (lead.doNotContact) return oppositionReason(lead)
  if (lead.archivedAt) return 'ARCHIVED'
  if (isStopStatus(sequence, String(lead.status))) return 'STATUS_CHANGE'
  if (sequence.stopOn?.reply !== false) {
    const replied = await Interaction.exists({
      subjectType: 'LEAD',
      subjectId: lead._id,
      direction: 'IN',
      occurredAt: { $gte: enrollment.enrolledAt },
    })
    if (replied) return 'REPLY'
  }
  if (step.type === 'EMAIL') {
    const to = normalizeEmail(lead.contactEmail)
    if (!EMAIL_RE.test(to)) return 'NO_EMAIL'
    // Opposition et liste de suppression, revérifiées au moment d'envoyer.
    const contact = await checkProspectContact(lead, to)
    if (!contact.allowed) return 'DO_NOT_CONTACT'
  }
  return null
}

interface StepOutcome {
  status: 'OK' | 'SKIP' | 'ERR'
  message: string
  outcome: TickOutcome
  stop?: StopReason
}

async function executeStep(
  lead: LeadDoc,
  sequence: SequenceLike,
  step: ISequenceStep,
  now: Date,
): Promise<StepOutcome> {
  if (step.type === 'WAIT') return { status: 'OK', message: 'Attente terminée', outcome: 'WAITED' }
  const ownerName = await ownerNameOf(lead)
  if (step.type === 'TASK') {
    const userId = lead.assignedTo ?? lead.createdBy
    if (!userId) return { status: 'SKIP', message: 'Aucun responsable à qui confier la tâche', outcome: 'SKIPPED_STEP' }
    const title = renderSequenceTemplate(step.taskTitle || 'Relancer {contact}', lead, ownerName).slice(0, 300)
    await PersonalTask.create({
      userId,
      title,
      description: renderSequenceTemplate(step.body || '', lead, ownerName),
      leadId: lead._id,
      sequenceId: sequence._id,
      priority: 'NORMALE',
      dueDate: now,
    })
    return { status: 'OK', message: `Tâche « ${title} » créée`, outcome: 'TASK' }
  }
  const to = normalizeEmail(lead.contactEmail)
  const subject = renderSequenceTemplate(step.subject, lead, ownerName)
  const body = renderSequenceTemplate(step.body, lead, ownerName)
  // Même envoi que les règles : opposition revérifiée, lien de désinscription, échange journalisé sur le lead.
  const sent = await deliverEmail(lead, { to, subject, body }, null)
  if (sent.status === 'OK') return { status: 'OK', message: `E-mail « ${subject} » envoyé`, outcome: 'SENT' }
  if (sent.status === 'SKIP' && (sent.payload as { reason?: string } | undefined)?.reason === DO_NOT_CONTACT) {
    return { status: 'SKIP', message: 'E-mail bloqué : ne pas contacter', outcome: 'STOPPED', stop: 'DO_NOT_CONTACT' }
  }
  // Pas d'adresse dans le message : le journal de la séquence ne garde pas de donnée personnelle.
  return { status: 'ERR', message: `E-mail « ${subject} » non envoyé`, outcome: 'RETRY' }
}

/** Passe à l'étape suivante (ou termine) si l'inscription est toujours à l'étape `from`. */
async function advance(
  enrollment: ICrmSequenceEnrollment,
  sequence: SequenceLike,
  from: number,
  entry: IEnrollmentHistory,
  now: Date,
): Promise<'ADVANCED' | 'COMPLETED' | 'NOOP'> {
  const nextIndex = from + 1
  const nextStep = sequence.steps[nextIndex]
  const update = nextStep
    ? {
        $set: {
          currentStep: nextIndex,
          nextRunAt: computeNextRunAt(now, nextStep.delayDays, nextStep.sendHourParis),
          attempts: 0,
        },
        $push: { history: entry },
      }
    : {
        $set: { currentStep: nextIndex, status: 'COMPLETED', completedAt: now, nextRunAt: null, attempts: 0 },
        $unset: { openKey: 1 },
        $push: { history: entry },
      }
  const res = await CrmSequenceEnrollment.updateOne(
    { _id: enrollment._id, status: 'ACTIVE', currentStep: from },
    update,
  )
  if (res.modifiedCount === 0) return 'NOOP'
  if (!nextStep) {
    await logLeadActivity(enrollment.lead, 'SEQUENCE_COMPLETED', `Séquence « ${sequence.name} » terminée`, {
      sequenceId: String(sequence._id),
    }).catch(() => null)
    return 'COMPLETED'
  }
  return 'ADVANCED'
}

/** Traite une inscription échue. Exporté pour les tests. */
export async function processEnrollment(
  enrollment: ICrmSequenceEnrollment,
  sequence: SequenceLike,
  now: Date = new Date(),
): Promise<TickOutcome> {
  const index = enrollment.currentStep
  const step = sequence.steps[index]
  if (!step) {
    // Étapes retirées depuis l'inscription : la séquence est terminée pour ce lead.
    const res = await CrmSequenceEnrollment.updateOne(
      { _id: enrollment._id, status: 'ACTIVE', currentStep: index },
      {
        $set: { status: 'COMPLETED', completedAt: now, nextRunAt: null },
        $unset: { openKey: 1 },
        $push: { history: history(index, 'END', 'INFO', 'Plus d’étape à exécuter', now) },
      },
    )
    return res.modifiedCount ? 'COMPLETED' : 'LOCKED'
  }
  const lead = await Lead.findById(enrollment.lead)
  if (!lead) {
    await stopEnrollment(enrollment, 'LEAD_DELETED', { sequenceName: sequence.name, now, logActivity: false })
    return 'STOPPED'
  }
  const stop = await preflightStop(lead, sequence, enrollment, step)
  if (stop) {
    await stopEnrollment(enrollment, stop, { sequenceName: sequence.name, sequenceId: sequence._id, now })
    return 'STOPPED'
  }
  // Automatisation suspendue sur le lead, ou hors plage (week-end, nuit) : on reporte sans rien exécuter.
  if (lead.automationPausedAt || !isInSendWindow(now)) {
    const nextRunAt = computeNextRunAt(now, lead.automationPausedAt ? 1 : 0, step.sendHourParis)
    await CrmSequenceEnrollment.updateOne(
      { _id: enrollment._id, status: 'ACTIVE', currentStep: index },
      { $set: { nextRunAt } },
    )
    return 'RESCHEDULED'
  }

  const lockKey = stepLockKey(enrollment._id, index)
  if (!(await acquireSchedulerLock(lockKey, STEP_LOCK_TTL_MS, now))) {
    // Verrou orphelin (instance arrêtée pendant l'étape) : on ne sait pas si l'e-mail est parti ; on ne le rejoue pas.
    const lock = await SchedulerLock.findById(lockKey).select('createdAt').lean()
    if (lock && now.getTime() - new Date(lock.createdAt).getTime() > STALE_LOCK_MS) {
      await advance(
        enrollment,
        sequence,
        index,
        history(index, step.type, 'SKIP', 'Étape interrompue lors d’un précédent passage : non rejouée', now),
        now,
      )
      return 'SKIPPED_STEP'
    }
    return 'LOCKED'
  }
  // L'inscription a pu changer entre la lecture et le verrou (arrêt, autre instance) : on relit.
  const fresh = await CrmSequenceEnrollment.findOne({ _id: enrollment._id, status: 'ACTIVE', currentStep: index })
  if (!fresh) return 'LOCKED'

  let result: StepOutcome
  try {
    result = await executeStep(lead, sequence, step, now)
  } catch (err) {
    logger.warn({ data: (err as Error).message }, `[crm-sequences] étape ${index} de ${String(enrollment._id)}`)
    result = { status: 'ERR', message: `Étape en erreur : ${(err as Error).message}`.slice(0, 300), outcome: 'ERROR' }
  }

  if (result.stop) {
    await stopEnrollment(fresh, result.stop, {
      sequenceName: sequence.name,
      sequenceId: sequence._id,
      now,
      message: result.message,
    })
    return 'STOPPED'
  }
  if (result.status === 'ERR') {
    // Rien n'est parti : le verrou est rendu pour une nouvelle tentative, plafonnée.
    await releaseSchedulerLock(lockKey).catch(() => {})
    const attempts = (fresh.attempts ?? 0) + 1
    if (attempts >= MAX_STEP_ATTEMPTS) {
      await CrmSequenceEnrollment.updateOne(
        { _id: fresh._id },
        { $push: { history: history(index, step.type, 'ERR', result.message, now) } },
      )
      await stopEnrollment(fresh, 'SEND_FAILED', { sequenceName: sequence.name, sequenceId: sequence._id, now })
      return 'STOPPED'
    }
    await CrmSequenceEnrollment.updateOne(
      { _id: fresh._id, status: 'ACTIVE', currentStep: index },
      {
        $set: { attempts, nextRunAt: new Date(now.getTime() + RETRY_DELAY_MS) },
        $push: { history: history(index, step.type, 'ERR', result.message, now) },
      },
    )
    return result.outcome
  }
  const moved = await advance(
    fresh,
    sequence,
    index,
    history(index, step.type, result.status, result.message, now),
    now,
  )
  return moved === 'COMPLETED' ? 'COMPLETED' : result.outcome
}

/**
 * Un passage du moteur : inscriptions ACTIVE échues des séquences ACTIVE, par
 * ordre d'échéance. Sûr en concurrence (verrou par étape) ; ne lève pas pour
 * une inscription en erreur.
 */
export async function runSequenceTick(now: Date = new Date(), opts: { limit?: number } = {}): Promise<TickSummary> {
  const summary: TickSummary = { due: 0, outcomes: {} }
  const sequences = await CrmSequence.find({ status: 'ACTIVE' }).lean()
  if (sequences.length === 0) return summary
  const byId = new Map(sequences.map((s) => [String(s._id), s]))
  const due = await CrmSequenceEnrollment.find({
    status: 'ACTIVE',
    nextRunAt: { $lte: now },
    sequence: { $in: sequences.map((s) => s._id) },
  })
    .sort({ nextRunAt: 1 })
    .limit(opts.limit ?? 200)
  summary.due = due.length
  for (const enrollment of due) {
    const sequence = byId.get(String(enrollment.sequence))
    if (!sequence) continue
    let outcome: TickOutcome
    try {
      outcome = await processEnrollment(enrollment, sequence, now)
    } catch (err) {
      logger.error({ data: (err as Error).message }, '[crm-sequences] processEnrollment')
      outcome = 'ERROR'
    }
    summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1
  }
  return summary
}

// ───────────────────────── Lecture ─────────────────────────

export interface SequenceStats {
  total: number
  active: number
  paused: number
  completed: number
  stopped: number
  stoppedByReason: Partial<Record<StopReason, number>>
}

export const emptyStats = (): SequenceStats => ({
  total: 0,
  active: 0,
  paused: 0,
  completed: 0,
  stopped: 0,
  stoppedByReason: {},
})

/** Statistiques simples par séquence : inscrits, en cours, terminés, arrêtés par raison. */
export async function sequenceStats(
  sequenceIds: Array<Types.ObjectId | string>,
  leadFilter?: Array<Types.ObjectId>,
): Promise<Map<string, SequenceStats>> {
  const match: Record<string, unknown> = {
    sequence: { $in: sequenceIds.map((id) => new mongoose.Types.ObjectId(String(id))) },
  }
  if (leadFilter) match.lead = { $in: leadFilter }
  const rows = await CrmSequenceEnrollment.aggregate<{
    _id: { sequence: Types.ObjectId; status: string; reason: string | null }
    n: number
  }>([
    { $match: match },
    { $group: { _id: { sequence: '$sequence', status: '$status', reason: '$stoppedReason' }, n: { $sum: 1 } } },
  ])
  const out = new Map<string, SequenceStats>()
  for (const id of sequenceIds) out.set(String(id), emptyStats())
  for (const row of rows) {
    const stats = out.get(String(row._id.sequence)) ?? emptyStats()
    stats.total += row.n
    if (row._id.status === 'ACTIVE') stats.active += row.n
    else if (row._id.status === 'PAUSED') stats.paused += row.n
    else if (row._id.status === 'COMPLETED') stats.completed += row.n
    else if (row._id.status === 'STOPPED') {
      stats.stopped += row.n
      const reason = (row._id.reason ?? 'MANUAL') as StopReason
      stats.stoppedByReason[reason] = (stats.stoppedByReason[reason] ?? 0) + row.n
    }
    out.set(String(row._id.sequence), stats)
  }
  return out
}

/** Supprime les inscriptions d'un lead (suppression en cascade). */
export async function deleteLeadEnrollments(leadId: Types.ObjectId | string): Promise<void> {
  await CrmSequenceEnrollment.deleteMany({ lead: leadId })
}

// ───────────────────────── Migration 011 ─────────────────────────

/** Index des séquences et des inscriptions (file du moteur, unicité des inscriptions ouvertes). Idempotente. */
export async function ensureSequenceIndexes(dryRun = false) {
  const counts = {
    sequences: await CrmSequence.estimatedDocumentCount(),
    enrollments: await CrmSequenceEnrollment.estimatedDocumentCount(),
  }
  if (dryRun) return { dryRun: true, ...counts }
  await CrmSequence.createIndexes()
  await CrmSequenceEnrollment.createIndexes()
  await PersonalTask.createIndexes()
  return { dryRun: false, ...counts }
}
