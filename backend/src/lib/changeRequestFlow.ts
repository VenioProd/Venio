import ChangeRequest, { type IChangeRequest, type IChangeRequestFile } from '../models/ChangeRequest.js'
import AuditLog from '../models/AuditLog.js'
import { logActivity } from './activityLog.js'
import { notifySuperAdmins } from './notifyHelpers.js'
import type { ActivityAction, AuditAction } from '../types/enums.js'

export type ChangeRequestStatus = 'SOUMISE' | 'A_CHIFFRER' | 'PLANIFIEE' | 'EN_COURS' | 'LIVREE' | 'VALIDEE' | 'REFUSEE'

/**
 * Cycle de vie de la spec. VALIDEE et REFUSEE sont terminaux : le fil de
 * discussion reste ouvert, l'état ne bouge plus.
 */
export const ALLOWED_TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  SOUMISE: ['PLANIFIEE', 'A_CHIFFRER', 'REFUSEE'],
  A_CHIFFRER: ['PLANIFIEE', 'REFUSEE'],
  PLANIFIEE: ['EN_COURS'],
  EN_COURS: ['LIVREE'],
  LIVREE: ['VALIDEE', 'EN_COURS'],
  VALIDEE: [],
  REFUSEE: [],
}

export function canTransition(from: ChangeRequestStatus, to: ChangeRequestStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

export interface FlowActor {
  id: string
  name: string
  email: string
}

export function actorFromRequest(user: { id: string; name?: string; email: string }): FlowActor {
  return { id: user.id, name: user.name || user.email, email: user.email }
}

/**
 * Verrou par prédicat d'état : deux transitions concurrentes deviennent
 * mutuellement exclusives, y compris entre processus. Même mécanique que
 * lockProposalForSignature. Renvoie null quand l'état courant a changé.
 */
export async function transitionChangeRequest({
  id,
  from,
  to,
  actor,
  note = '',
  set = {},
  reply,
}: {
  id: string
  from: ChangeRequestStatus
  to: ChangeRequestStatus
  actor: FlowActor
  note?: string
  set?: Record<string, unknown>
  /** Message poussé dans le fil par la même écriture que la transition. */
  reply?: { message: string; attachments?: IChangeRequestFile[] }
}): Promise<IChangeRequest | null> {
  // La table n'aurait aucune valeur si le seul verrou était le prédicat d'état :
  // celui-ci garantit que l'état source est bien celui attendu, pas que la
  // transition demandée existe. Erreur de programmation, donc levée — aucun
  // appelant légitime ne peut produire ce cas.
  if (!canTransition(from, to)) {
    throw new Error(`Transition interdite : ${from} → ${to}`)
  }

  const now = new Date()
  const push: Record<string, unknown> = {
    statusHistory: { status: to, at: now, byUserId: actor.id, byName: actor.name, note },
  }
  if (reply) {
    push.replies = {
      authorId: actor.id,
      authorName: actor.name,
      message: reply.message,
      attachments: reply.attachments ?? [],
      createdAt: now,
    }
  }

  return ChangeRequest.findOneAndUpdate(
    { _id: id, status: from },
    // `status: to` est posé APRÈS `set` : aucun appelant ne peut détourner la
    // cible de la transition par un champ complémentaire.
    { $set: { ...set, status: to }, $push: push },
    { new: true },
  )
}

/**
 * Trace de référence : elle fonctionne aussi pour les demandes sans projet,
 * là où ActivityLog exige un projet. Jamais bloquante.
 */
export function auditChangeRequest({
  action,
  actor,
  changeRequest,
  extra = {},
}: {
  action: AuditAction
  actor: FlowActor
  changeRequest: Pick<IChangeRequest, '_id' | 'project'>
  extra?: Record<string, unknown>
}): void {
  AuditLog.create({
    userId: actor.id,
    email: actor.email,
    action,
    metadata: {
      changeRequestId: String(changeRequest._id),
      projectId: changeRequest.project ? String(changeRequest.project) : null,
      ...extra,
    },
  }).catch(() => {})
}

/** Le fil d'activité projet n'existe que pour une demande rattachée. */
export function logChangeRequestActivity({
  changeRequest,
  action,
  actor,
  summary,
}: {
  changeRequest: Pick<IChangeRequest, '_id' | 'project'>
  action: Extract<ActivityAction, `CHANGE_REQUEST_${string}`>
  actor: FlowActor
  summary: string
}): void {
  if (!changeRequest.project) return
  logActivity({
    project: changeRequest.project,
    action,
    actor: actor.id,
    summary,
    metadata: { changeRequestId: String(changeRequest._id) },
  }).catch(() => {})
}

/**
 * Hook de signature : la demande liée à un devis signé devient PLANIFIEE.
 * Le prédicat `status: 'A_CHIFFRER'` rend l'appel idempotent et sans course ;
 * un devis sans demande liée est un no-op silencieux.
 */
export async function promoteChangeRequestOnSignature(
  proposal: { _id: unknown },
  user: { id: string; name?: string; email: string },
): Promise<IChangeRequest | null> {
  const actor = actorFromRequest(user)
  const promoted = await ChangeRequest.findOneAndUpdate(
    { quoteProposal: proposal._id, status: 'A_CHIFFRER' },
    {
      $set: { status: 'PLANIFIEE' },
      $push: {
        statusHistory: {
          status: 'PLANIFIEE',
          at: new Date(),
          byUserId: actor.id,
          byName: actor.name,
          note: 'Devis signé',
        },
      },
    },
    { new: true },
  )
  if (!promoted) return null

  auditChangeRequest({
    action: 'CHANGE_REQUEST_PLANNED',
    actor,
    changeRequest: promoted,
    extra: { proposalId: String(proposal._id), from: 'A_CHIFFRER', to: 'PLANIFIEE' },
  })
  logChangeRequestActivity({
    changeRequest: promoted,
    action: 'CHANGE_REQUEST_STATUS_CHANGED',
    actor,
    summary: `Demande « ${promoted.title} » planifiée après signature du devis`,
  })
  await notifySuperAdmins({
    type: 'CHANGE_REQUEST_PLANNED',
    title: `Demande planifiée : ${promoted.title}`,
    message: `${actor.name} a signé le devis lié`,
    link: `/admin/demandes-clients/${promoted._id}`,
    metadata: { changeRequestId: String(promoted._id) },
  }).catch(() => {})

  return promoted
}
