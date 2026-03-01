import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import AuditLog from '../../models/AuditLog.js'
import { PERMISSIONS } from '../../lib/permissions.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/audit — list audit logs (most recent first)
router.get('/', requirePermission(PERMISSIONS.MANAGE_ADMINS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit: limitStr, page: pageStr, action, email } = req.query as Record<string, string | undefined>
    const limit = Math.min(parseInt(limitStr as string) || 50, 200)
    const page = Math.max(parseInt(pageStr as string) || 1, 1)
    const skip = (page - 1) * limit

    const filter: Record<string, unknown> = {}
    if (action) filter.action = action
    if (email) filter.email = { $regex: email, $options: 'i' }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email role'),
      AuditLog.countDocuments(filter),
    ])

    return res.json({ logs, total, page, pages: Math.ceil(total / limit) })
  } catch (err) {
    return next(err)
  }
})

export default router
