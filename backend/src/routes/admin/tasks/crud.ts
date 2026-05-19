import express, { Request, Response, NextFunction } from 'express'
import fs from 'fs'
import { body, validationResult } from 'express-validator'
import { requirePermission } from '../../../middleware/role.js'
import Task from '../../../models/Task.js'
import Project from '../../../models/Project.js'
import User from '../../../models/User.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { createNotification } from '../../../lib/notifications.js'
import { logActivity } from '../../../lib/activityLog.js'
import { sendTaskAssignedEmail } from '../../../lib/email.js'
import { requirePermissionOrAssignee, TASK_STATUSES, TASK_PRIORITIES } from './middleware.js'

const router = express.Router({ mergeParams: true })

// GET /api/admin/projets/:projectId/tasks
router.get('/:projectId/tasks', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId as string
    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const tasks = await Task.find({ project: projectId, isArchived: { $ne: true } })
      .sort({ status: 1, order: 1 })
      .populate('assignee', 'name email')
      .populate('createdBy', 'name email')

    return res.json({ tasks })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/projets/:projectId/tasks
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

      const { title, description, status, priority, assignee, dueDate, startDate, estimatedDuration, progress, tags } = req.body

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
        startDate: startDate ? new Date(startDate) : null,
        estimatedDuration: estimatedDuration != null ? Number(estimatedDuration) : null,
        progress: progress != null ? Math.min(100, Math.max(0, Number(progress))) : 0,
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
          link: `/admin/projets/${projectId}?tab=tasks`,
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
            dueDate: dueDate || null,
            priority: priority || null,
          }).catch(() => {})
        }
      }

      return res.status(201).json({ task })
    } catch (err) {
      return next(err)
    }
  }
)

// PATCH /api/admin/projets/:projectId/tasks/:taskId
router.patch(
  '/:projectId/tasks/:taskId',
  requirePermissionOrAssignee(PERMISSIONS.MANAGE_TASKS),
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

      // If user doesn't have MANAGE_TASKS permission, restrict to progress only
      let isAssigneeOnly = false
      if (req.user!.role !== 'SUPER_ADMIN') {
        const u = await User.findById(req.user!.id).select('grantedPermissions deniedPermissions')
        const { hasPermissionResolved } = await import('../../../lib/permissions.js')
        if (!hasPermissionResolved(req.user!.role, PERMISSIONS.MANAGE_TASKS as any, u?.grantedPermissions ?? [], u?.deniedPermissions ?? [])) {
          isAssigneeOnly = true
        }
      }

      const { title, description, status, priority, assignee, dueDate, startDate, estimatedDuration, progress, tags } = req.body
      const oldAssignee = task.assignee ? String(task.assignee) : null

      if (isAssigneeOnly) {
        // Assignee can only update progress
        if (progress !== undefined) task.progress = Math.min(100, Math.max(0, Number(progress)))
      } else {
        if (title !== undefined) task.title = title
        if (description !== undefined) task.description = description
        if (status !== undefined) task.status = status
        if (priority !== undefined) task.priority = priority
        if (assignee !== undefined) task.assignee = assignee || null
        if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : null
        if (startDate !== undefined) task.startDate = startDate ? new Date(startDate) : null
        if (estimatedDuration !== undefined) task.estimatedDuration = estimatedDuration != null ? Number(estimatedDuration) : null
        if (progress !== undefined) task.progress = Math.min(100, Math.max(0, Number(progress)))
        if (tags !== undefined) task.tags = Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === 'string' && (t as string).trim()) : []
      }

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
          link: `/admin/projets/${projectId}?tab=tasks`,
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
            dueDate: task.dueDate ? task.dueDate.toISOString() : null,
            priority: task.priority || null,
          }).catch(() => {})
        }
      }

      return res.json({ task })
    } catch (err) {
      return next(err)
    }
  }
)

// PATCH /api/admin/projets/:projectId/tasks/:taskId/move — drag-drop
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

// DELETE /api/admin/projets/:projectId/tasks/:taskId
router.delete('/:projectId/tasks/:taskId', requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId as string
    const taskId = req.params.taskId as string
    const task = await Task.findOneAndDelete({ _id: taskId, project: projectId })
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' })
    }

    // Cleanup attachment files from disk
    if (task.attachments && task.attachments.length > 0) {
      for (const att of task.attachments) {
        if (att.storagePath && fs.existsSync(att.storagePath)) {
          fs.unlinkSync(att.storagePath)
        }
      }
    }

    await logActivity({ project: projectId, action: 'TASK_DELETED', actor: req.user!.id, summary: `Tâche supprimée : ${task.title}` })

    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
