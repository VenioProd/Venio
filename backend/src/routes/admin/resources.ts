import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import CompanyResource, { RESOURCE_CATEGORIES } from '../../models/CompanyResource.js'
import User from '../../models/User.js'
import { syncUploadToNextcloud } from '../../lib/nextcloud.js'
import { sendResourcePublishedEmail } from '../../lib/email/templates/project.js'
import { notifyInternalAdmins } from '../../lib/notifyHelpers.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

// Upload dir
const uploadsDir = path.resolve('uploads/resources')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ext = path.extname(file.originalname)
    cb(null, `${unique}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }) // 100MB

// GET / — list all resources
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const resources = await CompanyResource.find()
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })
    res.json({ resources })
  } catch (err) { next(err) }
})

// GET /categories
router.get('/categories', (_req: Request, res: Response) => {
  res.json({ categories: RESOURCE_CATEGORIES })
})

// GET /:id/download — serve the file
router.get('/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const resource = await CompanyResource.findById(req.params.id)
    if (!resource) return res.status(404).json({ error: 'Ressource introuvable' })

    const filePath = path.resolve(resource.storagePath)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur' })

    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(resource.originalName)}"`)
    res.setHeader('Content-Type', resource.mimeType)
    return res.sendFile(filePath)
  } catch (err) { return next(err) }
})

// POST / — upload (SUPER_ADMIN only)
router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'SUPER_ADMIN') {
      if (req.file) fs.unlinkSync(req.file.path)
      return res.status(403).json({ error: 'Seul le Super Admin peut uploader des ressources' })
    }
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu' })

    const { name, description, category } = req.body
    if (!name?.trim()) {
      fs.unlinkSync(req.file.path)
      return res.status(400).json({ error: 'Le nom est requis' })
    }

    const resource = await CompanyResource.create({
      name: name.trim(),
      description: description || '',
      category: category || 'Autre',
      originalName: req.file.originalname,
      storagePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user!.id,
    })

    syncUploadToNextcloud(req.file, 'ressources')
    const populated = await CompanyResource.findById(resource._id).populate('uploadedBy', 'name')

    // fire-and-forget notifications to all team members
    ;(async () => {
      try {
        const baseUrl = process.env.CORS_ORIGIN || 'https://venio.paris'
        const resourcesUrl = `${baseUrl}/admin/ressources`
        const members = await User.find({ role: { $ne: 'CLIENT' } }).select('name email')
        for (const member of members) {
          if (member.email) {
            sendResourcePublishedEmail({
              to: member.email,
              memberName: member.name || member.email,
              resourceName: resource.name,
              category: resource.category,
              description: resource.description || '',
              resourcesUrl,
            }).catch(() => {})
          }
        }
      } catch { /* silent */ }
    })()

    // Notif in-app à tous les admins internes
    notifyInternalAdmins({
      type: 'RESOURCE_REQUESTED',
      title: `Nouvelle ressource publiée`,
      message: `"${resource.name}" (${resource.category})`,
      link: '/admin/ressources',
      metadata: { resourceId: String(resource._id) },
      excludeUserId: req.user!.id,
    }).catch(() => {})

    return res.status(201).json({ resource: populated })
  } catch (err) { return next(err) }
})

// PATCH /:id — update name/description/category (SUPER_ADMIN only)
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Accès refusé' })
    const resource = await CompanyResource.findById(req.params.id)
    if (!resource) return res.status(404).json({ error: 'Ressource introuvable' })

    const { name, description, category } = req.body
    if (name !== undefined) resource.name = name.trim()
    if (description !== undefined) resource.description = description
    if (category !== undefined) resource.category = category

    await resource.save()
    const populated = await CompanyResource.findById(resource._id).populate('uploadedBy', 'name')
    return res.json({ resource: populated })
  } catch (err) { return next(err) }
})

// DELETE /:id (SUPER_ADMIN only)
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Accès refusé' })
    const resource = await CompanyResource.findById(req.params.id)
    if (!resource) return res.status(404).json({ error: 'Ressource introuvable' })

    // Delete file from disk
    if (fs.existsSync(resource.storagePath)) fs.unlinkSync(resource.storagePath)
    await resource.deleteOne()
    return res.json({ success: true })
  } catch (err) { return next(err) }
})

export default router
