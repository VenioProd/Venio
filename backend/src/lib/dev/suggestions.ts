import mongoose, { type Types } from 'mongoose'
import DevSuggestion, {
  DEV_SUGGESTION_IMPACT_LEVELS,
  DEV_SUGGESTION_STATUSES,
  type DevSuggestionImpactLevel,
  type DevSuggestionStatus,
  type IDevSuggestion,
} from '../../models/DevSuggestion.js'
import DevProject from '../../models/DevProject.js'
import DevIssue, { DEV_ISSUE_STATUSES, type DevIssuePriority } from '../../models/DevIssue.js'
import DevIssueComment from '../../models/DevIssueComment.js'
import DevIssueEvent from '../../models/DevIssueEvent.js'
import { applyIssueResolutionToBetaRuns } from '../beta/promote.js'
import Lead from '../../models/Lead.js'
import User from '../../models/User.js'
import { createIssueWithRetry } from './createIssue.js'
import { applyStatusTimestamps, recordIssueEvent } from './issueMutations.js'
import { notifyUsers } from '../notifyHelpers.js'
import logger from '../logger.js'

const isObjectId = (v: unknown): v is string => typeof v === 'string' && mongoose.isValidObjectId(v)

const IMPACT_TO_PRIORITY: Record<DevSuggestionImpactLevel, DevIssuePriority> = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'URGENT',
}

export interface SuggestionActor {
  /** Utilisateur à l'origine de l'action (null pour un token agent). */
  userId: string | null
  /** Compte système utilisé comme reporter quand userId est null. */
  fallbackReporterId: Types.ObjectId | null
}

export type SuggestionInput = {
  title?: string
  problem?: string
  project?: Types.ObjectId | null
  link?: { kind: 'lead' | 'client'; ref: Types.ObjectId } | null
  requesterName?: string
  requesterUser?: Types.ObjectId | null
  amountEur?: number | null
  level?: DevSuggestionImpactLevel
}

/**
 * Valide un corps de requête (création ou patch). Renvoie soit les champs
 * normalisés, soit un message d'erreur. En création, `title` et `problem`
 * sont requis ; en patch, seuls les champs présents sont retournés.
 */
export async function parseSuggestionBody(
  body: Record<string, unknown> | undefined,
  mode: 'create' | 'patch',
): Promise<{ data: SuggestionInput } | { error: string }> {
  const b = body ?? {}
  const data: SuggestionInput = {}

  if (b.title !== undefined || mode === 'create') {
    const title = typeof b.title === 'string' ? b.title.trim() : ''
    if (!title) return { error: 'title requis' }
    data.title = title.slice(0, 160)
  }
  if (b.problem !== undefined || mode === 'create') {
    const problem = typeof b.problem === 'string' ? b.problem.trim() : ''
    if (!problem) return { error: 'problem requis' }
    data.problem = problem.slice(0, 4000)
  }
  if (b.project !== undefined) {
    if (b.project === null || b.project === '') data.project = null
    else if (!isObjectId(b.project)) return { error: 'project invalide' }
    else {
      if (!(await DevProject.exists({ _id: b.project }))) return { error: 'Projet introuvable' }
      data.project = new mongoose.Types.ObjectId(b.project)
    }
  }
  if (b.link !== undefined) {
    if (b.link === null) data.link = null
    else {
      const link = b.link as { kind?: unknown; ref?: unknown }
      if ((link.kind !== 'lead' && link.kind !== 'client') || !isObjectId(link.ref)) {
        return { error: 'link invalide (kind lead|client, ref ObjectId)' }
      }
      const exists =
        link.kind === 'lead'
          ? await Lead.exists({ _id: link.ref })
          : await User.exists({ _id: link.ref, role: 'CLIENT' })
      if (!exists) return { error: link.kind === 'lead' ? 'Lead introuvable' : 'Client introuvable' }
      data.link = { kind: link.kind, ref: new mongoose.Types.ObjectId(link.ref) }
    }
  }
  if (b.requesterName !== undefined) {
    data.requesterName = typeof b.requesterName === 'string' ? b.requesterName.trim().slice(0, 120) : ''
  }
  if (b.requesterUser !== undefined) {
    if (b.requesterUser === null) data.requesterUser = null
    else if (!isObjectId(b.requesterUser)) return { error: 'requesterUser invalide' }
    else data.requesterUser = new mongoose.Types.ObjectId(b.requesterUser)
  }
  if (b.amountEur !== undefined) {
    if (b.amountEur === null) data.amountEur = null
    else if (typeof b.amountEur !== 'number' || !Number.isFinite(b.amountEur) || b.amountEur < 0) {
      return { error: 'amountEur invalide' }
    } else data.amountEur = Math.round(b.amountEur)
  }
  if (b.level !== undefined) {
    if (typeof b.level !== 'string' || !(DEV_SUGGESTION_IMPACT_LEVELS as readonly string[]).includes(b.level)) {
      return { error: `level invalide (${DEV_SUGGESTION_IMPACT_LEVELS.join('|')})` }
    }
    data.level = b.level as DevSuggestionImpactLevel
  }
  return { data }
}

