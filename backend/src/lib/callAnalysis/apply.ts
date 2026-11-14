import type { ClientSession, Types } from 'mongoose'
import CallAnalysis, { type ICallAnalysis, type ICallAnalysisDecision } from '../../models/CallAnalysis.js'
import CrmSettings from '../../models/CrmSettings.js'
import Lead from '../../models/Lead.js'
import PersonalTask from '../../models/PersonalTask.js'
import User from '../../models/User.js'
import type { ILead } from '../../types/models/index.js'
import { computeRequestHash } from '../agent/idempotency.js'
import { addPhoneSuppression } from '../callGuards.js'
import { logLeadActivity } from '../crmAutomations.js'
import { applyLeadChange, LeadChangeError } from '../crmLeadService.js'
import { repLeadFilter } from '../externalSales.js'
import { runInTransaction } from '../transaction.js'
import { closingHandoffPatch, logClosingHandoff, notifyClosingHandoff, resolveCloser } from '../closingHandoff.js'
import { checkAssignee, checkSequence, completeEnrollments, notifyHandoffAssignee } from './actions.js'
import { acceptableKeys, coerceFieldValue, currentValue, leadView, mergeList, type ApplyScope } from './fields.js'
import { FIELD_KEYS, HEAT_LEVELS, type FieldKey } from './schema.js'

/**
 * Application d'une analyse par un humain : seul chemin par lequel une
 * proposition atteint le lead. Une transaction écrit le lead (par
 * `applyLeadChange`, source `analysis`), la relecture et une ligne
 * d'historique ; un même `clientRequestId` rejoue la réponse sans réécrire.
 */

// Le closing revient à l'équipe : l'externe s'arrête avant (comme `PATCH /commercial/leads/:id`).
const REP_OPEN_STATUSES = ['LEAD', 'QUALIFIED', 'CONTACTED', 'DEMO', 'LOST']
const NEXT_ACTION_TYPES = ['CALL', 'EMAIL', 'MEETING', 'TASK'] as const

type Action = 'ACCEPT' | 'EDIT' | 'IGNORE'
export interface ApplyBody {
  clientRequestId: string
  fields?: Array<{ key: string; action: Action; value?: unknown }>
  heat?: { action: Action; level?: string }
  actions?: Array<{
    id: string
    action: 'ACCEPT' | 'IGNORE'
    label?: string
    dueAt?: string | null
    /** Action `SEQUENCE` : séquence choisie. */
    sequenceId?: string
    /** Action `HANDOFF` de l'équipe : membre à qui passer la main. */
    assigneeId?: string
  }>
}

interface Context {
  actor: string
  scope: ApplyScope
  /** Périmètre de l'équipe (`teamCallLeadFilter`), repassé dans la transaction ; l'externe a `repLeadFilter`. */
  leadScope?: Record<string, unknown>
}

const fail = (status: number, code: string, message: string, details: Record<string, unknown> = {}) =>
  new LeadChangeError(status, code, message, details)

const UUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i
const ACTIONS: Action[] = ['ACCEPT', 'EDIT', 'IGNORE']

function assertBody(body: ApplyBody): void {
  if (!body || typeof body !== 'object' || typeof body.clientRequestId !== 'string' || !UUID.test(body.clientRequestId))
    throw fail(400, 'INVALID_BODY', 'clientRequestId (UUID) requis')
  const fields = body.fields ?? []
  const actions = body.actions ?? []
  if (!Array.isArray(fields) || !Array.isArray(actions)) throw fail(400, 'INVALID_BODY', 'fields et actions : listes')
  if (fields.some((field) => !field || typeof field.key !== 'string' || !ACTIONS.includes(field.action)))
    throw fail(400, 'INVALID_BODY', 'Décision de champ invalide')
  if (new Set(fields.map((field) => field.key)).size !== fields.length)
    throw fail(400, 'INVALID_BODY', 'Un champ apparaît deux fois')
  if (body.heat !== undefined && (!body.heat || !ACTIONS.includes(body.heat.action)))
    throw fail(400, 'INVALID_BODY', 'Décision de chaleur invalide')
  if (
    actions.some((action) => !action || typeof action.id !== 'string' || !['ACCEPT', 'IGNORE'].includes(action.action))
  )
    throw fail(400, 'INVALID_BODY', 'Décision d’action invalide')
  if (new Set(actions.map((action) => action.id)).size !== actions.length)
    throw fail(400, 'INVALID_BODY', 'Une action apparaît deux fois')
}

