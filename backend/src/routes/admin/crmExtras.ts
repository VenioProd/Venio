import type { Request } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { administersCrm, leadScopeFilter } from '../../lib/crmScope.js'
import { createCrmExtrasRouter } from '../crmExtras.js'

/** Vues, actions groupées, export, fiche et règles du CRM — montées sous /api/admin/crm. */
const router = createCrmExtrasRouter({
  read: [auth, requireAdmin, requirePermission(PERMISSIONS.VIEW_CRM)],
  write: [auth, requireAdmin, requirePermission(PERMISSIONS.MANAGE_CRM)],
  idem: [idempotentRequest],
  fail: (res, status, code, message) => void res.status(status).json({ error: message, code }),
  actor: async (req: Request) => ({ id: req.user!.id, isSuper: req.user!.role === 'SUPER_ADMIN' }),
  leadScope: (req: Request) => leadScopeFilter(req),
  writeScope: (req: Request) => (req.user!.role === 'SUPER_ADMIN' ? {} : { $or: [{ assignedTo: req.user!.id }, { createdBy: req.user!.id }] }),
  // Créer, activer, modifier ou supprimer une règle et valider ses exécutions engage
  // tout le groupe : réservé au super-admin et à l'administrateur.
  canActivateRules: (req: Request) => administersCrm(req),
  canAdministerRules: (req: Request) => administersCrm(req),
})

export default router
