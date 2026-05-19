import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import { buildInbox } from '../../lib/inbox/aggregator.js'
import InboxSnooze from '../../models/InboxSnooze.js'
import InboxPin from '../../models/InboxPin.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

// GET /api/admin/inbox?includeSnoozed=true
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id
    const includeSnoozed = req.query.includeSnoozed === 'true'
    const inbox = await buildInbox(userId, { includeSnoozed })
    res.json(inbox)
  } catch (e) { next(e) }
})

// POST /api/admin/inbox/snooze
// body: { itemType: string, sourceId: string, snoozedUntil: ISO date string }
router.post('/snooze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemType, sourceId, snoozedUntil } = req.body
    if (!itemType || !sourceId || !snoozedUntil) {
      return res.status(400).json({ error: 'itemType, sourceId, snoozedUntil required' })
    }
    const until = new Date(snoozedUntil)
    if (isNaN(until.getTime())) {
      return res.status(400).json({ error: 'snoozedUntil must be a valid ISO date' })
    }
    const snooze = await InboxSnooze.findOneAndUpdate(
      { userId: req.user!.id, itemType, sourceId },
      { snoozedUntil: until },
      { upsert: true, new: true }
    )
    res.json(snooze)
  } catch (e) { next(e) }
})

// DELETE /api/admin/inbox/snooze/:itemType/:sourceId
router.delete('/snooze/:itemType/:sourceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await InboxSnooze.deleteOne({
      userId: req.user!.id,
      itemType: req.params.itemType,
      sourceId: req.params.sourceId,
    })
    res.status(204).send()
  } catch (e) { next(e) }
})

// POST /api/admin/inbox/pin — body: { refType, refId, title, link, color?, expiresAt? }
router.post('/pin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refType, refId, title, link, color, expiresAt } = req.body
    if (!refType || !refId || !title || !link) {
      return res.status(400).json({ error: 'refType, refId, title, link required' })
    }
    const pin = await InboxPin.create({
      userId: req.user!.id,
      refType,
      refId,
      title,
      link,
      color,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    })
    res.status(201).json(pin)
  } catch (e) { next(e) }
})

// DELETE /api/admin/inbox/pin/:id
router.delete('/pin/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await InboxPin.deleteOne({ _id: req.params.id, userId: req.user!.id })
    res.status(204).send()
  } catch (e) { next(e) }
})

export default router
