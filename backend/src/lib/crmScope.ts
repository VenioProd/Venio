import type { Request } from 'express'

/**
 * Le commercial lit tout le CRM ; les écritures restent limitées à ses leads.
 *
 * Vit ici plutôt que dans une route parce que plusieurs routers l'appliquent
 * (le CRM et le journal des échanges) : une règle de sécurité dupliquée finit
 * par diverger.
 */
export function leadScopeFilter(req: Pick<Request, 'user'>): Record<string, unknown> {
  if (req.user!.role === 'SUPER_ADMIN' || req.user!.role === 'COMMERCIAL') return {}
  return { $or: [{ assignedTo: req.user!.id }, { createdBy: req.user!.id }] }
}

export function isLeadOutOfScope(req: Pick<Request, 'user'>, lead: { assignedTo?: unknown; createdBy?: unknown }): boolean {
  if (req.user!.role === 'SUPER_ADMIN') return false
  const userId = req.user!.id
  return lead.assignedTo?.toString() !== userId && lead.createdBy?.toString() !== userId
}
