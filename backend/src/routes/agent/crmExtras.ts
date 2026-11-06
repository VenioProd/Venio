import type { Request } from 'express'
import User from '../../models/User.js'
import AgentToken from '../../models/AgentToken.js'
import { requireScope } from './_middleware/auth.js'
import { respondError } from './_middleware/errors.js'
import { ADMIN_WILDCARD_SCOPE } from '../../lib/agent/scopes.js'
import { createCrmExtrasRouter } from '../crmExtras.js'

/**
 * Équivalent agent des routes CRM enrichies (/api/v1/agent/crm/*).
 * Scopes inchangés : lecture `read:crm`, écriture `write:crm`.
 * Garde-fou : un agent crée des règles en brouillon ; les activer, ou valider/refuser/relancer
 * une exécution, exige `admin:*`.
 */
const router = createCrmExtrasRouter({
  read: [requireScope('read:crm')],
  write: [requireScope('write:crm')],
  idem: [],
  fail: (res, status, code, message) => void respondError(res, status, code, message),
  // Les vues de l'agent appartiennent à l'utilisateur qui a créé le token, à défaut à un super-admin.
  actor: async (req: Request) => {
    const token = await AgentToken.findById(req.agentToken?.id).select('createdBy').lean()
    const owner = token?.createdBy ?? (await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean())?._id
    return { id: owner ? String(owner) : null, isSuper: true }
  },
  leadScope: () => ({}),
  writeScope: () => ({}),
  entityScope: () => null,
  canActivateRules: (req: Request) => (req.agentToken?.scopes ?? []).includes(ADMIN_WILDCARD_SCOPE),
  // Valider/refuser/relancer une exécution (e-mails en attente de validation humaine) exige aussi `admin:*`.
  canApproveRuns: (req: Request) => (req.agentToken?.scopes ?? []).includes(ADMIN_WILDCARD_SCOPE),
  // Créer, modifier ou activer une séquence exige `admin:*` ; inscrire des leads, `write:crm`.
  canAdministerSequences: (req: Request) => (req.agentToken?.scopes ?? []).includes(ADMIN_WILDCARD_SCOPE),
})

export default router
