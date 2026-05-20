import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { EducationDocument, DOC_PARENT_TYPES, type EducationDocumentParentType } from '../../../models/education/index.js'
import { logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()

const uploadsDir = path.resolve('uploads/education')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const ext = path.extname(file.originalname)
    cb(null, `${unique}${ext}`)
  },
})
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } })

// GET /
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, skip, sort } = parseListQuery(req, { defaultLimit: 100 })
    const filter: Record<string, unknown> = { ...ownerFilter(req) }
    if (req.query.parentType && DOC_PARENT_TYPES.includes(req.query.parentType as EducationDocumentParentType)) {
      filter.parentType = req.query.parentType
    }
    if (req.query.parentId && validId(req.query.parentId)) filter.parentId = req.query.parentId
    if (req.query.search) filter.$text = { $search: String(req.query.search) }
    const [items, total] = await Promise.all([
      EducationDocument.find(filter).sort(sort).skip(skip).limit(limit),
      EducationDocument.countDocuments(filter),
    ])
    res.json({ documents: items, total })
  } catch (err) { next(err) }
})

// POST / — upload (multipart) ou metadata-only avec url
router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { parentType, parentId, title, url, tags } = req.body
    if (parentType && !DOC_PARENT_TYPES.includes(parentType)) {
      return res.status(400).json({ error: 'parentType invalide' })
    }
    if (parentId && !validId(parentId)) return res.status(400).json({ error: 'parentId invalide' })

    const file = req.file
    if (!file && !url) return res.status(400).json({ error: 'Fichier ou url requis' })

    const created = await EducationDocument.create({
      owner: req.user!.id,
      parentType: parentType || 'standalone',
      parentId: parentId || null,
      title: title || file?.originalname || url || '',
      originalName: file?.originalname || '',
      storagePath: file?.path || '',
      mimeType: file?.mimetype || '',
      size: file?.size || 0,
      url: url || '',
      tags: Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    })
    await logActivity(req.user!.id, req.user!.id, 'document', created._id, 'CREATE', { parentType, parentId })
    res.status(201).json({ document: created })
  } catch (err) { next(err) }
})

// GET /:id/download — stream
router.get('/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationDocument.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Document introuvable' })
    if (item.url && !item.storagePath) {
      return res.redirect(item.url)
    }
    const filePath = path.resolve(item.storagePath)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier manquant' })
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(item.originalName)}"`)
    res.setHeader('Content-Type', item.mimeType || 'application/octet-stream')
    res.sendFile(filePath)
  } catch (err) { next(err) }
})

// PATCH /:id — metadata
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationDocument.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Document introuvable' })
    const { title, tags, parentType, parentId } = req.body
    if (title !== undefined) item.title = title
    if (Array.isArray(tags)) item.tags = tags
    if (parentType && DOC_PARENT_TYPES.includes(parentType)) item.parentType = parentType
    if (parentId !== undefined) item.parentId = parentId && validId(parentId) ? parentId : null
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'document', item._id, 'UPDATE', {})
    res.json({ document: item })
  } catch (err) { next(err) }
})

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationDocument.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Document introuvable' })
    item.deletedAt = new Date()
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'document', item._id, 'DELETE', {})
    res.json({ success: true })
  } catch (err) { next(err) }
})

export default router
