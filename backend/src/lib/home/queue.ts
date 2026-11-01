import Decision from '../../models/Decision.js'
import Task from '../../models/Task.js'
import PersonalTask from '../../models/PersonalTask.js'
import InternalTicket from '../../models/InternalTicket.js'
import ChangeRequest from '../../models/ChangeRequest.js'
import Lead from '../../models/Lead.js'
import DevIssue from '../../models/DevIssue.js'

/**
 * File d'actions de l'accueil admin : un seul appel qui agrège les sources
 * existantes (décisions, tâches en retard, tickets, demandes clients, relances
 * CRM, revue dev) et les trie par urgence.
 *
 * Aucune chaîne d'interface ici : le client traduit `kind`, `priority`,
 * `status` et les `meta`. Le périmètre de chaque source est décidé par
 * l'appelant (route admin : permissions de l'utilisateur ; route agent :
 * scopes du token), pour que les deux surfaces partagent la même logique.
 */

export const QUEUE_KINDS = ['decision', 'task', 'ticket', 'request', 'crm', 'dev'] as const
export type QueueKind = (typeof QUEUE_KINDS)[number]
export type QueuePriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type QueueAction = 'approve' | 'improve' | 'reject' | 'complete' | 'postpone' | 'open'

export interface QueueItem {
  /** Composite stable : `${kind}:${sourceId}`. */
  id: string
  kind: QueueKind
  sourceId: string
  title: string
  /** Contexte brut (client, projet, demandeur). Jamais un libellé d'interface. */
  subtitle: string | null
  priority: QueuePriority
  /** Statut d'origine, non traduit (PENDING, OUVERT, SOUMISE, IN_REVIEW…). */
  status: string
  dueAt: string | null
  /** Tickets : échéance de prise en charge (même seuils que l'alerte SLA). */
  slaDueAt: string | null
  overdue: boolean
  dueToday: boolean
  createdAt: string | null
  /** 0–100, plus haut = plus urgent. */
  score: number
  link: string | null
  actions: QueueAction[]
  meta: Record<string, string | number | null>
}

export interface QueueScope {
  /** Sources autorisées pour l'appelant. */
  kinds: ReadonlySet<QueueKind>
  /** Utilisateur humain ; `null` pour un token agent (vue globale, sans actions). */
  userId: string | null
  /** Projets lisibles (`null` : tous), même règle que les routes d'origine. */
  projectIds: string[] | null
  /** Tickets : un non-super-admin ne voit que les siens (route /api/admin/tickets). */
  ownTicketsOnly: boolean
  /** Filtre de périmètre CRM déjà résolu (leadScopeFilter côté admin). */
  leadFilter: Record<string, unknown>
  /** Approve / improve / reject : super-admin uniquement (route d'origine). */
  canDecide: boolean
  /** Statut et échéance d'une tâche projet : manage_tasks (sinon PATCH ignoré). */
  canManageTasks: boolean
  now?: Date
  limit?: number
}

export interface QueueResponse {
  items: QueueItem[]
  counts: Record<'all' | QueueKind, number>
  overdue: number
  dueToday: number
  kinds: QueueKind[]
  generatedAt: string
}

const HOUR = 3_600_000
const DAY = 24 * HOUR
const SOURCE_LIMIT = 100
export const DEFAULT_QUEUE_LIMIT = 50
export const MAX_QUEUE_LIMIT = 200

/** Mêmes seuils que l'automatisation ticket.sla_breach_alert. */
export const TICKET_SLA_HOURS: Record<string, number> = { URGENTE: 4, HAUTE: 4, NORMALE: 24 }

const DONE_TASK_STATUSES = ['TERMINE', 'VALIDE']

const FR_PRIORITY: Record<string, QueuePriority> = {
  BASSE: 'LOW',
  NORMALE: 'NORMAL',
  HAUTE: 'HIGH',
  URGENTE: 'URGENT',
}
const DEV_PRIORITY: Record<string, QueuePriority> = {
  NO_PRIORITY: 'NORMAL',
  LOW: 'LOW',
  MEDIUM: 'NORMAL',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
}

const BASE_SCORE: Record<QueueKind, number> = {
  decision: 40,
  ticket: 35,
  request: 30,
  task: 25,
  crm: 25,
  dev: 20,
}
const PRIORITY_SCORE: Record<QueuePriority, number> = { URGENT: 25, HIGH: 15, NORMAL: 5, LOW: 0 }

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export interface ScoreInput {
  kind: QueueKind
  priority: QueuePriority
  dueAt: Date | null
  slaDueAt: Date | null
  now: Date
}

