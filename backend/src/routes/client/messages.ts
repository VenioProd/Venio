import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import Message from '../../models/Message.js'
import { canEditProject, getProjectAccess } from '../../lib/projectAccess.js'

const router = express.Router()

router.use(auth)

// GET /api/projects/:projectId/messages — list messages for a project
router.get('/:projectId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { projectId } = req.params

    const access = await getProjectAccess(projectId, req.user!.id)
    if (!access) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const messages = await Message.find({ project: projectId })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate('sender', 'name role avatarUrl')

    return res.json({ messages })
  } catch (err) {
    return next(err)
  }
})

// POST /api/projects/:projectId/messages — create message
router.post(
  '/:projectId/messages',
  body('content').trim().notEmpty().withMessage('Le contenu du message est requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== 'CLIENT') {
        return res.status(403).json({ error: 'Forbidden' })
      }

      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const { projectId } = req.params

      const access = await getProjectAccess(projectId, req.user!.id)
      if (!access) {
        return res.status(404).json({ error: 'Projet non trouvé' })
      }
      if (!canEditProject(access)) {
        return res
          .status(403)
          .json({ error: 'Les collaborateurs en lecture seule ne peuvent pas publier de commentaire' })
      }

      const message = await Message.create({
        project: projectId,
        sender: req.user!.id,
        content: req.body.content,
        readBy: [req.user!.id],
      })

      // Mark all messages as read by this client user
      await Message.updateMany(
        { project: projectId, readBy: { $ne: req.user!.id } },
        { $addToSet: { readBy: req.user!.id } },
      )

      const populated = await message.populate('sender', 'name role avatarUrl')
      // Collaboration comments are intentionally in-app only: this endpoint
      // does not send an email, notification, webhook, or other message.
      return res.status(201).json({ message: populated })
    } catch (err) {
      return next(err)
    }
  },
)

// POST /api/projects/:projectId/messages/read — mark all messages as read
router.post('/:projectId/messages/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'CLIENT') {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { projectId } = req.params

    const access = await getProjectAccess(projectId, req.user!.id)
    if (!access) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }
    if (!canEditProject(access)) {
      return res.status(403).json({ error: 'Les collaborateurs en lecture seule ne peuvent pas modifier les messages' })
    }

    await Message.updateMany(
      { project: projectId, readBy: { $ne: req.user!.id } },
      { $addToSet: { readBy: req.user!.id } },
    )

    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
