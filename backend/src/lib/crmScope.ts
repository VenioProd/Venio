import type { Request } from 'express'
import mongoose from 'mongoose'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import { ADMIN_ROLES } from './permissions.js'
import type { AdminRole } from '../types/enums.js'
import {
  entityCondition,
  entityFromProject,
  isGroupEntity,
  leadEntityOf,
  normalizeEntityList,
  type GroupEntity,
} from './groupEntities.js'

/**
 * Périmètre CRM. En lecture, le super-admin, l'administrateur et le
 * commercial voient tout le CRM (cadrage de l'espace commercial du 23 octobre
 * 2026, étendu à l'administrateur le 6 novembre 2026) ; les autres rôles, les
 * leads qui leur sont assignés ou qu'ils ont créés. En écriture, le
 * super-admin et l'administrateur sortent de ce périmètre ; le commercial
 * n'écrit que sur ses leads.
 *
 * Vit ici plutôt que dans une route parce que plusieurs routers l'appliquent
 * (le CRM, le journal des échanges, l'app native) : une règle de sécurité
 * dupliquée finit par diverger.
 *
 * Périmètre par entité du groupe : un utilisateur dont `crmEntities` n'est
 * pas vide ne lit et n'écrit que les leads de ces entités, EN PLUS des règles
 * ci-dessus. Le super-admin n'est jamais restreint ; l'administrateur l'est
 * si sa liste est posée ; une liste vide laisse le comportement inchangé.
 */
type ScopedRequest = Pick<Request, 'user'>
type ScopedLead = { assignedTo?: unknown; createdBy?: unknown; entity?: unknown }

/** Champs à sélectionner pour pouvoir appliquer `canReadLead` / `isLeadOutOfScope`. */
export const LEAD_SCOPE_FIELDS = 'assignedTo createdBy entity'

/** Lit tout le CRM selon son rôle (les entités peuvent encore le restreindre). */
export function readsWholeCrm(req: ScopedRequest): boolean {
  const role = req.user!.role
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'COMMERCIAL'
}

/**
 * Écrit sur tout le CRM selon son rôle (les entités peuvent encore restreindre
 * l'administrateur). Plus étroit que la lecture : le commercial lit tout mais
 * n'écrit que sur ses leads.
 */
export function writesWholeCrm(req: ScopedRequest): boolean {
  const role = req.user!.role
  return role === 'SUPER_ADMIN' || role === 'ADMIN'
}

/** Entités auxquelles l'utilisateur est restreint ; `null` : aucune restriction. */
export function crmEntityRestriction(req: ScopedRequest): GroupEntity[] | null {
  if (req.user!.role === 'SUPER_ADMIN') return null
  const entities = normalizeEntityList(req.user!.crmEntities)
  return entities.length > 0 ? entities : null
}

/** Lit tout le CRM, sans restriction d'entité : aucun filtre à appliquer. */
export function readsUnrestrictedCrm(req: ScopedRequest): boolean {
  return readsWholeCrm(req) && crmEntityRestriction(req) === null
}

function entityAllowed(req: ScopedRequest, lead: ScopedLead): boolean {
  const entities = crmEntityRestriction(req)
  return entities === null || entities.includes(leadEntityOf(lead))
}

function withEntityRestriction(req: ScopedRequest, filter: Record<string, unknown>): Record<string, unknown> {
  const entities = crmEntityRestriction(req)
  return entities === null ? filter : { ...filter, entity: entityCondition(entities) }
}

/** Filtre de lecture. */
export function leadScopeFilter(req: ScopedRequest): Record<string, unknown> {
  if (readsWholeCrm(req)) return withEntityRestriction(req, {})
  return withEntityRestriction(req, { $or: [{ assignedTo: req.user!.id }, { createdBy: req.user!.id }] })
}

/** Filtre d'écriture (actions groupées) : plus étroit que la lecture. */
export function leadWriteScopeFilter(req: ScopedRequest): Record<string, unknown> {
  if (req.user!.role === 'SUPER_ADMIN') return {}
  if (writesWholeCrm(req)) return withEntityRestriction(req, {})
  return withEntityRestriction(req, { $or: [{ assignedTo: req.user!.id }, { createdBy: req.user!.id }] })
}

