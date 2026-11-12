import type { Request, RequestHandler } from 'express'
import mongoose from 'mongoose'
import Call, { type ICall } from '../models/Call.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import { requirePermission } from '../middleware/role.js'
import { hasPermissionResolved, isAdminRole, PERMISSIONS } from './permissions.js'
import { leadWriteScopeFilter, teamLeadFilter } from './crmScope.js'
import { EXTERNAL_SALES_ROLE, repLeadFilter } from './externalSales.js'
import type { ILead } from '../types/models/index.js'
import type { UserRole } from '../types/enums.js'

/**
 * Périmètre du poste d'appel. Les mêmes routeurs servent le commercial externe
 * (`/api/commercial`) et l'équipe (`/api/admin/call-desk`) ; seul ce périmètre
 * change :
 * - externe : ses fiches (`repLeadFilter`), ses appels ; une fiche transmise au
 *   closer reste lisible mais n'est plus modifiable ;
 * - équipe : son périmètre d'écriture du CRM (`leadWriteScopeFilter`), hors
 *   listes d'appel d'un externe non transmises (`teamLeadFilter`) ; ses appels,
 *   plus ceux de l'externe d'une fiche transmise. `VIEW_CRM` pour lire,
 *   `MANAGE_CRM` pour appeler et écrire.
 * Hors périmètre : 404, comme une fiche inexistante.
 */
export type CallDeskKind = 'rep' | 'team'

type ScopedRequest = Pick<Request, 'user'>

export interface CallDeskScope {
  kind: CallDeskKind
  /** Fiches que l'appelant peut appeler et dont il lit les appels. */
  leadFilter(req: ScopedRequest): Record<string, unknown>
  /** Garde des lectures et des écritures ; l'externe est déjà filtré par son rôle. */
  read: RequestHandler
  write: RequestHandler
}

const pass: RequestHandler = (_req, _res, next) => next()

export const repCallScope: CallDeskScope = {
  kind: 'rep',
  leadFilter: (req) => repLeadFilter(req.user!.id),
  read: pass,
  write: pass,
}

export function teamCallLeadFilter(req: ScopedRequest): Record<string, unknown> {
  return { $and: [leadWriteScopeFilter(req), teamLeadFilter()] }
}

export const teamCallScope: CallDeskScope = {
  kind: 'team',
  leadFilter: teamCallLeadFilter,
  read: requirePermission(PERMISSIONS.VIEW_CRM),
  write: requirePermission(PERMISSIONS.MANAGE_CRM),
}

/**
 * Filtre casté pour un `aggregate` : Mongoose n'y caste rien, et le périmètre de
 * l'équipe compare `assignedTo` / `createdBy` à un identifiant en chaîne.
 */
export function castLeadFilter(filter: Record<string, unknown>): Record<string, unknown> {
  return Lead.find().cast(Lead, filter) as Record<string, unknown>
}

/**
 * Périmètre de l'auteur d'un appel, relu en base au moment où l'opérateur
 * demande la mise en relation : externe actif → ses fiches ; membre actif de
 * l'équipe avec `MANAGE_CRM` → son périmètre d'écriture ; tout le reste → `null`.
 */
export async function callerScope(
  authorId: string,
): Promise<{ kind: CallDeskKind; filter: Record<string, unknown> } | null> {
  if (!mongoose.isObjectIdOrHexString(authorId)) return null
  const user = await User.findOne({ _id: authorId, isActive: true })
    .select('role crmEntities grantedPermissions deniedPermissions')
    .lean<{
      role: UserRole
      crmEntities?: string[]
      grantedPermissions?: string[]
      deniedPermissions?: string[]
    }>()
  if (!user) return null
  if (user.role === EXTERNAL_SALES_ROLE) return { kind: 'rep', filter: repLeadFilter(authorId) }
  if (!isAdminRole(user.role)) return null
  const canCall =
    user.role === 'SUPER_ADMIN' ||
    hasPermissionResolved(
      user.role,
      PERMISSIONS.MANAGE_CRM,
      user.grantedPermissions ?? [],
      user.deniedPermissions ?? [],
    )
  if (!canCall) return null
  const req = { user: { id: authorId, role: user.role, crmEntities: user.crmEntities ?? [] } } as ScopedRequest
  return { kind: 'team', filter: teamCallLeadFilter(req) }
}

/**
 * Donnée d'appel (appel, transcript, analyse) lisible : la sienne, sur une
 * fiche de son périmètre ; pour l'équipe, aussi celle de l'externe d'une fiche
 * transmise au closer. `null` sinon (404).
 */
export async function readableLead(
  req: ScopedRequest,
  scope: CallDeskScope,
  row: { author: unknown; lead: unknown },
): Promise<{ lead: ILead; own: boolean } | null> {
  const lead = await Lead.findOne({ _id: row.lead, ...scope.leadFilter(req) })
  if (!lead) return null
  const own = String(row.author) === String(req.user!.id)
  if (own || readableAuthors(req, scope, lead).includes(String(row.author))) return { lead, own }
  return null
}

/** Filtre d'auteur de la première recherche : l'externe ne cherche que parmi les siens. */
export function authorQuery(req: ScopedRequest, scope: CallDeskScope): Record<string, unknown> {
  return scope.kind === 'rep' ? { author: req.user!.id } : {}
}

export async function findReadableCall(
  req: ScopedRequest,
  scope: CallDeskScope,
  id: unknown,
): Promise<{ call: ICall; lead: ILead; own: boolean } | null> {
  if (!mongoose.isObjectIdOrHexString(id)) return null
  const call = await Call.findOne({ _id: id, ...authorQuery(req, scope) })
  const found = call ? await readableLead(req, scope, call) : null
  return found ? { call: call!, ...found } : null
}

/** Auteurs dont l'appelant lit les appels sur cette fiche. */
export function readableAuthors(
  req: ScopedRequest,
  scope: CallDeskScope,
  lead: Pick<ILead, 'closingHandoff' | 'externalRep'>,
): string[] {
  const me = String(req.user!.id)
  return scope.kind === 'team' && lead.closingHandoff && lead.externalRep ? [me, String(lead.externalRep)] : [me]
}
