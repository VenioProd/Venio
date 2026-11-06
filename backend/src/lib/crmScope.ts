import type { Request } from 'express'
import mongoose from 'mongoose'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import { ADMIN_ROLES } from './permissions.js'
import type { AdminRole } from '../types/enums.js'

/**
 * Périmètre CRM. En lecture, le super-admin et le commercial voient tout le
 * CRM (cadrage de l'espace commercial du 23 octobre 2026) ; les autres rôles,
 * les leads qui leur sont assignés ou qu'ils ont créés. En écriture, seul le
 * super-admin sort de ce périmètre.
 *
 * Vit ici plutôt que dans une route parce que plusieurs routers l'appliquent
 * (le CRM, le journal des échanges, l'app native) : une règle de sécurité
 * dupliquée finit par diverger.
 */
type ScopedRequest = Pick<Request, 'user'>
type ScopedLead = { assignedTo?: unknown; createdBy?: unknown }

export function readsWholeCrm(req: ScopedRequest): boolean {
  return req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'COMMERCIAL'
}

/** Filtre de lecture. */
export function leadScopeFilter(req: ScopedRequest): Record<string, unknown> {
  if (readsWholeCrm(req)) return {}
  return { $or: [{ assignedTo: req.user!.id }, { createdBy: req.user!.id }] }
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
  return readsWholeCrm(req) || !isLeadOutOfScope(req, lead)
}

/** Contrôle d'écriture. */
export function isLeadOutOfScope(req: ScopedRequest, lead: ScopedLead): boolean {
  if (req.user!.role === 'SUPER_ADMIN') return false
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
  const onLead = readsWholeCrm(req)
    ? { project: null }
    : { project: null, leadId: { $in: await Lead.distinct('_id', leadScopeFilter(req)) } }
  return { $or: [onProject, onLead] }
}
