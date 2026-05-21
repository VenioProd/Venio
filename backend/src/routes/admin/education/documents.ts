import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import mongoose from 'mongoose'
import {
  EducationDocument,
  DOC_PARENT_TYPES,
  DOC_CATEGORIES,
  DOC_STATUSES,
  type EducationDocumentParentType,
  type EducationDocumentCategory,
  type EducationDocumentStatus,
} from '../../../models/education/index.js'
import { asObjectId, logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

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

// VENIO-46 — Inférence du parent legacy à partir des liens BDD pour rester
// compatible avec les anciens consumers (search, drawers existants).
function asId(value: unknown): string | null {
  if (!value) return null
  if (value instanceof mongoose.Types.ObjectId) return value.toString()
  if (typeof value === 'string' && validId(value)) return value
  return null
}

function inferParent(body: Record<string, unknown>): {
  parentType: EducationDocumentParentType
  parentId: string | null
} {
  const explicitType = body.parentType
  const explicitId = body.parentId
  if (typeof explicitType === 'string' && DOC_PARENT_TYPES.includes(explicitType as EducationDocumentParentType)) {
    return {
      parentType: explicitType as EducationDocumentParentType,
      parentId: asId(explicitId),
    }
  }
  const chain: Array<[EducationDocumentParentType, unknown]> = [
    ['submission', body.submissionId],
    ['assignment', body.assignmentId],
    ['session', body.sessionId],
    ['student', body.studentId],
    ['class', body.classId],
  ]
  for (const [type, id] of chain) {
    const parsed = asId(id)
    if (parsed) return { parentType: type, parentId: parsed }
  }
  return { parentType: 'standalone', parentId: null }
}

function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) return input.map((t) => String(t).trim()).filter(Boolean)
  if (typeof input === 'string') return input.split(',').map((t) => t.trim()).filter(Boolean)
  return []
}

function nullableObjectId(value: unknown): mongoose.Types.ObjectId | null {
  if (typeof value !== 'string' || !validId(value)) return null
  return new mongoose.Types.ObjectId(value)
}

function nullableDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

// GET / — liste paginée avec filtres BDD documentaire (VENIO-46)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, skip, sort } = parseListQuery(req, { defaultLimit: 100, maxLimit: 500 })
    const filter: Record<string, unknown> = { ...ownerFilter(req) }

    if (req.query.parentType && DOC_PARENT_TYPES.includes(req.query.parentType as EducationDocumentParentType)) {
      filter.parentType = req.query.parentType
    }
    if (req.query.parentId && validId(req.query.parentId)) filter.parentId = req.query.parentId

    if (req.query.category && DOC_CATEGORIES.includes(req.query.category as EducationDocumentCategory)) {
      filter.category = req.query.category
    }
    if (req.query.status && DOC_STATUSES.includes(req.query.status as EducationDocumentStatus)) {
      filter.status = req.query.status
    }
    if (req.query.school) filter.school = String(req.query.school)
    if (req.query.classId && validId(req.query.classId)) filter.classId = req.query.classId
    if (req.query.sessionId && validId(req.query.sessionId)) filter.sessionId = req.query.sessionId
    if (req.query.assignmentId && validId(req.query.assignmentId)) filter.assignmentId = req.query.assignmentId
    if (req.query.submissionId && validId(req.query.submissionId)) filter.submissionId = req.query.submissionId
    if (req.query.studentId && validId(req.query.studentId)) filter.studentId = req.query.studentId

    if (req.query.tag) filter.tags = req.query.tag
    if (req.query.search) {
      // On évite $text pour pouvoir tolérer 1 lettre de plus que MongoDB n'indexe.
      const rx = new RegExp(String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [
        { title: rx },
        { originalName: rx },
        { description: rx },
        { tags: rx },
      ]
    }

    const [items, total, facets] = await Promise.all([
      EducationDocument.find(filter).sort(sort).skip(skip).limit(limit),
      EducationDocument.countDocuments(filter),
      // ⚠️ aggregate() ne cast pas les champs du schéma : on convertit
      // explicitement owner en ObjectId pour que $match matche les docs.
      EducationDocument.aggregate([
        { $match: { owner: asObjectId(req.user!.id), deletedAt: null } },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
          },
        },
      ]),
    ])

    const categoryCounts = Object.fromEntries(facets.map((f: { _id: string; count: number }) => [f._id, f.count]))
    res.json({ documents: items, total, categoryCounts })
  } catch (err) { next(err) }
})