export function applySuggestionFields(s: IDevSuggestion, data: SuggestionInput): void {
  if (data.title !== undefined) s.title = data.title
  if (data.problem !== undefined) s.problem = data.problem
  if (data.project !== undefined) s.project = data.project
  if (data.link !== undefined) s.link = data.link
  if (data.requesterName !== undefined) s.requester = { user: s.requester?.user ?? null, name: data.requesterName }
  if (data.requesterUser !== undefined) s.requester = { user: data.requesterUser, name: s.requester?.name ?? '' }
  if (data.amountEur !== undefined || data.level !== undefined) {
    s.impact = {
      amountEur: data.amountEur !== undefined ? data.amountEur : (s.impact?.amountEur ?? null),
      level: data.level ?? s.impact?.level ?? 'MEDIUM',
    }
  }
}

/** Filtre + tri de la liste. `sort` : impact (défaut) | votes | recent. */
export function suggestionListQuery(query: Record<string, unknown>) {
  const filter: Record<string, unknown> = {}
  if (query.includeArchived !== 'true') filter.archivedAt = null
  if (typeof query.status === 'string' && (DEV_SUGGESTION_STATUSES as readonly string[]).includes(query.status)) {
    filter.status = query.status
  }
  if (isObjectId(query.project)) filter.project = query.project
  if (isObjectId(query.link)) filter['link.ref'] = query.link
  if (typeof query.q === 'string' && query.q.trim()) {
    const safe = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.$or = [{ title: { $regex: safe, $options: 'i' } }, { problem: { $regex: safe, $options: 'i' } }]
  }
  const sort: Record<string, 1 | -1> =
    query.sort === 'votes'
      ? { voteCount: -1, createdAt: -1 }
      : query.sort === 'recent'
        ? { createdAt: -1 }
        : { 'impact.amountEur': -1, voteCount: -1, createdAt: -1 }
  return { filter, sort }
}

export function serializeSuggestion(s: IDevSuggestion | Record<string, any>, viewerId?: string | null) {
  const o = typeof (s as IDevSuggestion).toObject === 'function' ? (s as IDevSuggestion).toObject() : (s as any)
  const voters: unknown[] = Array.isArray(o.voters) ? o.voters : []
  const { voters: _omit, ...rest } = o
  return {
    ...rest,
    voteCount: voters.length,
    hasVoted: viewerId ? voters.some((v) => String(v) === viewerId) : false,
  }
}

function pushStatus(s: IDevSuggestion, status: DevSuggestionStatus, by: string | null, note: string) {
  s.statusHistory.push({
    status,
    by: by ? new mongoose.Types.ObjectId(by) : null,
    at: new Date(),
    note,
  })
}

export function recordInitialStatus(s: IDevSuggestion, by: string | null) {
  pushStatus(s, 'NEW', by, '')
}