function requestHash(body: ApplyBody): string {
  return computeRequestHash({ fields: body.fields ?? [], heat: body.heat ?? null, actions: body.actions ?? [] })
}

const scopedLead = (leadId: unknown, ctx: Context) => ({
  _id: leadId,
  ...(ctx.scope === 'rep' ? repLeadFilter(ctx.actor) : {}),
  ...(ctx.leadScope ? { $and: [ctx.leadScope] } : {}),
})
const leadFilter = (analysis: ICallAnalysis, ctx: Context) => scopedLead(analysis.lead, ctx)

/** Fiche transmise au closer ou sortie du périmètre de l'externe : lecture seule pour lui. */
function assertWritable(lead: ILead, ctx: Context): void {
  if (ctx.scope !== 'rep') return
  if (lead.closingHandoff)
    throw fail(409, 'LEAD_HANDED_OFF', 'Dossier transmis pour closing : la validation revient au closer')
  if (!REP_OPEN_STATUSES.includes(lead.status))
    throw fail(409, 'LEAD_CLOSED', 'Ce lead est entre les mains de l’équipe')
}

type Handoff =
  | { kind: 'closer'; closer: Types.ObjectId | null; recipients: Types.ObjectId[] }
  | { kind: 'member'; assigneeId: string }
  | null

interface Plan {
  patch: Record<string, unknown>
  decisions: ICallAnalysisDecision[]
  tasks: Array<{ title: string; description: string; dueDate: Date }>
  /** Actions `SEQUENCE` et `HANDOFF` acceptées, exécutées après le plan (lib/callAnalysis/actions.ts). */
  sequences: Array<{ id: string; sequenceId: unknown; decision: ICallAnalysisDecision }>
  handoff: { id: string; assigneeId: unknown; decision: ICallAnalysisDecision } | null
  accepted: number
  ignored: number
}