/**
 * Score d'urgence : type, priorité, retard (borné), échéance du jour ou
 * proche, et SLA de prise en charge. Borné à 0–100.
 */
export function scoreQueueItem({ kind, priority, dueAt, slaDueAt, now }: ScoreInput): number {
  let score = BASE_SCORE[kind] + PRIORITY_SCORE[priority]
  if (dueAt) {
    const today = startOfDay(now).getTime()
    const due = dueAt.getTime()
    if (due < today) {
      const daysLate = Math.ceil((today - due) / DAY)
      score += 25 + Math.min(10, daysLate * 2)
    } else if (due < today + DAY) {
      score += 15
    } else if (due < today + 3 * DAY) {
      score += 8
    }
  }
  if (slaDueAt) {
    const left = slaDueAt.getTime() - now.getTime()
    if (left <= 0) score += 30
    else if (left <= 4 * HOUR) score += 12
  }
  return Math.max(0, Math.min(100, score))
}

function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null
}

interface Draft extends Omit<QueueItem, 'id' | 'score' | 'overdue' | 'dueToday' | 'dueAt' | 'slaDueAt'> {
  dueAt: Date | null
  slaDueAt: Date | null
  /** Retard porté par la date d'échéance (tâches, décisions…) plutôt que le SLA. */
  lateByDue?: boolean
}

function finalize(draft: Draft, now: Date): QueueItem {
  const today = startOfDay(now).getTime()
  const due = draft.dueAt?.getTime() ?? null
  const overdueByDue = due !== null && (draft.lateByDue === false ? due < now.getTime() : due < today)
  const overdueBySla = draft.slaDueAt !== null && draft.slaDueAt.getTime() <= now.getTime()
  const { lateByDue: _ignored, ...rest } = draft
  return {
    ...rest,
    id: `${draft.kind}:${draft.sourceId}`,
    dueAt: iso(draft.dueAt),
    slaDueAt: iso(draft.slaDueAt),
    overdue: overdueByDue || overdueBySla,
    dueToday: due !== null && due >= today && due < today + DAY,
    score: scoreQueueItem({
      kind: draft.kind,
      priority: draft.priority,
      dueAt: draft.dueAt,
      slaDueAt: draft.slaDueAt,
      now,
    }),
  }
}

type Populated = { _id?: unknown; name?: string; companyName?: string; key?: string } | null | undefined

function nameOf(ref: unknown): string | null {
  const p = ref as Populated
  if (!p || typeof p !== 'object') return null
  return p.companyName || p.name || null
}

// ─── Sources ────────────────────────────────────────────────────────────────

async function decisionDrafts(scope: QueueScope): Promise<Draft[]> {
  const rows = await Decision.find({ status: 'PENDING' }).sort({ createdAt: -1 }).limit(SOURCE_LIMIT).lean()
  return rows.map((d) => ({
    kind: 'decision' as const,
    sourceId: String(d._id),
    title: d.title,
    subtitle: d.submittedByName || null,
    priority: FR_PRIORITY[d.priority] ?? 'NORMAL',
    status: d.status,
    dueAt: d.deadline ? new Date(d.deadline) : null,
    slaDueAt: null,
    createdAt: iso(d.createdAt),
    link: '/admin/decisions',
    actions: scope.userId && scope.canDecide ? (['approve', 'improve', 'reject'] as QueueAction[]) : [],
    meta: { category: d.category, requester: d.submittedByName || null },
  }))
}

