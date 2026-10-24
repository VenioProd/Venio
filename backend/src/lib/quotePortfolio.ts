import type { Request } from 'express'
import User from '../models/User.js'
import { userHasPermission } from '../middleware/role.js'
import { PERMISSIONS } from './permissions.js'

/**
 * Portefeuille de devis. Avec `manage_billing`, on chiffre tout. Avec
 * `manage_quotes` seulement, on ne chiffre que ses propres affaires, définies
 * par des liens que l'on ne peut pas s'attribuer soi-même :
 *   - un projet dont on est responsable, ou dont le client nous appartient
 *     (`ownerAdminId`, réassignable par le seul super-admin) ;
 *   - un lead qui nous est assigné, ou dont le compte client nous appartient.
 * Le rattachement d'un projet à un lead (`sourceLead`) ne compte pas : il se
 * déclare librement depuis le CRM.
 */
type ProjectRef = { assignedTo?: unknown; client?: unknown }
type LeadRef = { assignedTo?: unknown; clientAccountId?: unknown }

export interface QuotePortfolio {
  canQuoteProject(project: ProjectRef): boolean
  canQuoteLead(lead: LeadRef): boolean
}

/**
 * Charge en une fois ce qu'il faut pour juger une série de projets et de leads
 * (une page de synchro, un devis). Les comptes clients sont lus d'un coup.
 */
export async function loadQuotePortfolio(
  req: Request,
  items: { projects?: ProjectRef[]; leads?: LeadRef[] } = {},
): Promise<QuotePortfolio> {
  const [billing, quotes] = await Promise.all([
    userHasPermission(req, PERMISSIONS.MANAGE_BILLING),
    userHasPermission(req, PERMISSIONS.MANAGE_QUOTES),
  ])
  if (billing) return { canQuoteProject: () => true, canQuoteLead: () => true }
  if (!quotes) return { canQuoteProject: () => false, canQuoteLead: () => false }

  const me = req.user!.id
  const clientIds = [
    ...(items.projects ?? []).map((project) => project.client),
    ...(items.leads ?? []).map((lead) => lead.clientAccountId),
  ].filter(Boolean)
  const ownedClients = new Set(
    clientIds.length === 0
      ? []
      : (
          await User.find({ _id: { $in: clientIds }, role: 'CLIENT', ownerAdminId: me })
            .select('_id')
            .lean()
        ).map((client) => String(client._id)),
  )
  const owns = (clientId: unknown) => Boolean(clientId) && ownedClients.has(String(clientId))

  return {
    canQuoteProject: (project) => String(project.assignedTo ?? '') === me || owns(project.client),
    canQuoteLead: (lead) => String(lead.assignedTo ?? '') === me || owns(lead.clientAccountId),
  }
}
