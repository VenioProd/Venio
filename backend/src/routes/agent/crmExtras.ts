import type { Request, Response, NextFunction } from 'express'
import { entityCondition, normalizeEntityList, type GroupEntity } from '../../lib/groupEntities.js'
import User from '../../models/User.js'
import AgentToken from '../../models/AgentToken.js'
import { requireScope } from './_middleware/auth.js'
import { respondError } from './_middleware/errors.js'
import { ADMIN_WILDCARD_SCOPE } from '../../lib/agent/scopes.js'
import { createCrmExtrasRouter } from '../crmExtras.js'

type ScopedAgentRequest = Request & { crmEntities?: GroupEntity[] | null }

export async function loadAgentCrmScope(req: Request, res: Response, next: NextFunction) {
  if (!req.agentToken) return next()
  const scoped = req as ScopedAgentRequest
  scoped.crmEntities = null
  if (!req.agentToken.scopes.includes(ADMIN_WILDCARD_SCOPE)) {
    const token = await AgentToken.findById(req.agentToken.id).select('createdBy').lean()
    if (token?.createdBy) {
      const owner = await User.findById(token.createdBy).select('crmEntities').lean()
      if (!owner) return respondError(res, 403, 'FORBIDDEN', 'Propriétaire du jeton introuvable')
      const entities = normalizeEntityList(owner.crmEntities)
      scoped.crmEntities = entities.length ? entities : null
      // La simulation partagée lit tout le CRM et peut enregistrer des exécutions.
      if (scoped.crmEntities && req.method === 'POST' && /\/rules\/[^/]+\/simulate\/?$/i.test(req.path)) {
        return respondError(res, 403, 'FORBIDDEN', 'Simulation indisponible pour un jeton restreint par entité')
      }
    }
  }
  next()
}

export function agentCrmEntities(req: Request): GroupEntity[] | null {
  return (req as ScopedAgentRequest).crmEntities ?? null
}

export function agentLeadScope(req: Request): Record<string, unknown> {
  const entities = agentCrmEntities(req)
  return entities ? { entity: entityCondition(entities) } : {}
}

/**
 * Équivalent agent des routes CRM enrichies (/api/v1/agent/crm/*).
 * Scopes inchangés : lecture `read:crm`, écriture `write:crm`.
 * Garde-fou : un agent crée des règles en brouillon ; les activer, ou valider/refuser/relancer
 * une exécution, exige `admin:*`.
 */
const router = createCrmExtrasRouter({
  read: [requireScope('read:crm'), loadAgentCrmScope],
  write: [requireScope('write:crm'), loadAgentCrmScope],
  idem: [],
  fail: (res, status, code, message) => void respondError(res, status, code, message),
  // Les vues de l'agent appartiennent à l'utilisateur qui a créé le token, à défaut à un super-admin.
  actor: async (req: Request) => {
    const token = await AgentToken.findById(req.agentToken?.id).select('createdBy').lean()
    const owner = token?.createdBy ?? (await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean())?._id
    return { id: owner ? String(owner) : null, isSuper: true }
  },
  leadScope: agentLeadScope,
  writeScope: agentLeadScope,
  entityScope: agentCrmEntities,
  canActivateRules: (req: Request) => (req.agentToken?.scopes ?? []).includes(ADMIN_WILDCARD_SCOPE),
  // Valider/refuser/relancer une exécution (e-mails en attente de validation humaine) exige aussi `admin:*`.
  canApproveRuns: (req: Request) => (req.agentToken?.scopes ?? []).includes(ADMIN_WILDCARD_SCOPE),
  // Créer, modifier ou activer une séquence exige `admin:*` ; inscrire des leads, `write:crm`.
  canAdministerSequences: (req: Request) => (req.agentToken?.scopes ?? []).includes(ADMIN_WILDCARD_SCOPE),
})

export default router