async function taskDrafts(scope: QueueScope, now: Date): Promise<Draft[]> {
  const today = startOfDay(now)
  const projectFilter: Record<string, unknown> = {
    status: { $nin: DONE_TASK_STATUSES },
    isArchived: { $ne: true },
    dueDate: { $ne: null, $lt: today },
  }
  if (scope.userId) projectFilter.assignee = scope.userId
  if (scope.projectIds !== null) projectFilter.project = { $in: scope.projectIds }

  const [projectTasks, personalTasks] = await Promise.all([
    Task.find(projectFilter).sort({ dueDate: 1 }).limit(SOURCE_LIMIT).populate('project', 'name').lean(),
    scope.userId
      ? PersonalTask.find({
          userId: scope.userId,
          isArchived: false,
          status: { $ne: 'TERMINE' },
          dueDate: { $ne: null, $lt: today },
        })
          .sort({ dueDate: 1 })
          .limit(SOURCE_LIMIT)
          .lean()
      : Promise.resolve([]),
  ])

  const projectActions: QueueAction[] = !scope.userId
    ? []
    : scope.canManageTasks
      ? ['complete', 'postpone', 'open']
      : ['open']

  return [
    ...projectTasks.map((t) => {
      const project = t.project as unknown as Populated
      const projectId = project && typeof project === 'object' && project._id ? String(project._id) : String(t.project)
      return {
        kind: 'task' as const,
        sourceId: String(t._id),
        title: t.title,
        subtitle: nameOf(project),
        priority: FR_PRIORITY[t.priority as string] ?? 'NORMAL',
        status: String(t.status),
        dueAt: t.dueDate ? new Date(t.dueDate) : null,
        slaDueAt: null,
        createdAt: iso((t as { createdAt?: Date }).createdAt),
        link: `/admin/projets/${projectId}`,
        actions: projectActions,
        meta: { source: 'PROJECT', projectId },
      }
    }),
    ...personalTasks.map((t) => ({
      kind: 'task' as const,
      sourceId: String(t._id),
      title: t.title,
      subtitle: null,
      priority: FR_PRIORITY[(t as { priority?: string }).priority ?? ''] ?? 'NORMAL',
      status: String(t.status),
      dueAt: t.dueDate ? new Date(t.dueDate) : null,
      slaDueAt: null,
      createdAt: iso((t as { createdAt?: Date }).createdAt),
      link: null,
      actions: ['complete', 'postpone'] as QueueAction[],
      meta: { source: 'PERSONAL', projectId: null },
    })),
  ]
}

async function ticketDrafts(scope: QueueScope): Promise<Draft[]> {
  const filter: Record<string, unknown> = { isArchived: { $ne: true }, status: { $in: ['OUVERT', 'EN_COURS'] } }
  if (scope.ownTicketsOnly && scope.userId) filter.authorId = scope.userId
  const rows = await InternalTicket.find(filter).sort({ createdAt: -1 }).limit(SOURCE_LIMIT).lean()
  return rows.map((t) => {
    const hours = TICKET_SLA_HOURS[t.priority]
    // Le SLA porte sur la prise en charge : il s'éteint dès que le ticket passe EN_COURS.
    const slaDueAt = t.status === 'OUVERT' && hours ? new Date(new Date(t.createdAt).getTime() + hours * HOUR) : null
    return {
      kind: 'ticket' as const,
      sourceId: String(t._id),
      title: t.title,
      subtitle: t.authorName || null,
      priority: FR_PRIORITY[t.priority] ?? 'NORMAL',
      status: t.status,
      dueAt: null,
      slaDueAt,
      createdAt: iso(t.createdAt),
      link: '/admin/demandes/equipe',
      actions: scope.userId ? (['open'] as QueueAction[]) : [],
      meta: { category: t.category, author: t.authorName || null },
    }
  })
}

async function requestDrafts(scope: QueueScope): Promise<Draft[]> {
  const filter: Record<string, unknown> = { status: { $in: ['SOUMISE', 'A_CHIFFRER'] } }
  if (scope.projectIds !== null) filter.$or = [{ project: null }, { project: { $in: scope.projectIds } }]
  const rows = await ChangeRequest.find(filter)
    .sort({ createdAt: 1 })
    .limit(SOURCE_LIMIT)
    .populate('client', 'name companyName')
    .populate('project', 'name')
    .lean()
  return rows.map((r) => ({
    kind: 'request' as const,
    sourceId: String(r._id),
    title: r.title,
    subtitle: nameOf(r.client) ?? r.createdByName ?? null,
    priority: FR_PRIORITY[r.priority] ?? 'NORMAL',
    status: r.status,
    dueAt: null,
    slaDueAt: null,
    createdAt: iso((r as { createdAt?: Date }).createdAt),
    link: `/admin/demandes-clients/${r._id}`,
    actions: scope.userId ? (['open'] as QueueAction[]) : [],
    meta: { project: nameOf(r.project) },
  }))
}