/** Traduit les décisions en écriture ; rien n'est écrit si une seule décision est refusée. */
function planChanges(output: NonNullable<ICallAnalysis['output']>, lead: ILead, body: ApplyBody, ctx: Context): Plan {
  const view = leadView(lead, ctx.scope)
  const allowed = acceptableKeys(ctx.scope)
  const plan: Plan = { patch: {}, decisions: [], tasks: [], sequences: [], handoff: null, accepted: 0, ignored: 0 }
  const decided = new Map((body.fields ?? []).map((field) => [field.key, field]))
  const qualification = { ...(view.qualification as Record<string, unknown>) }

  for (const proposal of output.fields) {
    const decision = decided.get(proposal.key)
    decided.delete(proposal.key)
    const before = currentValue(view, proposal.key)
    if (!decision || decision.action === 'IGNORE') {
      plan.ignored++
      plan.decisions.push({ path: proposal.key, action: 'IGNORE', before, after: before })
      continue
    }
    if (!allowed.includes(proposal.key))
      throw fail(403, 'FIELD_NOT_ALLOWED', `Champ réservé à l’équipe : ${proposal.key}`, { key: proposal.key })
    if (decision.action === 'ACCEPT' && !proposal.quoteVerified)
      throw fail(400, 'QUOTE_NOT_VERIFIED', `Citation introuvable dans le transcript : ${proposal.key}`, {
        key: proposal.key,
      })
    const coerced = coerceFieldValue(proposal.key, decision.action === 'EDIT' ? decision.value : proposal.value)
    if (!coerced.ok) throw fail(400, 'INVALID_VALUE', `Valeur invalide : ${proposal.key}`, { key: proposal.key })
    let after: unknown = coerced.value
    if (proposal.key.startsWith('qualification.')) {
      const name = proposal.key.slice('qualification.'.length)
      // Accepter une liste l'ajoute à celle de la fiche ; la modifier la remplace.
      if (Array.isArray(after) && decision.action === 'ACCEPT') after = mergeList(before as string[], after)
      qualification[name] = after
      plan.patch.qualification = qualification
    } else {
      plan.patch[proposal.key] = after
    }
    plan.accepted++
    plan.decisions.push({ path: proposal.key, action: decision.action, before, after })
  }
  const unknownKey = [...decided.keys()][0]
  if (unknownKey !== undefined)
    throw fail(400, 'UNKNOWN_PROPOSAL', `Aucune proposition pour ${unknownKey}`, {
      key: unknownKey,
      known: FIELD_KEYS.includes(unknownKey as FieldKey),
    })

  // Chaleur : le niveau recalculé par le serveur, ou celui choisi par l'humain.
  const heat = body.heat ?? { action: 'IGNORE' as const }
  const temperatureBefore = view.leadTemperature
  if (heat.action === 'IGNORE') {
    plan.ignored++
    plan.decisions.push({
      path: 'heat',
      action: 'IGNORE',
      before: temperatureBefore,
      after: temperatureBefore,
    })
  } else {
    const level = heat.action === 'EDIT' ? heat.level : output.heat.level
    if (!level || !(HEAT_LEVELS as readonly string[]).includes(level))
      throw fail(400, 'INVALID_VALUE', 'Niveau de chaleur invalide', { key: 'leadTemperature' })
    plan.patch.leadTemperature = level
    plan.accepted++
    plan.decisions.push({ path: 'heat', action: heat.action, before: temperatureBefore, after: level })
  }

  // Actions : prochaine action (la plus proche l'emporte) ou tâche pour l'équipe.
  const decidedActions = new Map((body.actions ?? []).map((action) => [action.id, action]))
  const now = Date.now()
  let next: { at: Date; label: string; type: string; path: string } | null = null
  for (const proposal of output.actions) {
    const decision = decidedActions.get(proposal.id)
    decidedActions.delete(proposal.id)
    const path = `actions.${proposal.id}`
    if (!decision || decision.action === 'IGNORE') {
      plan.ignored++
      plan.decisions.push({ path, action: 'IGNORE', before: null, after: null })
      continue
    }
    if (proposal.type === 'SEQUENCE' || proposal.type === 'HANDOFF') {
      // L'externe n'a pas accès aux séquences du CRM : l'inscription reste à l'équipe.
      if (proposal.type === 'SEQUENCE' && ctx.scope === 'rep')
        throw fail(403, 'ACTION_TEAM_ONLY', 'L’inscription à une séquence revient à l’équipe', { id: proposal.id })
      const decisionRow: ICallAnalysisDecision = { path, action: 'ACCEPT', before: null, after: null }
      if (proposal.type === 'SEQUENCE') {
        if (plan.sequences.length > 0) throw fail(400, 'INVALID_BODY', 'Une seule séquence par relecture')
        plan.sequences.push({ id: proposal.id, sequenceId: decision.sequenceId, decision: decisionRow })
      } else {
        if (plan.handoff) throw fail(400, 'INVALID_BODY', 'Un seul passage de main par relecture')
        plan.handoff = { id: proposal.id, assigneeId: decision.assigneeId, decision: decisionRow }
      }
      plan.accepted++
      plan.decisions.push(decisionRow)
      continue
    }
    if (!(NEXT_ACTION_TYPES as readonly string[]).includes(proposal.type))
      throw fail(400, 'ACTION_NOT_AVAILABLE', `Action ${proposal.type} : exécution non disponible`, { id: proposal.id })
    const label = String(decision.label ?? proposal.label)
      .trim()
      .slice(0, 200)
    const dueRaw = decision.dueAt !== undefined ? decision.dueAt : proposal.dueAt
    const due = dueRaw ? new Date(dueRaw) : null
    if (!label || !due || Number.isNaN(due.getTime()) || due.getTime() <= now)
      throw fail(400, 'ACTION_DUE_REQUIRED', 'Une action acceptée demande un libellé et une échéance future', {
        id: proposal.id,
      })
    plan.accepted++
    if (proposal.type === 'TASK' && ctx.scope === 'team') {
      plan.tasks.push({ title: label, description: proposal.reason, dueDate: due })
      plan.decisions.push({ path, action: 'ACCEPT', before: null, after: { task: label, dueAt: due } })
    } else {
      if (!next || due < next.at) next = { at: due, label, type: proposal.type, path }
      plan.decisions.push({ path, action: 'ACCEPT', before: view.nextActionAt ?? null, after: due })
    }
  }
  const unknownAction = [...decidedActions.keys()][0]
  if (unknownAction !== undefined)
    throw fail(400, 'UNKNOWN_PROPOSAL', `Aucune action ${unknownAction}`, { id: unknownAction })
  if (next) {
    plan.patch.nextActionAt = next.at
    // L'externe n'écrit que la date (repLeadPayload) ; libellé et type restent à l'équipe.
    if (ctx.scope === 'team') {
      plan.patch.nextActionLabel = next.label
      plan.patch.nextActionType = next.type
    }
  }
  return plan
}

