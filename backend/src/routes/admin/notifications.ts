import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import Notification from '../../models/Notification.js'
import idempotentRequest from '../../middleware/idempotentRequest.js'
import { applyNotificationBulk, parseNotificationBulkBody } from '../../lib/notificationBulk.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/notifications — list my notifications
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifications = await Notification.find({ recipient: req.user!.id, archivedAt: null })
      .sort({ createdAt: -1 })
      .limit(20)

    return res.json({ notifications })
  } catch (err) {
    return next(err)
  }
})

// GET /api/admin/notifications/unread-count
router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user!.id, isRead: false, archivedAt: null })
    return res.json({ count })
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/admin/notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user!.id },
      { isRead: true },
      { new: true }
    )
    if (!notification) {
      return res.status(404).json({ error: 'Notification non trouvée' })
    }
    return res.json({ notification })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/notifications/read-all
router.post('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Notification.updateMany(
      { recipient: req.user!.id, isRead: false },
      { isRead: true }
    )
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// GET /api/admin/notifications/all?view=active|archived&skip=&limit= — liste complète de mes notifications
router.get('/all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const archived = req.query.view === 'archived'
    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? ''), 10) || 100, 1), 200)
    const skip = Math.max(Number.parseInt(String(req.query.skip ?? ''), 10) || 0, 0)
    const filter = { recipient: req.user!.id, archivedAt: archived ? { $ne: null } : null }
    const [notifications, total] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
    ])
    return res.json({ notifications, total })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/notifications/bulk — { ids (≤ 200), action: read|unread|archive|unarchive|delete }
// Une notification n'appartient qu'à son destinataire : celles des autres sont reportées dans `failed`.
router.post('/bulk', idempotentRequest, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = parseNotificationBulkBody(req.body)
    if (!parsed.ok) return res.status(400).json({ error: parsed.error })
    return res.json(await applyNotificationBulk(parsed, { recipient: req.user!.id }))
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/notifications/delete-read — supprime mes notifications lues ({ view?: 'active'|'archived' })
router.post('/delete-read', idempotentRequest, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const archived = req.body?.view === 'archived'
    const result = await Notification.deleteMany({
      recipient: req.user!.id,
      isRead: true,
      archivedAt: archived ? { $ne: null } : null,
    })
    return res.json({ success: true, deleted: result.deletedCount })
  } catch (err) {
    return next(err)
  }
})

export default router
