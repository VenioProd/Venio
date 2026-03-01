import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import Project from '../../models/Project.js'
import Message from '../../models/Message.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/projects/:projectId/messages — list messages for a project
router.get('/:projectId/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params

    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const messages = await Message.find({ project: projectId })
      .sort({ createdAt: 1 })
      .limit(100)
      .populate('sender', 'name email role')

    return res.json({ messages })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/projects/:projectId/messages — create message
router.post(
  '/:projectId/messages',
  body('content').trim().notEmpty().withMessage('Le contenu du message est requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const { projectId } = req.params

      const project = await Project.findById(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Projet non trouvé' })
      }

      const message = await Message.create({
        project: projectId,
        sender: req.user!.id,
        content: req.body.content,
        readBy: [req.user!.id],
      })

      // Mark all messages as read by this admin user
      await Message.updateMany(
        { project: projectId, readBy: { $ne: req.user!.id } },
        { $addToSet: { readBy: req.user!.id } }
      )

      const populated = await message.populate('sender', 'name email role')

      return res.status(201).json({ message: populated })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/admin/projects/:projectId/messages/read — mark all messages as read
router.post('/:projectId/messages/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params

    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    await Message.updateMany(
      { project: projectId, readBy: { $ne: req.user!.id } },
      { $addToSet: { readBy: req.user!.id } }
    )

    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