/** Forme exposée : sans les champs internes (verrou, empreinte de la requête) ; le relecteur avec son nom. */
async function publicAnalysis(analysis: ICallAnalysis) {
  const reviewer = analysis.review
    ? await User.findById(analysis.review.by).select('name').lean<{ _id: Types.ObjectId; name: string }>()
    : null
  return {
    _id: analysis._id,
    call: analysis.call,
    lead: analysis.lead,
    status: analysis.status,
    model: analysis.model,
    promptVersion: analysis.promptVersion,
    output: analysis.output,
    review: analysis.review
      ? {
          by: { _id: analysis.review.by, name: reviewer?.name ?? '' },
          at: analysis.review.at,
          decisions: analysis.review.decisions,
        }
      : null,
    errorCode: analysis.errorCode,
    error: analysis.error,
    createdAt: analysis.createdAt,
    updatedAt: analysis.updatedAt,
  }
}
export { publicAnalysis }

export async function applyCallAnalysis(analysisId: Types.ObjectId | string, body: ApplyBody, ctx: Context) {
  assertBody(body)
  const clientRequestId = body.clientRequestId.toLowerCase()
  const hash = requestHash(body)

  const replay = async (): Promise<{ lead: ILead; analysis: ICallAnalysis } | null> => {
    const current = await CallAnalysis.findById(analysisId)
    if (!current?.review || current.review.clientRequestId !== clientRequestId) return null
    if (current.review.requestHash !== hash)
      throw fail(409, 'IDEMPOTENCY_CONFLICT', 'Même clientRequestId, décisions différentes')
    // Après un passage de main, la fiche peut être sortie du périmètre : le rejeu la relit par son identifiant.
    const lead = await Lead.findById(current.lead)
    if (!lead) throw fail(404, 'NOT_FOUND', 'Lead not found')
    return { lead, analysis: await completeEnrollments(current, ctx.actor) }
  }
  const replayed = await replay()
  if (replayed) return replayed

  const settings = await CrmSettings.getSettings()
  try {
    const result = await runInTransaction(async (session: ClientSession) => {
      const analysis = await CallAnalysis.findById(analysisId).session(session)
      if (!analysis) throw fail(404, 'NOT_FOUND', 'Analyse introuvable')
      const lead = await Lead.findOne(leadFilter(analysis, ctx)).session(session)
      if (!lead) throw fail(404, 'NOT_FOUND', 'Lead not found')
      assertWritable(lead, ctx)
      if (analysis.status !== 'READY' || !analysis.output) {
        throw ['APPLIED', 'PARTIAL', 'REJECTED'].includes(analysis.status)
          ? fail(409, 'ANALYSIS_ALREADY_REVIEWED', 'Analyse déjà relue')
          : fail(409, 'ANALYSIS_NOT_READY', 'Analyse pas encore prête')
      }

      const plan = planChanges(analysis.output, lead, body, ctx)
      for (const item of plan.sequences) {
        const sequence = await checkSequence(item.sequenceId, lead, session, item.id)
        item.decision.after = { sequenceId: String(sequence._id), sequenceName: sequence.name }
      }
      let handoff: Handoff = null
      if (plan.handoff && ctx.scope === 'rep') {
        // Passage au closer : mêmes effets que « Prêt à closer » (lib/closingHandoff.ts).
        if (lead.status === 'LOST')
          throw fail(409, 'LEAD_NOT_OPEN', 'Seul un lead en cours peut être transmis', { id: plan.handoff.id })
        const { closer, recipients } = await resolveCloser()
        Object.assign(plan.patch, closingHandoffPatch(lead, ctx.actor, closer))
        plan.handoff.decision.after = { closingHandoff: true, closer: closer ? String(closer) : null }
        handoff = { kind: 'closer', closer, recipients }
      } else if (plan.handoff) {
        const assigneeId = checkAssignee(plan.handoff.assigneeId, lead, plan.handoff.id)
        plan.patch.assignedTo = assigneeId
        plan.handoff.decision.before = lead.assignedTo ? String(lead.assignedTo) : null
        const assignee = await User.findById(assigneeId).select('name').session(session).lean<{ name?: string }>()
        plan.handoff.decision.after = { assignedTo: assigneeId, assigneeName: assignee?.name ?? '' }
        handoff = { kind: 'member', assigneeId }
      }
      const now = new Date()
      const status = plan.accepted === 0 ? 'REJECTED' : plan.ignored === 0 ? 'APPLIED' : 'PARTIAL'
      // Garde de concurrence : seule la première relecture passe de READY à son statut final.
      const reviewed = await CallAnalysis.findOneAndUpdate(
        { _id: analysis._id, status: 'READY' },
        {
          $set: {
            status,
            review: { by: ctx.actor, at: now, decisions: plan.decisions, clientRequestId, requestHash: hash },
          },
        },
        { new: true, session },
      )
      if (!reviewed) throw fail(409, 'ANALYSIS_ALREADY_REVIEWED', 'Analyse déjà relue')

      if (plan.accepted > 0) {
        // Le passage de main est gardé comme « Prêt à closer » : pas deux transmissions du même dossier.
        if (handoff?.kind === 'closer') lead.$where = { closingHandoff: null }
        await applyLeadChange(
          lead,
          { ...plan.patch, lastCallAnalysisAt: now },
          {
            actor: ctx.actor,
            source: 'analysis',
            settings,
            session,
            emit: false,
            // Le membre choisi pour reprendre la fiche doit être habilité ; sans réassignation, rien à contrôler.
            validateAssignee: handoff?.kind === 'member',
          },
        )
        if (handoff?.kind === 'closer')
          await logClosingHandoff(lead._id as Types.ObjectId, handoff.closer, ctx.actor, session)
        if (plan.tasks.length > 0) {
          await PersonalTask.create(
            plan.tasks.map((task) => ({ ...task, userId: ctx.actor, leadId: lead._id })),
            { session, ordered: true },
          )
        }
        // Toujours consigné, quel que soit le réglage d'historique : c'est la trace de provenance.
        await logLeadActivity(
          lead._id as Types.ObjectId,
          'CALL_ANALYSIS_APPLIED',
          'Analyse d’appel appliquée',
          {
            analysisId: String(analysis._id),
            callId: String(analysis.call),
            model: analysis.model,
            promptVersion: analysis.promptVersion,
            status,
            fields: plan.decisions.filter((decision) => decision.action !== 'IGNORE'),
            ignored: plan.decisions.filter((decision) => decision.action === 'IGNORE').map((decision) => decision.path),
          },
          ctx.actor,
          session,
        )
      }
      return { lead, analysis: reviewed, handoff }
    })
    // Après validation : notifications, puis inscription par le service des séquences.
    if (result.handoff?.kind === 'closer') {
      const rep = await User.findById(ctx.actor).select('name').lean<{ name?: string }>()
      await notifyClosingHandoff(result.handoff.recipients, result.lead, { id: ctx.actor, name: rep?.name ?? '' })
    } else if (result.handoff?.kind === 'member') {
      await notifyHandoffAssignee(result.handoff.assigneeId, result.lead, ctx.actor)
    }
    return { lead: result.lead, analysis: await completeEnrollments(result.analysis, ctx.actor) }
  } catch (err) {
    // Double envoi concurrent du même clientRequestId : la première relecture a gagné, on la rejoue.
    if (err instanceof LeadChangeError && err.code === 'ANALYSIS_ALREADY_REVIEWED') {
      const again = await replay()
      if (again) return again
    }
    throw err
  }
}

