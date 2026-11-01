import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import { PERMISSIONS, hasPermissionResolved } from '../../lib/permissions.js'
import { readableProjectIds } from '../../lib/adminProjectAccess.js'
import { leadScopeFilter } from '../../lib/crmScope.js'
import { buildHomeQueue, clampQueueLimit, type QueueKind } from '../../lib/home/queue.js'
import User from '../../models/User.js'
import type { Permission, UserRole } from '../../types/enums.js'

/**
 * Accueil admin.
 *
 * GET /api/admin/home/queue — file d'actions unifiée. Chaque source n'est
 * incluse que si l'utilisateur y a accès par sa route d'origine :
 *   - décisions          : super-admin (seul habilité à trancher)
 *   - tâches en retard   : les siennes (tâches projet assignées + tâches perso),
 *                          bornées aux projets lisibles
 *   - tickets            : view_tickets ; un non-super-admin ne voit que les siens
 *   - demandes clients   : view_change_requests, projets lisibles
 *   - relances CRM       : view_crm, périmètre CRM, relances qui lui reviennent
 *   - revue dev          : view_dev, issues IN_REVIEW dont il n'est pas l'assigné
 */

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

router.get('/queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user!
    const role = user.role as UserRole
    const account = await User.findById(user.id).select('grantedPermissions deniedPermissions').lean()
    const can = (p: Permission) =>
      hasPermissionResolved(role, p, account?.grantedPermissions ?? [], account?.deniedPermissions ?? [])

    const kinds = new Set<QueueKind>(['task'])
    if (role === 'SUPER_ADMIN') kinds.add('decision')
    if (can(PERMISSIONS.VIEW_TICKETS)) kinds.add('ticket')
    if (can(PERMISSIONS.VIEW_CHANGE_REQUESTS)) kinds.add('request')
    if (can(PERMISSIONS.VIEW_CRM)) kinds.add('crm')
    if (can(PERMISSIONS.VIEW_DEV)) kinds.add('dev')

    const queue = await buildHomeQueue({
      kinds,
      userId: user.id,
      projectIds: await readableProjectIds(user),
      ownTicketsOnly: role !== 'SUPER_ADMIN',
      leadFilter: {
        $and: [leadScopeFilter(req), { $or: [{ assignedTo: user.id }, { assignedTo: null, createdBy: user.id }] }],
      },
      canDecide: role === 'SUPER_ADMIN',
      canManageTasks: can(PERMISSIONS.MANAGE_TASKS),
      limit: clampQueueLimit(req.query.limit),
    })
    res.json(queue)
  } catch (err) {
    next(err)
  }
})

export default router