export async function notifyRequester(s: IDevSuggestion, title: string, message: string, actorId?: string | null) {
  const userId = s.requester?.user
  if (!userId) return
  try {
    await notifyUsers([userId], {
      type: 'DEV_SUGGESTION_STATUS_CHANGED',
      title,
      message,
      link: '/admin/dev/workspace?tab=ideas',
      metadata: { suggestionId: String(s._id), status: s.status },
      excludeUserId: actorId ?? undefined,
    })
  } catch (err) {
    logger.warn({ err }, 'dev suggestion: notification demandeur échouée')
  }
}

export async function notifyManagersOfSubmission(s: IDevSuggestion, actorId?: string | null) {
  try {
    const project = s.project ? await DevProject.findById(s.project).select('lead').lean() : null
    const admins = await User.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] }, isActive: true })
      .select('_id')
      .limit(10)
      .lean()
    await notifyUsers([project?.lead, ...admins.map((a) => a._id)], {
      type: 'DEV_SUGGESTION_SUBMITTED',
      title: `Nouvelle suggestion — ${s.title}`,
      message: s.problem.slice(0, 200),
      link: '/admin/dev/workspace?tab=ideas',
      metadata: { suggestionId: String(s._id) },
      excludeUserId: actorId ?? undefined,
    })
  } catch (err) {
    logger.warn({ err }, 'dev suggestion: notification soumission échouée')
  }
}

export type TransitionResult = { ok: true } | { ok: false; error: string; code: string }

/**
 * Change le statut (hors ACCEPTED, qui passe par convertSuggestion). Un refus
 * exige un motif. Notifie le demandeur.
 */
export async function transitionSuggestion(
  s: IDevSuggestion,
  next: DevSuggestionStatus,
  opts: { actorId: string | null; reason?: string | null; note?: string },
): Promise<TransitionResult> {
  if (next === 'ACCEPTED') {
    return { ok: false, code: 'USE_CONVERT', error: 'Accepter une suggestion passe par /convert' }
  }
  if (next === 'REJECTED') {
    const reason = (opts.reason ?? '').trim()
    if (!reason) return { ok: false, code: 'REASON_REQUIRED', error: 'Un refus exige un motif (reason)' }
    s.rejectionReason = reason.slice(0, 2000)
  } else {
    s.rejectionReason = null
  }
  if (s.status === next) return { ok: true }
  s.status = next
  pushStatus(s, next, opts.actorId, opts.note ?? s.rejectionReason ?? '')
  await s.save()
  const label = next === 'REJECTED' ? 'refusée' : next === 'STUDIED' ? 'à l’étude' : 'rouverte'
  await notifyRequester(
    s,
    `Suggestion ${label} — ${s.title}`,
    next === 'REJECTED' ? `Motif : ${s.rejectionReason}` : 'Votre suggestion a été mise à jour.',
    opts.actorId,
  )
  return { ok: true }
}

function buildIssueDescription(s: IDevSuggestion): string {
  const lines = ['## Problème client', s.problem, '']
  if (s.link) lines.push(`**Lié à :** ${s.link.kind === 'lead' ? 'lead' : 'client'} ${s.link.ref}`)
  if (s.requester?.name) lines.push(`**Demandeur :** ${s.requester.name}`)
  const amount = s.impact?.amountEur
  lines.push(`**Impact commercial estimé :** ${s.impact?.level ?? 'MEDIUM'}${amount != null ? ` (${amount} €)` : ''}`)
  lines.push(`**Appuis :** ${s.voters?.length ?? 0}`)
  lines.push('', `_Issue créée depuis la suggestion ${s._id}._`)
  return lines.join('\n')
}

export type ConvertResult =
  | { ok: true; created: boolean; issue: Record<string, any> }
  | { ok: false; error: string; code: string; status: number }

/**
 * Suggestion → DevIssue. Idempotent : si une issue est déjà posée, elle est
 * renvoyée (created=false). `projectId` surcharge le projet de la suggestion.
 */