export async function rejectCallAnalysis(analysisId: Types.ObjectId | string, ctx: Context) {
  const analysis = await CallAnalysis.findById(analysisId)
  if (!analysis) throw fail(404, 'NOT_FOUND', 'Analyse introuvable')
  const lead = await Lead.findOne(leadFilter(analysis, ctx))
  if (!lead) throw fail(404, 'NOT_FOUND', 'Lead not found')
  assertWritable(lead, ctx)
  if (analysis.status === 'REJECTED') return analysis
  const rejected = await CallAnalysis.findOneAndUpdate(
    { _id: analysis._id, status: 'READY' },
    { $set: { status: 'REJECTED', review: { by: ctx.actor, at: new Date(), decisions: [] } } },
    { new: true },
  )
  if (!rejected) throw fail(409, 'ANALYSIS_NOT_READY', 'Seule une analyse prête et non relue peut être rejetée')
  return rejected
}

/**
 * Décision humaine sur une opposition détectée. Confirmer inscrit `doNotCall`
 * et le numéro dans la liste d'opposition (protecteur : l'externe le peut, comme avec le résultat « Ne plus appeler ») ;
 * lever l'opposition remet la fiche dans la file et reste à l'équipe.
 */
export async function resolveCallHold(
  leadId: Types.ObjectId | string,
  action: 'CONFIRM' | 'DISMISS',
  ctx: Context & { analysisErased?: boolean },
): Promise<ILead> {
  if (action === 'DISMISS' && ctx.scope === 'rep')
    throw fail(403, 'OPT_OUT_TEAM_ONLY', 'Seule l’équipe peut lever une opposition détectée')
  return runInTransaction(async (session) => {
    const lead = await Lead.findOne(scopedLead(leadId, ctx)).session(session)
    if (!lead) throw fail(404, 'NOT_FOUND', 'Lead not found')
    // Transmise au closer : l'externe garde la lecture, la décision revient à l'équipe.
    if (ctx.scope === 'rep' && lead.closingHandoff)
      throw fail(409, 'LEAD_HANDED_OFF', 'Dossier transmis pour closing : la décision revient au closer')
    if (!lead.callHold) throw fail(409, 'NO_CALL_HOLD', 'Aucune opposition en attente sur cette fiche')
    const hold = {
      analysisId: String(lead.callHold.analysis),
      callId: String(lead.callHold.call),
      // Analyse effacée par une opposition à l'enregistrement : l'équipe décide sur la seule trace de la retenue.
      ...(ctx.analysisErased ? { analysisErased: true } : {}),
    }
    await applyLeadChange(
      lead,
      action === 'CONFIRM' ? { callHold: null, doNotCall: true, nextActionAt: null } : { callHold: null },
      { actor: ctx.actor, source: 'analysis', session, emit: false, validateAssignee: false },
    )
    // L'opposition vaut pour le numéro, pas seulement pour cette fiche (comme « Ne plus appeler »).
    if (action === 'CONFIRM')
      await addPhoneSuppression(String(lead.contactPhone ?? ''), {
        reason: 'OPPOSITION',
        createdBy: ctx.actor,
        leadId: lead._id as Types.ObjectId,
        region: (await CrmSettings.getSettings()).callDefaultRegion,
        session,
      })
    await logLeadActivity(
      lead._id as Types.ObjectId,
      action === 'CONFIRM' ? 'CALL_OPT_OUT_CONFIRMED' : 'CALL_OPT_OUT_DISMISSED',
      action === 'CONFIRM' ? 'Opposition confirmée : ne plus appeler' : 'Opposition levée : fiche remise dans la file',
      hold,
      ctx.actor,
      session,
    )
    return lead
  })
}
