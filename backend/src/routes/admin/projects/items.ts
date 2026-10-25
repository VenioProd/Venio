import express, { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { createHash } from 'node:crypto'
import mongoose from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission, userHasPermission } from '../../../middleware/role.js'
import ProjectItem from '../../../models/ProjectItem.js'
import Project from '../../../models/Project.js'
import { hasProjectAccess } from '../../../lib/adminProjectAccess.js'
import type { IProjectItem } from '../../../types/models/index.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import { triggerAutomations } from '../../../automation/trigger.js'
import { createNotification } from '../../../lib/notifications.js'
import logger from '../../../lib/logger.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// MIME types autorises pour l'upload
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'application/json',
])

// Configuration multer pour l'upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'items')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + '-' + safeName)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('UNSUPPORTED_MEDIA_TYPE'))
    }
  },
})

function removeFile(filePath?: string) {
  if (filePath) fs.rmSync(filePath, { force: true })
}

async function requireItemWrite(req: Request, res: Response, next: NextFunction) {
  try {
    const canEdit = await userHasPermission(req, PERMISSIONS.EDIT_CONTENT)
    if (!canEdit && !(await userHasPermission(req, PERMISSIONS.UPLOAD_PROJECT_DOCUMENTS))) {
      return res.status(403).json({ error: 'Accès refusé', code: 'PERMISSION_DENIED' })
    }
    res.locals.canEditContent = canEdit
    const projectId = req.params.projectId as string
    const itemId = req.params.itemId as string | undefined
    if (!mongoose.isValidObjectId(projectId) || !(await Project.exists({ _id: projectId }))) {
      return res.status(404).json({ error: 'Projet non trouvé', code: 'PROJECT_NOT_FOUND' })
    }
    if (!canEdit && !(await hasProjectAccess(req.user!, projectId))) {
      return res.status(403).json({ error: 'Accès refusé', code: 'PROJECT_OUT_OF_SCOPE' })
    }
    if (itemId) {
      const item = mongoose.isValidObjectId(itemId)
        ? await ProjectItem.findOne({ _id: itemId, project: projectId })
        : null
      if (!item) return res.status(404).json({ error: 'Item non trouvé', code: 'ITEM_NOT_FOUND' })
      if (!canEdit && (String(item.createdBy) !== req.user!.id || item.isVisible)) {
        return res.status(403).json({ error: 'Document non modifiable', code: 'DOCUMENT_WRITE_FORBIDDEN' })
      }
      res.locals.item = item
    }
    return next()
  } catch (err) {
    return next(err)
  }
}

function uploadFile(req: Request, res: Response, next: NextFunction) {
  const key = req.get('Idempotency-Key')
  if (
    req.method === 'POST' &&
    key !== undefined &&
    !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(key)
  ) {
    return res.status(400).json({ error: 'Clé UUID invalide', code: 'INVALID_IDEMPOTENCY_KEY' })
  }
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      req.body ??= {}
      return next()
    }
    removeFile(req.file?.path)
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Fichier trop volumineux', code: 'FILE_TOO_LARGE' })
    }
    if (err instanceof Error && err.message === 'UNSUPPORTED_MEDIA_TYPE') {
      return res.status(415).json({ error: 'Type de fichier non autorisé', code: 'UNSUPPORTED_MEDIA_TYPE' })
    }
    return res.status(400).json({ error: 'Upload invalide', code: 'INVALID_UPLOAD' })
  })
}

function validateDocument(req: Request, res: Response): boolean {
  if (res.locals.canEditContent) return true
  if (req.body.isVisible === 'true' || req.body.isVisible === true) {
    res.status(403).json({ error: 'Visibilité réservée aux éditeurs', code: 'VISIBILITY_FORBIDDEN' })
    return false
  }
  if (req.body.type !== undefined && ['LIVRABLE', 'LIEN', 'NOTE'].includes(req.body.type)) {
    res.status(400).json({ error: 'Type de document invalide', code: 'INVALID_DOCUMENT_TYPE' })
    return false
  }
  if (req.method === 'POST' && !req.file) {
    res.status(400).json({ error: 'Fichier requis', code: 'FILE_REQUIRED' })
    return false
  }
  return true
}

function responseOf(item: IProjectItem) {
  const result = item.toObject()
  delete result.clientRequestId
  delete result.clientRequestHash
  return { item: result }
}

async function replay(res: Response, existing: IProjectItem, hash: string) {
  if (existing.clientRequestHash !== hash) {
    return res.status(409).json({ error: 'Cette clé a déjà servi pour un autre contenu', code: 'IDEMPOTENCY_CONFLICT' })
  }
  await existing.populate('section', 'title')
  await existing.populate('createdBy', 'name email')
  return res.status(200).json(responseOf(existing))
}

