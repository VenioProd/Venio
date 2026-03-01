import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { createBackup, listBackups } from '../../lib/backup.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/backups — List available backups
router.get('/', requirePermission(PERMISSIONS.MANAGE_ADMINS), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const backups = listBackups()
    return res.json({ backups })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/backups — Trigger a manual backup
router.post('/', requirePermission(PERMISSIONS.MANAGE_ADMINS), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = createBackup()
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Backup failed' })
    }
    return res.json({ success: true, path: result.path })
  } catch (err) {
    return next(err)
  }
})

export default router
