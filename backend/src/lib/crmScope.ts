import type { Request } from 'express'

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

export function canReadLead(req: ScopedRequest, lead: ScopedLead): boolean {
  return readsWholeCrm(req) || !isLeadOutOfScope(req, lead)
}

/** Contrôle d'écriture. */
export function isLeadOutOfScope(req: ScopedRequest, lead: ScopedLead): boolean {
  if (req.user!.role === 'SUPER_ADMIN') return false
  const userId = req.user!.id
  return lead.assignedTo?.toString() !== userId && lead.createdBy?.toString() !== userId
}
