import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import { requirePermission } from '../../../middleware/role.js'
import Task from '../../../models/Task.js'
import TaskComment from '../../../models/TaskComment.js'
import Project from '../../../models/Project.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { createNotification } from '../../../lib/notifications.js'
import { requirePermissionOrAssignee } from './middleware.js'

const router = express.Router({ mergeParams: true })

// GET /api/admin/projets/:projectId/tasks/:taskId/comments
router.get('/:projectId/tasks/:taskId/comments', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId as string
    const taskId = req.params.taskId as string
    const task = await Task.findOne({ _id: taskId, project: projectId })
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' })
    }
    const comments = await TaskComment.find({ task: taskId })
      .sort({ createdAt: 1 })
      .populate('author', 'name email')
      .populate('mentions', 'name email')
    return res.json({ comments })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/projets/:projectId/tasks/:taskId/comments
router.post(
  '/:projectId/tasks/:taskId/comments',
  requirePermissionOrAssignee(PERMISSIONS.MANAGE_TASKS),
  body('content').trim().notEmpty().withMessage('Le commentaire ne peut pas être vide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const projectId = req.params.projectId as string
      const taskId = req.params.taskId as string
      const task = await Task.findOne({ _id: taskId, project: projectId })
      if (!task) {
        return res.status(404).json({ error: 'Tâche non trouvée' })
      }

      const { content, mentions } = req.body
      const comment = await TaskComment.create({
        task: taskId,
        author: req.user!.id,
        content,
        mentions: Array.isArray(mentions) ? mentions : [],
      })

      await comment.populate('author', 'name email')
      await comment.populate('mentions', 'name email')

      // Notify mentioned users
      const project = await Project.findById(projectId)
      if (Array.isArray(mentions) && mentions.length > 0) {
        for (const userId of mentions) {
          if (String(userId) !== String(req.user!.id)) {
            await createNotification({
              recipient: userId,
              type: 'TASK_UPDATED',
              title: `Mention dans "${task.title}"`,
              message: `${(req.user as any).name || 'Un collègue'} vous a mentionné dans un commentaire`,
              link: `/admin/projets/${projectId}?tab=tasks`,
            })
          }
        }
      }

      // Notify task assignee if different from commenter
      if (task.assignee && String(task.assignee) !== String(req.user!.id)) {
        const isMentioned = Array.isArray(mentions) && mentions.some((m: any) => String(m) === String(task.assignee))
        if (!isMentioned) {
          await createNotification({
            recipient: task.assignee,
            type: 'TASK_UPDATED',
            title: `Nouveau commentaire sur "${task.title}"`,
            message: `${(req.user as any).name || 'Un collègue'} a commenté la tâche "${task.title}" sur "${project?.name || ''}"`,
            link: `/admin/projets/${projectId}?tab=tasks`,
          })
        }
      }

      return res.status(201).json({ comment })
    } catch (err) {
      return next(err)
    }
  }
)

// DELETE /api/admin/projets/:projectId/tasks/:taskId/comments/:commentId
router.delete('/:projectId/tasks/:taskId/comments/:commentId', requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = req.params.taskId as string
    const commentId = req.params.commentId as string
    const comment = await TaskComment.findOne({ _id: commentId, task: taskId })
    if (!comment) {
      return res.status(404).json({ error: 'Commentaire non trouvé' })
    }
    // Only author or super admin can delete
    if (String(comment.author) !== String(req.user!.id) && req.user!.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Non autorisé' })
    }
    await comment.deleteOne()
    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
