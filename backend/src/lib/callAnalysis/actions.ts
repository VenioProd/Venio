import type { ClientSession, Types } from 'mongoose'
import mongoose from 'mongoose'
import CallAnalysis, { type ICallAnalysis, type ICallAnalysisDecision } from '../../models/CallAnalysis.js'
import CrmSequence, { type ICrmSequence } from '../../models/CrmSequence.js'
import CrmSequenceEnrollment, { OPEN_ENROLLMENT_STATUSES } from '../../models/CrmSequenceEnrollment.js'
import User from '../../models/User.js'
import type { ILead } from '../../types/models/index.js'
import { LeadChangeError } from '../crmLeadService.js'
import { normalizeEmail, suppressedAmong } from '../crmPrivacy.js'
import { CRM_ASSIGNABLE_ROLES } from '../crmScope.js'
import { enrollLeads, hasEmailStep } from '../crmSequences.js'
import { leadEntityOf } from '../groupEntities.js'
import { notifyUsers } from '../notifyHelpers.js'
import type { ApplyScope } from './fields.js'
import type { CallAnalysisOutput } from './schema.js'

/**
 * Actions `SEQUENCE` et `HANDOFF` d'une analyse acceptées par un humain.
 *
 * - `SEQUENCE` (équipe seulement) : inscription par `enrollLeads`, le service
 *   des séquences, après validation de la relecture. Les gardes sont contrôlées
 *   d'abord dans la transaction (rien n'est écrit si l'une refuse) ; le service
 *   les recontrôle au moment d'inscrire.
 * - `HANDOFF` : pour l'externe, le passage au closer (`lib/closingHandoff.ts`) ;
 *   pour l'équipe, la réassignation à un membre choisi. Les deux passent par
 *   l'écriture unique du lead de la relecture (`applyLeadChange`).
 */

const fail = (status: number, code: string, message: string, details: Record<string, unknown> = {}) =>
  new LeadChangeError(status, code, message, details)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CLOSED_STATUSES = ['WON', 'LOST']

type SequenceDoc = Pick<ICrmSequence, '_id' | 'name' | 'steps' | 'stopOn' | 'status' | 'entity'>

/**
 * Refus d'inscription, du plus protecteur au plus pratique. Le consentement
 * s'ajoute aux gardes du service : un consentement retiré, ou une base légale
 * « consentement » sans consentement donné, interdit la séquence.
 */
async function sequenceRefusal(lead: ILead, sequence: SequenceDoc, session: ClientSession): Promise<string | null> {
  const consent = (lead.consent ?? {}) as { status?: string; basis?: string }
  if (lead.anonymizedAt) return 'ANONYMIZED'
  if (lead.callHold) return 'OPT_OUT_PENDING'
  if (lead.doNotContact) return 'DO_NOT_CONTACT'
  if (lead.doNotCall) return 'DO_NOT_CALL'
  if (consent.status === 'WITHDRAWN') return 'CONSENT_WITHDRAWN'
  if (consent.basis === 'CONSENT' && consent.status !== 'GRANTED') return 'CONSENT_REQUIRED'
  const email = normalizeEmail(lead.contactEmail)
  if (email && (await suppressedAmong([email])).has(email)) return 'SUPPRESSED'
  if (hasEmailStep(sequence) && !EMAIL_RE.test(email)) return 'NO_EMAIL'
  if (CLOSED_STATUSES.includes(String(lead.status))) return 'CLOSED'
  if (lead.archivedAt) return 'ARCHIVED'
  if (sequence.entity && leadEntityOf(lead) !== sequence.entity) return 'ENTITY_MISMATCH'
  const open = await CrmSequenceEnrollment.exists({
    sequence: sequence._id,
    lead: lead._id,
    status: { $in: OPEN_ENROLLMENT_STATUSES },
  }).session(session)
  return open ? 'ALREADY_ENROLLED' : null
}

/** Séquence choisie pour une action `SEQUENCE` acceptée : elle existe, a des étapes, et le lead peut y entrer. */
export async function checkSequence(sequenceId: unknown, lead: ILead, session: ClientSession, actionId: string) {
  if (typeof sequenceId !== 'string' || !mongoose.isObjectIdOrHexString(sequenceId))
    throw fail(400, 'SEQUENCE_REQUIRED', 'Choisissez la séquence', { id: actionId })
  const sequence = await CrmSequence.findById(sequenceId).session(session)
  if (!sequence) throw fail(400, 'SEQUENCE_NOT_FOUND', 'Séquence introuvable', { id: actionId })
  if (sequence.steps.length === 0) throw fail(409, 'EMPTY_SEQUENCE', 'La séquence n’a aucune étape', { id: actionId })
  const reason = await sequenceRefusal(lead, sequence, session)
  if (reason) throw fail(409, 'SEQUENCE_NOT_ALLOWED', `Inscription impossible : ${reason}`, { id: actionId, reason })
  return { _id: sequence._id as Types.ObjectId, name: sequence.name }
}

/** Membre choisi pour une action `HANDOFF` de l'équipe. L'habilitation est contrôlée par `applyLeadChange`. */
export function checkAssignee(assigneeId: unknown, lead: ILead, actionId: string): string {
  if (typeof assigneeId !== 'string' || !mongoose.isObjectIdOrHexString(assigneeId))
    throw fail(400, 'HANDOFF_ASSIGNEE_REQUIRED', 'Choisissez à qui passer la main', { id: actionId })
  if (String(lead.assignedTo ?? '') === assigneeId)
    throw fail(409, 'HANDOFF_SAME_ASSIGNEE', 'Ce membre suit déjà la fiche', { id: actionId })
  return assigneeId
}