/**
 * Filtre `?entity=` d'une liste, combiné au périmètre déjà posé sur `filter`.
 * Une valeur inconnue est ignorée ; une entité hors périmètre ne renvoie rien.
 */
export function applyEntityQuery(req: ScopedRequest, filter: Record<string, unknown>, raw: unknown): void {
  if (!isGroupEntity(raw)) return
  const entities = crmEntityRestriction(req)
  filter.entity = entities === null || entities.includes(raw) ? entityCondition([raw]) : { $in: [] }
}

/**
 * Contrôle d'écriture de l'entité d'un lead créé ou modifié par un utilisateur
 * restreint. Sans entité demandée à la création, l'entité déduite du projet
 * est gardée si elle est permise, sinon la première entité du périmètre.
 * Renvoie `false` si l'entité visée sort du périmètre (rien n'est écrit).
 * Complète `payload.entity` à la création.
 */
export function resolveWriteEntity(
  req: ScopedRequest,
  payload: Record<string, any>,
  existing: ScopedLead | null = null,
): boolean {
  const entities = crmEntityRestriction(req)
  if (entities === null) return true
  if (payload.entity === undefined) {
    if (existing) return true
    const inferred = entityFromProject(payload.project)
    payload.entity = entities.includes(inferred) ? inferred : entities[0]
    return true
  }
  return entities.includes(payload.entity)
}

/**
 * Gouvernance du CRM : réglages globaux (destinataires des rapports, escalade,
 * closer…), règles d'automatisation et validation de leurs exécutions. Ces
 * gestes engagent tout le groupe ; ils sont réservés au super-admin et à
 * l'administrateur, en plus de la permission `manage_crm` exigée par la route.
 */
export function administersCrm(req: ScopedRequest): boolean {
  return req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'ADMIN'
}

/** Rôles auxquels un lead peut être attribué : l'équipe, sans les profils en lecture seule ni la comptabilité. */
export const CRM_ASSIGNABLE_ROLES: AdminRole[] = ADMIN_ROLES.filter((role) => role !== 'VIEWER' && role !== 'COMPTABLE')

/** Vrai si `id` désigne un utilisateur actif de l'équipe à qui l'on peut confier un lead. */
export async function isAssignableCrmUser(id: unknown): Promise<boolean> {
  if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) return false
  return Boolean(await User.exists({ _id: id, role: { $in: CRM_ASSIGNABLE_ROLES }, isActive: true }))
}

export function canReadLead(req: ScopedRequest, lead: ScopedLead): boolean {
  return (readsWholeCrm(req) && entityAllowed(req, lead)) || !isLeadOutOfScope(req, lead)
}

/** Contrôle d'écriture. */
export function isLeadOutOfScope(req: ScopedRequest, lead: ScopedLead): boolean {
  if (req.user!.role === 'SUPER_ADMIN') return false
  if (!entityAllowed(req, lead)) return true
  if (writesWholeCrm(req)) return false
  const userId = req.user!.id
  return lead.assignedTo?.toString() !== userId && lead.createdBy?.toString() !== userId
}

/**
 * Devis lisibles : ceux des projets lisibles (`null` : tous), et ceux portés
 * par un lead seul, à condition que le lead soit dans le périmètre CRM. Servi
 * au web comme à la synchro de l'app native.
 */
export async function readableProposalFilter(
  req: ScopedRequest,
  readableProjectIds: string[] | null,
): Promise<Record<string, unknown>> {
  const onProject = readableProjectIds === null ? { project: { $ne: null } } : { project: { $in: readableProjectIds } }
  const onLead = readsUnrestrictedCrm(req)
    ? { project: null }
    : { project: null, leadId: { $in: await Lead.distinct('_id', leadScopeFilter(req)) } }
  return { $or: [onProject, onLead] }
}
