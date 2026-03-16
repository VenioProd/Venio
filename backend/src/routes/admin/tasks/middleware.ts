import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import Task from '../../../models/Task.js'
import User from '../../../models/User.js'

// Middleware: permission OR assignee of the task
export function requirePermissionOrAssignee(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // SUPER_ADMIN always passes
    if (req.user!.role === 'SUPER_ADMIN') return next()

    // Check permission via DB lookup
    const u = await User.findById(req.user!.id).select('customPermissions')
    const { hasPermissionResolved } = await import('../../../lib/permissions.js')
    if (hasPermissionResolved(req.user!.role, permission as any, u?.customPermissions ?? null)) {
      return next()
    }

    // Fallback: check if user is assignee of this task
    const task = await Task.findOne({ _id: req.params.taskId, project: req.params.projectId }).select('assignee')
    if (task && task.assignee && task.assignee.toString() === req.user!.id) {
      return next()
    }

    return res.status(403).json({ error: 'Accès refusé' })
  }
}

export const TASK_STATUSES = ['A_FAIRE', 'EN_COURS', 'EN_REVIEW', 'TERMINE', 'VALIDE', 'NON_VALIDE', 'A_MODIFIER']
export const TASK_PRIORITIES = ['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']

// ─── Multer config for task attachments ───
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
  'application/json',
])

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'tasks')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + '-' + safeName)
  },
})

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`))
    }
  },
})