type SequenceOutcome = { status: 'ENROLLED'; enrollmentId: string | null } | { status: 'REFUSED'; reason: string }
interface SequenceAfter {
  sequenceId: string
  sequenceName: string
  enrollment?: SequenceOutcome
}

const pendingEnrollments = (analysis: ICallAnalysis) =>
  (analysis.review?.decisions ?? []).filter((decision: ICallAnalysisDecision) => {
    const after = decision.after as SequenceAfter | null
    return decision.action === 'ACCEPT' && after?.sequenceId && !after.enrollment
  })

/**
 * Inscrit le lead aux séquences acceptées dont l'inscription n'est pas encore
 * consignée, et consigne le résultat sur la décision. Appelée après la
 * transaction, et de nouveau au rejeu : une inscription interrompue se termine,
 * une inscription faite ne se refait pas.
 */
export async function completeEnrollments(analysis: ICallAnalysis, actorId: string): Promise<ICallAnalysis> {
  const pending = pendingEnrollments(analysis)
  if (pending.length === 0) return analysis
  for (const decision of pending) {
    const after = decision.after as SequenceAfter
    const sequence = await CrmSequence.findById(after.sequenceId)
    let outcome: SequenceOutcome
    if (!sequence) outcome = { status: 'REFUSED', reason: 'NOT_FOUND' }
    else {
      // Le périmètre a été contrôlé dans la transaction ; la réassignation acceptée en même temps peut l'avoir déplacé.
      const result = await enrollLeads(sequence, [String(analysis.lead)], { actorId })
      const enrolled = result.enrolled[0]
      const refused = result.refused[0]
      outcome = enrolled
        ? { status: 'ENROLLED', enrollmentId: enrolled.enrollmentId }
        : refused?.reason === 'ALREADY_ENROLLED'
          ? { status: 'ENROLLED', enrollmentId: null }
          : { status: 'REFUSED', reason: refused?.reason ?? 'NOT_FOUND' }
    }
    await CallAnalysis.updateOne(
      { _id: analysis._id, 'review.decisions.path': decision.path },
      { $set: { 'review.decisions.$.after.enrollment': outcome } },
    )
  }
  return (await CallAnalysis.findById(analysis._id)) ?? analysis
}

/** Prévient le membre à qui l'équipe a passé la main (une fois l'écriture validée). */
export async function notifyHandoffAssignee(assigneeId: string, lead: Pick<ILead, '_id' | 'company'>, by: string) {
  const actor = await User.findById(by).select('name').lean<{ name?: string }>()
  await notifyUsers([assigneeId], {
    type: 'CRM_LEAD_ASSIGNED',
    title: 'Fiche transmise',
    message: `${lead.company} — ${actor?.name ?? ''} vous passe la main après un appel`,
    link: `/admin/crm/leads/${lead._id}`,
    metadata: { leadId: String(lead._id) },
  }).catch(() => {})
}

/**
 * Choix offerts à l'écran pour les actions `SEQUENCE` et `HANDOFF` :
 * séquences de l'entité du lead (avec celle que l'analyse nomme, si elle en
 * nomme une), membres à qui passer la main. L'externe n'inscrit pas en séquence.
 */
export async function actionOptions(output: CallAnalysisOutput | null, lead: ILead, scope: ApplyScope) {
  const types = new Set((output?.actions ?? []).map((action) => action.type))
  const options = {
    /** Externe : passage au closer, sans choix ; équipe : réassignation au membre choisi. */
    handoff: scope === 'rep' ? ('CLOSER' as const) : ('MEMBER' as const),
    teamOnly: scope === 'rep' ? ['SEQUENCE'] : [],
    sequences: [] as Array<{ _id: string; name: string; status: string }>,
    suggestedSequences: {} as Record<string, string>,
    members: [] as Array<{ _id: string; name: string }>,
  }
  if (scope !== 'team') return options
  if (types.has('SEQUENCE')) {
    const entity = leadEntityOf(lead)
    const sequences = await CrmSequence.find({ $or: [{ entity: null }, { entity }] })
      .select('name status')
      .sort({ name: 1 })
      .limit(200)
      .lean()
    options.sequences = sequences.map((sequence) => ({
      _id: String(sequence._id),
      name: sequence.name,
      status: sequence.status,
    }))
    const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    for (const action of output?.actions ?? []) {
      if (action.type !== 'SEQUENCE') continue
      const label = fold(`${action.label} ${action.reason}`)
      const named = options.sequences.find((sequence) => sequence.name.trim() && label.includes(fold(sequence.name)))
      if (named) options.suggestedSequences[action.id] = named._id
    }
  }
  if (types.has('HANDOFF')) {
    const members = await User.find({
      _id: { $ne: lead.assignedTo ?? null },
      role: { $in: CRM_ASSIGNABLE_ROLES },
      isActive: true,
    })
      .select('name')
      .sort({ name: 1 })
      .limit(200)
      .lean<Array<{ _id: Types.ObjectId; name: string }>>()
    options.members = members.map((member) => ({ _id: String(member._id), name: member.name }))
  }
  return options
}
