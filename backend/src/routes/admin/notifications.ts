import express, { Request, Response, NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import Notification from '../../models/Notification.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/notifications — list my notifications
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifications = await Notification.find({ recipient: req.user!.id })
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
    const count = await Notification.countDocuments({ recipient: req.user!.id, isRead: false })
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

export default router
