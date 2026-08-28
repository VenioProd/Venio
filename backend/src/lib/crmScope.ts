import type { Request } from 'express'

/**
 * Périmètre CRM : un non super-admin ne voit que les leads qui lui sont
 * assignés ou qu'il a créés.
 *
 * Vit ici plutôt que dans une route parce que plusieurs routers l'appliquent
 * (le CRM et le journal des échanges) : une règle de sécurité dupliquée finit
 * par diverger.
 */
export function leadScopeFilter(req: Request): Record<string, unknown> {
  if (req.user!.role === 'SUPER_ADMIN') return {}
  return { $or: [{ assignedTo: req.user!.id }, { createdBy: req.user!.id }] }
}

export function isLeadOutOfScope(req: Request, lead: { assignedTo?: unknown; createdBy?: unknown }): boolean {
  if (req.user!.role === 'SUPER_ADMIN') return false
  const userId = req.user!.id
  return lead.assignedTo?.toString() !== userId && lead.createdBy?.toString() !== userId
}
