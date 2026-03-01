import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import Task from '../../models/Task.js'
import TaskComment from '../../models/TaskComment.js'
import Project from '../../models/Project.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { createNotification } from '../../lib/notifications.js'
import { logActivity } from '../../lib/activityLog.js'
import { sendTaskAssignedEmail } from '../../lib/email.js'
import User from '../../models/User.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const TASK_STATUSES = ['A_FAIRE', 'EN_COURS', 'EN_REVIEW', 'TERMINE']
const TASK_PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']

// GET /api/admin/projects/:projectId/tasks
router.get('/:projectId/tasks', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId as string
    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const tasks = await Task.find({ project: projectId })
      .sort({ status: 1, order: 1 })
      .populate('assignee', 'name email')
      .populate('createdBy', 'name email')

    return res.json({ tasks })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/projects/:projectId/tasks
router.post(
  '/:projectId/tasks',
  requirePermission(PERMISSIONS.MANAGE_TASKS),
  body('title').trim().notEmpty().withMessage('Le titre est requis'),
  body('status').optional().isIn(TASK_STATUSES).withMessage('Statut invalide'),
  body('priority').optional().isIn(TASK_PRIORITIES).withMessage('Priorité invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const projectId = req.params.projectId as string
      const project = await Project.findById(projectId)
      if (!project) {
        return res.status(404).json({ error: 'Projet non trouvé' })
      }

      const { title, description, status, priority, assignee, dueDate, tags } = req.body

      // Auto-order: put at end of the target column
      const targetStatus = status || 'A_FAIRE'
      const lastTask = await Task.findOne({ project: projectId, status: targetStatus }).sort({ order: -1 })
      const order = lastTask ? lastTask.order + 1 : 0

      const task = await Task.create({
        project: projectId,
        title,
        description: description || '',
        status: targetStatus,
        priority: priority || 'NORMALE',
        assignee: assignee || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string' && (t as string).trim()) : [],
        order,
        createdBy: req.user!.id,
      })

      await task.populate('assignee', 'name email')
      await task.populate('createdBy', 'name email')

      await logActivity({ project: projectId, action: 'TASK_CREATED', actor: req.user!.id, summary: `Tâche créée : ${title}`, metadata: { taskId: task._id, title } })

      // Notify assignee if set and different from creator
      if (assignee && String(assignee) !== String(req.user!.id)) {
        await createNotification({
          recipient: assignee,
          type: 'TASK_ASSIGNED',
          title: `Nouvelle tâche : ${title}`,
          message: `Vous avez été assigné à la tâche "${title}" sur le projet "${project.name}"`,
          link: `/admin/projects/${projectId}?tab=tasks`,
        })
        // Send email
        const assigneeUser = await User.findById(assignee)
        if (assigneeUser?.email) {
          sendTaskAssignedEmail({
            to: assigneeUser.email,
            assigneeName: assigneeUser.name || assigneeUser.email,
            taskTitle: title,
            projectName: project.name,
            projectId,
            assignedBy: (req.user as any).name || 'Un administrateur',
          }).catch(() => {})
        }
      }

      return res.status(201).json({ task })
    } catch (err) {
      return next(err)
    }
  }
)

// PATCH /api/admin/projects/:projectId/tasks/:taskId
router.patch(
  '/:projectId/tasks/:taskId',
  requirePermission(PERMISSIONS.MANAGE_TASKS),
  body('title').optional().trim().notEmpty().withMessage('Le titre ne peut pas être vide'),
  body('status').optional().isIn(TASK_STATUSES).withMessage('Statut invalide'),
  body('priority').optional().isIn(TASK_PRIORITIES).withMessage('Priorité invalide'),
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

      const { title, description, status, priority, assignee, dueDate, tags } = req.body
      const oldAssignee = task.assignee ? String(task.assignee) : null

      if (title !== undefined) task.title = title
      if (description !== undefined) task.description = description
      if (status !== undefined) task.status = status
      if (priority !== undefined) task.priority = priority
      if (assignee !== undefined) task.assignee = assignee || null
      if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : null
      if (tags !== undefined) task.tags = Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string' && (t as string).trim()) : []

      await task.save()
      await task.populate('assignee', 'name email')
      await task.populate('createdBy', 'name email')

      await logActivity({ project: projectId, action: 'TASK_UPDATED', actor: req.user!.id, summary: `Tâche modifiée : ${task.title}`, metadata: { taskId: task._id } })

      // Notify new assignee if changed
      const newAssignee = task.assignee ? String((task.assignee as any)._id || task.assignee) : null
      if (newAssignee && newAssignee !== oldAssignee && newAssignee !== String(req.user!.id)) {
        const project = await Project.findById(projectId)
        await createNotification({
          recipient: newAssignee,
          type: 'TASK_ASSIGNED',
          title: `Tâche assignée : ${task.title}`,
          message: `Vous avez été assigné à la tâche "${task.title}" sur le projet "${project?.name || ''}"`,
          link: `/admin/projects/${projectId}?tab=tasks`,
        })
        const assigneeUser = await User.findById(newAssignee)
        if (assigneeUser?.email) {
          sendTaskAssignedEmail({
            to: assigneeUser.email,
            assigneeName: assigneeUser.name || assigneeUser.email,
            taskTitle: task.title,
            projectName: project?.name || '',
            projectId,
            assignedBy: (req.user as any).name || 'Un administrateur',
          }).catch(() => {})
        }
      }

      return res.json({ task })
    } catch (err) {
      return next(err)
    }
  }
)

// PATCH /api/admin/projects/:projectId/tasks/:taskId/move — drag-drop
router.patch('/:projectId/tasks/:taskId/move', requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId as string
    const taskId = req.params.taskId as string
    const { status, order } = req.body

    if (!TASK_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Statut invalide' })
    }

    const task = await Task.findOne({ _id: taskId, project: projectId })
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' })
    }

    const oldStatus = task.status
    task.status = status
    task.order = typeof order === 'number' ? order : 0
    await task.save()
    await task.populate('assignee', 'name email')
    await task.populate('createdBy', 'name email')

    if (oldStatus !== status) {
      await logActivity({ project: projectId, action: 'TASK_MOVED', actor: req.user!.id, summary: `Tâche "${task.title}" déplacée de ${oldStatus} à ${status}`, metadata: { taskId: task._id, from: oldStatus, to: status } })
    }

    return res.json({ task })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/admin/projects/:projectId/tasks/:taskId
router.delete('/:projectId/tasks/:taskId', requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId as string
    const taskId = req.params.taskId as string
    const task = await Task.findOneAndDelete({ _id: taskId, project: projectId })
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' })
    }

    await logActivity({ project: projectId, action: 'TASK_DELETED', actor: req.user!.id, summary: `Tâche supprimée : ${task.title}` })

    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

// ─── Task Comments ───

// GET /api/admin/projects/:projectId/tasks/:taskId/comments
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

// POST /api/admin/projects/:projectId/tasks/:taskId/comments
router.post(
  '/:projectId/tasks/:taskId/comments',
  requirePermission(PERMISSIONS.MANAGE_TASKS),
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
              link: `/admin/projects/${projectId}?tab=tasks`,
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
            link: `/admin/projects/${projectId}?tab=tasks`,
          })
        }
      }

      return res.status(201).json({ comment })
    } catch (err) {
      return next(err)
    }
  }
)

// DELETE /api/admin/projects/:projectId/tasks/:taskId/comments/:commentId
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