// POST / — upload (multipart) ou metadata-only avec url
router.post('/', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, unknown>
    const file = req.file
    if (!file && !body.url) return res.status(400).json({ error: 'Fichier ou url requis' })

    if (body.category && !DOC_CATEGORIES.includes(body.category as EducationDocumentCategory)) {
      return res.status(400).json({ error: 'category invalide' })
    }
    if (body.status && !DOC_STATUSES.includes(body.status as EducationDocumentStatus)) {
      return res.status(400).json({ error: 'status invalide' })
    }
    if (body.parentType && !DOC_PARENT_TYPES.includes(body.parentType as EducationDocumentParentType)) {
      return res.status(400).json({ error: 'parentType invalide' })
    }

    const { parentType, parentId } = inferParent(body)

    const created = await EducationDocument.create({
      owner: req.user!.id,
      parentType,
      parentId,
      category: (body.category as EducationDocumentCategory) || 'other',
      status: (body.status as EducationDocumentStatus) || 'PUBLISHED',
      title: (body.title as string) || file?.originalname || (body.url as string) || 'Document',
      description: (body.description as string) || '',
      originalName: file?.originalname || '',
      storagePath: file?.path || '',
      mimeType: file?.mimetype || '',
      size: file?.size || 0,
      url: (body.url as string) || '',
      school: (body.school as string) || '',
      classId: nullableObjectId(body.classId),
      sessionId: nullableObjectId(body.sessionId),
      assignmentId: nullableObjectId(body.assignmentId),
      submissionId: nullableObjectId(body.submissionId),
      studentId: nullableObjectId(body.studentId),
      documentDate: nullableDate(body.documentDate),
      dueDate: nullableDate(body.dueDate),
      tags: normalizeTags(body.tags),
    })
    await logActivity(req.user!.id, req.user!.id, 'document', created._id, 'CREATE', {
      category: created.category,
      parentType: created.parentType,
      parentId: created.parentId,
    })
    res.status(201).json({ document: created })
  } catch (err) { next(err) }
})

// GET /:id/download — stream ou redirection url
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

    const body = req.body as Record<string, unknown>

    if (body.category !== undefined) {
      if (!DOC_CATEGORIES.includes(body.category as EducationDocumentCategory)) {
        return res.status(400).json({ error: 'category invalide' })
      }
      item.category = body.category as EducationDocumentCategory
    }
    if (body.status !== undefined) {
      if (!DOC_STATUSES.includes(body.status as EducationDocumentStatus)) {
        return res.status(400).json({ error: 'status invalide' })
      }
      item.status = body.status as EducationDocumentStatus
    }
    if (body.title !== undefined) item.title = String(body.title)
    if (body.description !== undefined) item.description = String(body.description)
    if (body.school !== undefined) item.school = String(body.school)
    if (body.url !== undefined) item.url = String(body.url)
    if (body.tags !== undefined) item.tags = normalizeTags(body.tags)
    if (body.documentDate !== undefined) item.documentDate = nullableDate(body.documentDate)
    if (body.dueDate !== undefined) item.dueDate = nullableDate(body.dueDate)
    if (body.classId !== undefined) item.classId = nullableObjectId(body.classId)
    if (body.sessionId !== undefined) item.sessionId = nullableObjectId(body.sessionId)
    if (body.assignmentId !== undefined) item.assignmentId = nullableObjectId(body.assignmentId)
    if (body.submissionId !== undefined) item.submissionId = nullableObjectId(body.submissionId)
    if (body.studentId !== undefined) item.studentId = nullableObjectId(body.studentId)

    // parentType/parentId : explicite si fourni, sinon ré-inféré depuis les
    // liens à jour pour rester cohérent avec les drawers legacy. Quand on
    // ré-infère après une mise à jour de classId/sessionId/…, on doit retirer
    // l'ancien parentType (sinon inferParent retournerait l'ancien parent au
    // lieu de descendre la chain).
    if (body.parentType !== undefined || body.parentId !== undefined) {
      const { parentType, parentId } = inferParent({ ...item.toObject(), ...body })
      item.parentType = parentType
      item.parentId = parentId ? new mongoose.Types.ObjectId(parentId) : null
    } else if (
      body.classId !== undefined || body.sessionId !== undefined ||
      body.assignmentId !== undefined || body.submissionId !== undefined ||
      body.studentId !== undefined
    ) {
      const itemObj = item.toObject() as unknown as Record<string, unknown>
      const { parentType: _ignored, parentId: _ignoredId, ...itemNoParent } = itemObj
      void _ignored
      void _ignoredId
      const inferred = inferParent(itemNoParent)
      item.parentType = inferred.parentType
      item.parentId = inferred.parentId ? new mongoose.Types.ObjectId(inferred.parentId) : null
    }

    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'document', item._id, 'UPDATE', {})
    res.json({ document: item })
  } catch (err) { next(err) }
})

// DELETE /:id — soft delete
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