async function crmDrafts(scope: QueueScope, now: Date): Promise<Draft[]> {
  const endOfToday = new Date(startOfDay(now).getTime() + DAY)
  const rows = await Lead.find({
    $and: [
      scope.leadFilter,
      {
        status: { $nin: ['WON', 'LOST'] },
        archivedAt: null,
        nextActionAt: { $ne: null, $lt: endOfToday },
      },
    ],
  })
    .sort({ nextActionAt: 1 })
    .limit(SOURCE_LIMIT)
    .lean()
  return rows.map((l) => ({
    kind: 'crm' as const,
    sourceId: String(l._id),
    title: l.nextActionLabel || l.company,
    subtitle: l.nextActionLabel ? l.company : ((l as { contactName?: string }).contactName ?? null),
    priority: FR_PRIORITY[l.priority] ?? 'NORMAL',
    status: l.status,
    dueAt: l.nextActionAt ? new Date(l.nextActionAt) : null,
    slaDueAt: null,
    createdAt: iso((l as { createdAt?: Date }).createdAt),
    link: `/admin/crm/leads/${l._id}`,
    actions: scope.userId ? (['open'] as QueueAction[]) : [],
    meta: {
      company: l.company,
      actionType: l.nextActionType || null,
      budget: typeof l.budget === 'number' ? l.budget : null,
    },
    // Une relance a souvent une heure : en retard dès qu'elle est passée.
    lateByDue: false,
  }))
}

async function devDrafts(scope: QueueScope): Promise<Draft[]> {
  const filter: Record<string, unknown> = { archivedAt: null, status: 'IN_REVIEW' }
  // On ne relit pas son propre travail : la revue va aux autres membres.
  if (scope.userId) filter.assignee = { $ne: scope.userId }
  const rows = await DevIssue.find(filter)
    .sort({ updatedAt: 1 })
    .limit(SOURCE_LIMIT)
    .populate('project', 'key name')
    .populate('assignee', 'name')
    .lean()
  return rows.map((i) => ({
    kind: 'dev' as const,
    sourceId: String(i._id),
    title: i.title,
    subtitle: nameOf(i.assignee),
    priority: DEV_PRIORITY[i.priority] ?? 'NORMAL',
    status: i.status,
    dueAt: i.dueDate ? new Date(i.dueDate) : null,
    slaDueAt: null,
    createdAt: iso((i as { createdAt?: Date }).createdAt),
    link: `/admin/dev/issues/${i._id}`,
    actions: scope.userId ? (['open'] as QueueAction[]) : [],
    meta: {
      identifier: i.identifier || null,
      project: nameOf(i.project),
      waitingSince: iso((i as { updatedAt?: Date }).updatedAt),
    },
  }))
}

// ─── Agrégat ────────────────────────────────────────────────────────────────

export function compareQueueItems(a: QueueItem, b: QueueItem): number {
  if (b.score !== a.score) return b.score - a.score
  const ad = a.dueAt ?? a.slaDueAt
  const bd = b.dueAt ?? b.slaDueAt
  if (ad && bd && ad !== bd) return ad < bd ? -1 : 1
  if (ad && !bd) return -1
  if (!ad && bd) return 1
  return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
}

export function clampQueueLimit(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_QUEUE_LIMIT
  return Math.min(MAX_QUEUE_LIMIT, Math.floor(n))
}

export async function buildHomeQueue(scope: QueueScope): Promise<QueueResponse> {
  const now = scope.now ?? new Date()
  const has = (k: QueueKind) => scope.kinds.has(k)
  const none = Promise.resolve([] as Draft[])

  const batches = await Promise.all([
    has('decision') ? decisionDrafts(scope) : none,
    has('task') ? taskDrafts(scope, now) : none,
    has('ticket') ? ticketDrafts(scope) : none,
    has('request') ? requestDrafts(scope) : none,
    has('crm') ? crmDrafts(scope, now) : none,
    has('dev') ? devDrafts(scope) : none,
  ])

  const all = batches.flat().map((d) => finalize(d, now))
  all.sort(compareQueueItems)

  const counts = { all: all.length } as Record<'all' | QueueKind, number>
  for (const k of QUEUE_KINDS) counts[k] = 0
  for (const it of all) counts[it.kind] += 1

  return {
    items: all.slice(0, scope.limit ?? DEFAULT_QUEUE_LIMIT),
    counts,
    overdue: all.filter((it) => it.overdue).length,
    dueToday: all.filter((it) => it.dueToday).length,
    kinds: QUEUE_KINDS.filter((k) => scope.kinds.has(k)),
    generatedAt: now.toISOString(),
  }
}
