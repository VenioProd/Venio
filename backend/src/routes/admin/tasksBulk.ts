import express, { type NextFunction, type Request, type Response } from 'express'
import auth from '../../middleware/auth.js'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { accessibleProjectIds } from '../../lib/adminProjectAccess.js'
import { applyTaskBulk, parseTaskBulkBody } from '../../lib/taskBulk.js'
import User from '../../models/User.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

/**
 * POST /api/admin/tasks/bulk
 * { ids: string[] (≤ 200), action: 'delete'|'archive'|'unarchive'|'update', patch?: { status, priority, assignee, dueDate } }
 *
 * Mêmes droits que les routes unitaires de /api/admin/projects/:projectId/tasks :
 * MANAGE_TASKS (le mode « assigné seul » du PATCH, limité à la progression, n'ouvre
 * aucune action groupée) et accès au projet de chaque tâche, évalué tâche par tâche.
 */
router.post(
  '/bulk',
  requirePermission(PERMISSIONS.MANAGE_TASKS),
  idempotentRequest,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = parseTaskBulkBody(req.body)
      if (!parsed.ok) return res.status(400).json({ error: parsed.error })

      if (parsed.patch.assignee) {
        if (!(await User.exists({ _id: parsed.patch.assignee }))) {
          return res.status(400).json({ error: 'assignee introuvable' })
        }
      }

      const user = req.user!
      const accessible = await accessibleProjectIds(user)
      const result = await applyTaskBulk(parsed, {
        actor: { id: user.id, name: (user as { name?: string }).name },
        authorize: (task) => (accessible === null || accessible.includes(String(task.project)) ? null : 'Accès refusé'),
      })
      return res.json(result)
    } catch (err) {
      return next(err)
    }
  },
)

export default router
