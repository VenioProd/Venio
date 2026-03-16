import express, { Request, Response, NextFunction } from 'express'
import fs from 'fs'
import { requirePermission } from '../../../middleware/role.js'
import Task from '../../../models/Task.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { requirePermissionOrAssignee, upload } from './middleware.js'

const router = express.Router({ mergeParams: true })

// POST /api/admin/projects/:projectId/tasks/:taskId/attachments
router.post('/:projectId/tasks/:taskId/attachments', requirePermissionOrAssignee(PERMISSIONS.MANAGE_TASKS), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await Task.findOne({ _id: req.params.taskId, project: req.params.projectId })
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' })
    }

    const file = req.file as Express.Multer.File | undefined
    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' })
    }

    task.attachments.push({
      originalName: file.originalname,
      storagePath: file.path,
      mimeType: file.mimetype,
      size: file.size,
      uploadedBy: req.user!.id,
      uploadedAt: new Date(),
    } as any)

    await task.save()
    await task.populate('attachments.uploadedBy', 'name email')

    return res.status(201).json({ attachments: task.attachments })
  } catch (err) {
    return next(err)
  }
})

// GET /api/admin/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download
router.get('/:projectId/tasks/:taskId/attachments/:attachmentId/download', requirePermission(PERMISSIONS.VIEW_PROJECTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await Task.findOne({ _id: req.params.taskId, project: req.params.projectId })
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' })
    }

    const attachment = task.attachments.find((a: any) => a._id.toString() === req.params.attachmentId)
    if (!attachment) {
      return res.status(404).json({ error: 'Pièce jointe non trouvée' })
    }

    if (!fs.existsSync(attachment.storagePath)) {
      return res.status(404).json({ error: 'Fichier introuvable sur le disque' })
    }

    return res.download(attachment.storagePath, attachment.originalName)
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/admin/projects/:projectId/tasks/:taskId/attachments/:attachmentId
router.delete('/:projectId/tasks/:taskId/attachments/:attachmentId', requirePermission(PERMISSIONS.MANAGE_TASKS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const task = await Task.findOne({ _id: req.params.taskId, project: req.params.projectId })
    if (!task) {
      return res.status(404).json({ error: 'Tâche non trouvée' })
    }

    const attachment = task.attachments.find((a: any) => a._id.toString() === req.params.attachmentId)
    if (!attachment) {
      return res.status(404).json({ error: 'Pièce jointe non trouvée' })
    }

    // Remove file from disk
    if (attachment.storagePath && fs.existsSync(attachment.storagePath)) {
      fs.unlinkSync(attachment.storagePath)
    }

    await Task.updateOne(
      { _id: task._id },
      { $pull: { attachments: { _id: attachment._id } } }
    )

    return res.json({ success: true })
  } catch (err) {
    return next(err)
  }
})

export default router