// GET /api/admin/projects/:projectId/items - Lister les items d'un projet
router.get('/:projectId/items', requirePermission(PERMISSIONS.VIEW_CONTENT), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params
    const { section, type } = req.query as Record<string, string | undefined>

    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    const query: Record<string, unknown> = { project: projectId }
    if (section) query.section = section
    if (type) query.type = type

    const items = await ProjectItem.find(query)
      .sort({ order: 1 })
      .populate('section', 'title')
      .populate('createdBy', 'name email')

    res.json({ items })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/projects/:projectId/items - Créer un item
router.post('/:projectId/items', requireItemWrite, uploadFile, async (req: Request, res: Response) => {
  let stored = false
  try {
    if (!validateDocument(req, res)) return
    const { projectId } = req.params
    const canEdit = res.locals.canEditContent as boolean
    const { section, type, title, description, url, content, order, isVisible, isDownloadable, status } = req.body
    const file = req.file
    const requestedOrder = canEdit && order ? parseInt(order) : null
    const item = new ProjectItem({
      project: projectId,
      section: section || null,
      type,
      title,
      description: description || '',
      order: requestedOrder ?? 0,
      isVisible: canEdit ? (isVisible !== undefined ? isVisible === 'true' || isVisible === true : true) : false,
      isDownloadable:
        canEdit && isDownloadable !== undefined ? isDownloadable === 'true' || isDownloadable === true : true,
      status: canEdit ? status || 'EN_ATTENTE' : 'EN_ATTENTE',
      url: canEdit ? url || undefined : undefined,
      content: canEdit ? content || undefined : undefined,
      createdBy: req.user!.id,
      file: file
        ? {
            originalName: file.originalname,
            storagePath: file.path,
            mimeType: file.mimetype,
            size: file.size,
          }
        : undefined,
    })
    await item.validate()
    const key = req.get('Idempotency-Key')?.toLowerCase()
    let hash = ''
    if (key) {
      const digest = file
        ? createHash('sha256')
            .update(await fs.promises.readFile(file.path))
            .digest('hex')
        : null
      hash = createHash('sha256')
        .update(
          JSON.stringify({
            project: String(item.project),
            section: item.section ? String(item.section) : null,
            type: item.type,
            title: item.title,
            description: item.description,
            order: requestedOrder,
            isVisible: item.isVisible,
            isDownloadable: item.isDownloadable,
            status: item.status,
            url: item.url || null,
            content: item.content || null,
            file: file ? { originalName: file.originalname, mimeType: file.mimetype, size: file.size, digest } : null,
          }),
        )
        .digest('hex')
      const existing = await ProjectItem.findOne({ createdBy: req.user!.id, clientRequestId: key }).select(
        '+clientRequestHash',
      )
      if (existing) return await replay(res, existing, hash)
      item.clientRequestId = key
      item.clientRequestHash = hash
    }
    if (requestedOrder === null) {
      const query: Record<string, unknown> = { project: projectId }
      if (section) query.section = section
      const lastItem = await ProjectItem.findOne(query).sort({ order: -1 })
      item.order = lastItem ? lastItem.order + 1 : 0
    }
    try {
      await item.save()
      stored = true
    } catch (err) {
      if (key && (err as { code?: number }).code === 11000) {
        const existing = await ProjectItem.findOne({ createdBy: req.user!.id, clientRequestId: key }).select(
          '+clientRequestHash',
        )
        if (existing) return await replay(res, existing, hash)
      }
      throw err
    }
    await item.populate('section', 'title')
    await item.populate('createdBy', 'name email')

    if (item.isVisible && item.type === 'LIVRABLE') {
      triggerAutomations(['project.new_deliverable_client_notification'], {
        itemId: item._id.toString(),
        projectId,
        actorId: req.user!.id,
      })
    }

    const project = await Project.findById(projectId)
    if (item.isVisible && project?.client && String(project.client) !== req.user!.id) {
      createNotification({
        recipient: project.client,
        type: 'PROJECT_ITEM_CREATED',
        title: `Nouveau ${item.type.toLowerCase()} sur ${project.name}`,
        message: item.title,
        link: `/client/projects/${project._id}`,
        metadata: { projectId, itemId: String(item._id), type: item.type },
      }).catch(() => {})
    }
    return res.status(201).json(responseOf(item))
  } catch (err) {
    logger.error(err)
    return res
      .status(err instanceof mongoose.Error.ValidationError ? 400 : 500)
      .json({ error: 'Erreur création document' })
  } finally {
    if (!stored) removeFile(req.file?.path)
  }
})

// PATCH /api/admin/projects/:projectId/items/:itemId - Modifier un item
router.patch('/:projectId/items/:itemId', requireItemWrite, uploadFile, async (req: Request, res: Response) => {
  let stored = false
  try {
    if (!validateDocument(req, res)) return
    const { projectId } = req.params
    const { title, description, url, content, order, isVisible, isDownloadable, status, section, type } = req.body

    const item = res.locals.item as IProjectItem
    const canEdit = res.locals.canEditContent as boolean
    const oldFilePath = item.file?.storagePath

    const oldStatus = item.status

    if (title !== undefined) item.title = title
    if (description !== undefined) item.description = description
    if (canEdit && url !== undefined) item.url = url
    if (canEdit && content !== undefined) item.content = content
    if (canEdit && order !== undefined) item.order = parseInt(order)
    if (canEdit && isVisible !== undefined) item.isVisible = isVisible === 'true' || isVisible === true
    if (canEdit && isDownloadable !== undefined)
      item.isDownloadable = isDownloadable === 'true' || isDownloadable === true
    if (canEdit && status !== undefined) item.status = status
    if (section !== undefined) item.section = section || null

    if (!canEdit && type !== undefined) item.type = type

    // Remplacer le fichier si un nouveau est fourni
    const file = req.file as Express.Multer.File | undefined
    if (file) {
      item.file = {
        originalName: file.originalname,
        storagePath: file.path,
        mimeType: file.mimetype,
        size: file.size,
      }
    }

    await item.save()
    stored = true
    if (file) removeFile(oldFilePath)
    await item.populate('section', 'title')
    await item.populate('createdBy', 'name email')

    // Notif si validation
    if (oldStatus !== 'VALIDE' && item.status === 'VALIDE') {
      const project = await Project.findById(projectId)
      // Notifier le créateur si différent de l'auteur de la validation
      if (item.createdBy && String((item.createdBy as any)._id || item.createdBy) !== req.user!.id) {
        createNotification({
          recipient: (item.createdBy as any)._id || item.createdBy,
          type: 'PROJECT_ITEM_VALIDATED',
          title: `Élément validé ✅`,
          message: `"${item.title}" sur ${project?.name || 'projet'} validé`,
          link: `/admin/projects/${projectId}`,
          metadata: { projectId, itemId: String(item._id) },
        }).catch(() => {})
      }
    }

    res.json({ item })
  } catch (err) {
    logger.error(err)
    res
      .status(err instanceof mongoose.Error.ValidationError ? 400 : 500)
      .json({ error: 'Erreur modification document' })
  } finally {
    if (!stored) removeFile(req.file?.path)
  }
})

// DELETE /api/admin/projects/:projectId/items/:itemId - Supprimer un item
router.delete('/:projectId/items/:itemId', requireItemWrite, async (_req: Request, res: Response) => {
  try {
    const item = res.locals.item as IProjectItem
    await ProjectItem.deleteOne({ _id: item._id })
    removeFile(item.file?.storagePath)

    res.json({ message: 'Item supprimé' })
  } catch (err) {
    logger.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/projects/:projectId/items/:itemId/download - Télécharger un fichier
router.get(
  '/:projectId/items/:itemId/download',
  requirePermission(PERMISSIONS.VIEW_CONTENT),
  async (req: Request, res: Response) => {
    try {
      const { projectId, itemId } = req.params

      const item = await ProjectItem.findOne({
        _id: itemId,
        project: projectId,
      })

      if (!item) {
        return res.status(404).json({ error: 'Item non trouvé' })
      }

      if (!item.file?.storagePath) {
        return res.status(404).json({ error: 'Aucun fichier associé' })
      }

      if (!fs.existsSync(item.file.storagePath)) {
        return res.status(404).json({ error: 'Fichier introuvable' })
      }

      res.download(item.file.storagePath, item.file.originalName)
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: 'Erreur serveur' })
    }
  },
)

// GET /api/admin/projects/:projectId/items/:itemId/preview — inline preview for images/PDFs
router.get(
  '/:projectId/items/:itemId/preview',
  requirePermission(PERMISSIONS.VIEW_CONTENT),
  async (req: Request, res: Response) => {
    try {
      const { projectId, itemId } = req.params
      const item = await ProjectItem.findOne({ _id: itemId, project: projectId })
      if (!item || !item.file?.storagePath) {
        return res.status(404).json({ error: 'Fichier non trouvé' })
      }
      if (!fs.existsSync(item.file.storagePath)) {
        return res.status(404).json({ error: 'Fichier introuvable' })
      }
      res.setHeader('Content-Type', item.file.mimeType || 'application/octet-stream')
      res.setHeader('Content-Disposition', 'inline')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      // Le type vient de l'uploadeur, commercial compris : un SVG ouvert directement ne doit rien exécuter sur l'origine Venio.
      if (item.file.mimeType !== 'application/pdf')
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      const stream = fs.createReadStream(item.file.storagePath)
      stream.pipe(res)
    } catch (err) {
      logger.error(err)
      res.status(500).json({ error: 'Erreur serveur' })
    }
  },
)

export default router