export async function convertSuggestion(
  s: IDevSuggestion,
  actor: SuggestionActor,
  opts: { projectId?: string | null; assignee?: string | null } = {},
): Promise<ConvertResult> {
  if (s.issue) {
    const existing = await DevIssue.findById(s.issue).lean()
    if (existing) return { ok: true, created: false, issue: existing }
  }
  const projectId = opts.projectId ?? (s.project ? String(s.project) : null)
  if (!projectId || !isObjectId(projectId)) {
    return { ok: false, status: 400, code: 'PROJECT_REQUIRED', error: 'Un projet est requis pour convertir' }
  }
  const project = await DevProject.findById(projectId)
  if (!project) return { ok: false, status: 404, code: 'NOT_FOUND', error: 'Projet introuvable' }
  const reporter = actor.userId ? new mongoose.Types.ObjectId(actor.userId) : actor.fallbackReporterId
  if (!reporter) return { ok: false, status: 500, code: 'NO_ADMIN', error: 'Aucun reporter disponible' }

  const issue = await createIssueWithRetry({
    project: project._id,
    projectKey: project.key,
    title: s.title,
    description: buildIssueDescription(s),
    type: 'FEATURE',
    status: 'BACKLOG',
    priority: IMPACT_TO_PRIORITY[s.impact?.level ?? 'MEDIUM'],
    reporter,
    assignee: opts.assignee && isObjectId(opts.assignee) ? opts.assignee : null,
    labels: ['suggestion'],
    source: { kind: 'manual', name: 'suggestion' },
  })
  await recordIssueEvent({
    issue: issue._id,
    project: issue.project,
    actor: actor.userId ?? reporter,
    type: 'created',
    summary: `Issue ${issue.identifier} créée depuis une suggestion`,
    metadata: { suggestionId: String(s._id) },
  })

  s.issue = issue._id
  s.project = project._id
  s.status = 'ACCEPTED'
  s.rejectionReason = null
  pushStatus(s, 'ACCEPTED', actor.userId, issue.identifier)
  await s.save()
  await notifyRequester(
    s,
    `Suggestion acceptée — ${s.title}`,
    `Elle devient l’issue ${issue.identifier}.`,
    actor.userId,
  )
  return { ok: true, created: true, issue: issue.toObject() }
}

/** Quand une issue issue d'une suggestion passe DONE, prévient le demandeur. */
export async function notifySuggestionDelivered(issueId: string): Promise<void> {
  try {
    const s = await DevSuggestion.findOne({ issue: issueId })
    if (!s) return
    const issue = await DevIssue.findById(issueId).select('identifier').lean()
    await notifyRequester(s, `Suggestion livrée — ${s.title}`, `L’issue ${issue?.identifier ?? ''} est terminée.`)
  } catch (err) {
    logger.warn({ err }, 'dev suggestion: notification livraison échouée')
  }
}

export type BulkAction = 'archive' | 'delete' | 'status' | 'convert' | 'assign'

export interface BulkReport {
  processed: string[]
  failed: Array<{ id: string; error: string }>
}

export function parseBulkIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) return null
  const ids = Array.from(new Set(raw))
  return ids.every(isObjectId) ? (ids as string[]) : null
}

