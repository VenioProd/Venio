import express, { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import ProjectItem from '../../models/ProjectItem.js'
import Project from '../../models/Project.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { triggerAutomations } from '../../automation/trigger.js'
import { createNotification } from '../../lib/notifications.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// MIME types autorises pour l'upload
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
      cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`))
    }
  },
})

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
    console.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/projects/:projectId/items - Créer un item
router.post('/:projectId/items', requirePermission(PERMISSIONS.EDIT_CONTENT), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params
    const { section, type, title, description, url, content, order, isVisible, isDownloadable, status } = req.body

    const project = await Project.findById(projectId)
    if (!project) {
      return res.status(404).json({ error: 'Projet non trouvé' })
    }

    // Déterminer l'ordre automatiquement si non fourni
    let itemOrder = order ? parseInt(order) : undefined
    if (itemOrder === undefined) {
      const query: Record<string, unknown> = { project: projectId }
      if (section) query.section = section
      const lastItem = await ProjectItem.findOne(query).sort({ order: -1 })
      itemOrder = lastItem ? lastItem.order + 1 : 0
    }

    const itemData: Record<string, unknown> = {
      project: projectId,
      section: section || null,
      type,
      title,
      description: description || '',
      order: itemOrder,
      isVisible: isVisible !== undefined ? isVisible === 'true' : true,
      isDownloadable: isDownloadable !== undefined ? isDownloadable === 'true' : true,
      status: status || 'EN_ATTENTE',
      createdBy: req.user!.id,
    }

    // Ajouter le fichier si présent
    const file = req.file as Express.Multer.File | undefined
    if (file) {
      itemData.file = {
        originalName: file.originalname,
        storagePath: file.path,
        mimeType: file.mimetype,
        size: file.size,
      }
    }

    // Ajouter l'URL si présente
    if (url) {
      itemData.url = url
    }

    // Ajouter le contenu si présent
    if (content) {
      itemData.content = content
    }

    const item = new ProjectItem(itemData)
    await item.save()
    await item.populate('section', 'title')
    await item.populate('createdBy', 'name email')

    // Trigger deliverable notification if type is LIVRABLE
    if (type === 'LIVRABLE') {
      triggerAutomations(
        ['project.new_deliverable_client_notification'],
        { itemId: item._id.toString(), projectId, actorId: req.user!.id }
      )
    }

    // Notif au client du projet (sauf si c'est lui qui ajoute)
    if (project.client && String(project.client) !== req.user!.id) {
      createNotification({
        recipient: project.client,
        type: 'PROJECT_ITEM_CREATED',
        title: `Nouveau ${type?.toLowerCase() || 'élément'} sur ${project.name}`,
        message: title || '',
        link: `/client/projects/${project._id}`,
        metadata: { projectId, itemId: String(item._id), type },
      }).catch(() => {})
    }

    res.status(201).json({ item })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/projects/:projectId/items/:itemId - Modifier un item
router.patch('/:projectId/items/:itemId', requirePermission(PERMISSIONS.EDIT_CONTENT), upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { projectId, itemId } = req.params
    const { title, description, url, content, order, isVisible, isDownloadable, status, section } = req.body

    const item = await ProjectItem.findOne({
      _id: itemId,
      project: projectId,
    })

    if (!item) {
      return res.status(404).json({ error: 'Item non trouvé' })
    }

    const oldStatus = item.status

    if (title !== undefined) item.title = title
    if (description !== undefined) item.description = description
    if (url !== undefined) item.url = url
    if (content !== undefined) item.content = content
    if (order !== undefined) item.order = parseInt(order)
    if (isVisible !== undefined) item.isVisible = isVisible === 'true' || isVisible === true
    if (isDownloadable !== undefined) item.isDownloadable = isDownloadable === 'true' || isDownloadable === true
    if (status !== undefined) item.status = status
    if (section !== undefined) item.section = section || null

    // Remplacer le fichier si un nouveau est fourni
    const file = req.file as Express.Multer.File | undefined
    if (file) {
      // Supprimer l'ancien fichier si existant
      if (item.file?.storagePath && fs.existsSync(item.file.storagePath)) {
        fs.unlinkSync(item.file.storagePath)
      }

      item.file = {
        originalName: file.originalname,
        storagePath: file.path,
        mimeType: file.mimetype,
        size: file.size,
      }
    }

    await item.save()
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
    console.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// DELETE /api/admin/projects/:projectId/items/:itemId - Supprimer un item
router.delete('/:projectId/items/:itemId', requirePermission(PERMISSIONS.EDIT_CONTENT), async (req: Request, res: Response) => {
  try {
    const { projectId, itemId } = req.params

    const item = await ProjectItem.findOne({
      _id: itemId,
      project: projectId,
    })

    if (!item) {
      return res.status(404).json({ error: 'Item non trouvé' })
    }

    // Supprimer le fichier si existant
    if (item.file?.storagePath && fs.existsSync(item.file.storagePath)) {
      fs.unlinkSync(item.file.storagePath)
    }

    await item.deleteOne()

    res.json({ message: 'Item supprimé' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/projects/:projectId/items/:itemId/download - Télécharger un fichier
router.get('/:projectId/items/:itemId/download', requirePermission(PERMISSIONS.VIEW_CONTENT), async (req: Request, res: Response) => {
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
    console.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/projects/:projectId/items/:itemId/preview — inline preview for images/PDFs
router.get('/:projectId/items/:itemId/preview', requirePermission(PERMISSIONS.VIEW_CONTENT), async (req: Request, res: Response) => {
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
    const stream = fs.createReadStream(item.file.storagePath)
    stream.pipe(res)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