/** Actions groupées sur des suggestions. `delete` est définitif ; `archive` réversible. */
export async function bulkSuggestions(
  ids: string[],
  action: string,
  params: { status?: unknown; reason?: unknown; assignee?: unknown; projectId?: unknown },
  actor: SuggestionActor,
  opts: { allowDelete: boolean },
): Promise<BulkReport | { error: string }> {
  const allowed = opts.allowDelete ? ['archive', 'delete', 'status', 'convert'] : ['archive', 'status', 'convert']
  if (!allowed.includes(action)) return { error: `action invalide (${allowed.join('|')})` }
  if (action === 'status') {
    if (typeof params.status !== 'string' || !['NEW', 'STUDIED', 'REJECTED'].includes(params.status)) {
      return { error: 'status invalide (NEW|STUDIED|REJECTED ; ACCEPTED passe par convert)' }
    }
  }
  const report: BulkReport = { processed: [], failed: [] }
  for (const id of ids) {
    try {
      const s = await DevSuggestion.findById(id)
      if (!s) {
        report.failed.push({ id, error: 'introuvable' })
        continue
      }
      if (action === 'archive') {
        s.archivedAt = new Date()
        await s.save()
      } else if (action === 'delete') {
        await s.deleteOne()
      } else if (action === 'status') {
        const r = await transitionSuggestion(s, params.status as DevSuggestionStatus, {
          actorId: actor.userId,
          reason: typeof params.reason === 'string' ? params.reason : null,
        })
        if (!r.ok) {
          report.failed.push({ id, error: r.error })
          continue
        }
      } else {
        const r = await convertSuggestion(s, actor, {
          projectId: typeof params.projectId === 'string' ? params.projectId : null,
          assignee: typeof params.assignee === 'string' ? params.assignee : null,
        })
        if (!r.ok) {
          report.failed.push({ id, error: r.error })
          continue
        }
      }
      report.processed.push(id)
    } catch (err) {
      report.failed.push({ id, error: err instanceof Error ? err.message : 'erreur' })
    }
  }
  return report
}

/**
 * Actions groupées sur des issues : archive (réversible), delete (définitif,
 * avec commentaires et événements), status, assign. Réutilise les helpers
 * d'événements existants.
 */
export async function bulkIssues(
  ids: string[],
  action: string,
  params: { status?: unknown; assignee?: unknown },
  actorId: string | null,
  opts: { allowDelete: boolean },
): Promise<BulkReport | { error: string }> {
  const allowed = opts.allowDelete ? ['archive', 'delete', 'status', 'assign'] : ['archive', 'status', 'assign']
  if (!allowed.includes(action)) return { error: `action invalide (${allowed.join('|')})` }
  if (action === 'status' && !(typeof params.status === 'string' && (DEV_ISSUE_STATUSES as readonly string[]).includes(params.status))) {
    return { error: 'status invalide' }
  }
  if (action === 'assign' && !(params.assignee === null || isObjectId(params.assignee))) {
    return { error: 'assignee invalide (ObjectId ou null)' }
  }
  const report: BulkReport = { processed: [], failed: [] }
  for (const id of ids) {
    try {
      const issue = await DevIssue.findById(id)
      if (!issue) {
        report.failed.push({ id, error: 'introuvable' })
        continue
      }
      const base = { issue: issue._id, project: issue.project, actor: actorId }
      if (action === 'archive') {
        issue.archivedAt = new Date()
        await issue.save()
        await recordIssueEvent({ ...base, type: 'archived', summary: `${issue.identifier} archivée`, metadata: { bulk: true } })
      } else if (action === 'delete') {
        await DevIssueComment.deleteMany({ issue: issue._id })
        await DevIssueEvent.deleteMany({ issue: issue._id })
        await issue.deleteOne()
      } else if (action === 'status') {
        const from = issue.status
        applyStatusTimestamps(issue, params.status as typeof issue.status)
        await issue.save()
        await recordIssueEvent({
          ...base,
          type: 'status_changed',
          summary: `${issue.identifier} ${from} → ${issue.status}`,
          metadata: { from, to: issue.status, bulk: true },
        })
        if (issue.status === 'DONE') {
          await applyIssueResolutionToBetaRuns(String(issue._id))
          await notifySuggestionDelivered(String(issue._id))
        }
      } else {
        const from = issue.assignee ? String(issue.assignee) : null
        issue.assignee = params.assignee ? new mongoose.Types.ObjectId(params.assignee as string) : null
        await issue.save()
        await recordIssueEvent({
          ...base,
          type: 'assigned',
          summary: `${issue.identifier} assignation modifiée`,
          metadata: { from, to: params.assignee ?? null, bulk: true },
        })
      }
      report.processed.push(id)
    } catch (err) {
      report.failed.push({ id, error: err instanceof Error ? err.message : 'erreur' })
    }
  }
  return report
}
