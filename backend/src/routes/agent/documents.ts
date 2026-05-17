import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { body, param, validationResult } from 'express-validator'
import Document from '../../models/Document.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les Documents (fichiers binaires liés à un projet).
 *
 * Upload : base64 dans le body JSON. Limite stricte à 5 Mo (encodé) pour
 * éviter de saturer la mémoire — pour des fichiers plus gros, un endpoint
 * multipart sera ajouté dans un lot ultérieur.
 *
 * Storage : disque local sous `uploads/agent/<projectId>/<timestamp>-<random>-<filename>`.
 * Path traversal protégé : `path.resolve` puis `startsWith(uploadsDir)`.
 *
 * Scopes :
 *   - GET → read:documents
 *   - POST / DELETE → write:documents
 *   - Le download requiert read:documents (le contenu peut être sensible)
 */

const router = express.Router()

const DOC_TYPES = ['DEVIS', 'FACTURE', 'FICHIER_PROJET'] as const

/** Limite de taille upload (Mo). Le base64 ajoute ~33% donc on cap le body
 *  encodé à BASE64_LIMIT_MB * 4/3. */
const RAW_LIMIT_MB = 5
const RAW_LIMIT_BYTES = RAW_LIMIT_MB * 1024 * 1024

function isValidObjectId(id: unknown): boolean {
  return typeof id === 'string' && mongoose.isValidObjectId(id)
}

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

function uploadsRoot(): string {
  return path.resolve(process.cwd(), 'uploads')
}

function safeFilename(originalName: string): string {
  // Supprime les chars dangereux ; garde l'extension
  return originalName
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(-100) // cap longueur
}

// ───────────────────────────────────────────────────────────────────────────
// GET /documents — liste, paginée + filtres
// ───────────────────────────────────────────────────────────────────────────

router.get('/documents', requireScope('read:documents'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.project === 'string' && isValidObjectId(req.query.project)) {
      filter.project = req.query.project
    }
    if (typeof req.query.type === 'string' && (DOC_TYPES as readonly string[]).includes(req.query.type)) {
      filter.type = req.query.type
    }
    const [items, total] = await Promise.all([
      Document.find(filter)
        .sort({ uploadedAt: -1 })
        .skip(pag.skip)
        .limit(pag.limit)
        .populate('project', 'name')
        .populate('uploadedBy', 'name email')
        .lean(),
      Document.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/documents/:id',
  requireScope('read:documents'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const doc = await Document.findById(req.params.id)
        .populate('project', 'name')
        .populate('uploadedBy', 'name email')
        .lean()
      if (!doc) return respondError(res, 404, 'NOT_FOUND', 'Document introuvable')
      res.json(doc)
    } catch (err) {
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// POST /documents — upload via base64
//   Body : { project, type, originalName, mimeType, contentBase64 }
// ───────────────────────────────────────────────────────────────────────────

router.post(
  '/documents',
  requireScope('write:documents'),
  body('project').custom((v) => isValidObjectId(v)).withMessage('project (ObjectId) requis'),
  body('type').isIn(DOC_TYPES as unknown as string[]).withMessage(`type ${DOC_TYPES.join('/')} requis`),
  body('originalName').isString().trim().isLength({ min: 1 }).withMessage('originalName requis'),
  body('mimeType').isString().trim().isLength({ min: 3 }).withMessage('mimeType requis'),
  body('contentBase64').isString().isLength({ min: 4 }).withMessage('contentBase64 requis'),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const project = await Project.findById(req.body.project).select('_id name').lean()
      if (!project) return respondError(res, 422, 'INVALID_PROJECT', 'Projet introuvable')
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour uploadedBy')

      const buffer = Buffer.from(String(req.body.contentBase64), 'base64')
      if (buffer.length === 0) {
        return respondError(res, 400, 'INVALID_BASE64', 'contentBase64 vide ou invalide')
      }
      if (buffer.length > RAW_LIMIT_BYTES) {
        return respondError(
          res,
          413,
          'FILE_TOO_LARGE',
          `Limite ${RAW_LIMIT_MB} Mo dépassée (reçu : ${(buffer.length / 1024 / 1024).toFixed(2)} Mo)`
        )
      }

      // Storage path : uploads/agent/<projectId>/<timestamp>-<random>-<filename>
      const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeFilename(
        String(req.body.originalName)
      )}`
      const relDir = path.join('uploads', 'agent', String(project._id))
      const relPath = path.join(relDir, filename)
      const absDir = path.resolve(process.cwd(), relDir)
      const absPath = path.resolve(process.cwd(), relPath)

      // Garde-fou contre path traversal (au cas où)
      if (!absPath.startsWith(uploadsRoot())) {
        return respondError(res, 400, 'INVALID_PATH', 'Path traversal détecté')
      }

      await fs.mkdir(absDir, { recursive: true })
      await fs.writeFile(absPath, buffer)

      const doc = await Document.create({
        project: project._id,
        type: req.body.type,
        originalName: String(req.body.originalName),
        storagePath: relPath, // chemin relatif pour rester portable
        mimeType: String(req.body.mimeType),
        uploadedBy: admin._id,
      })

      res.locals.audit = {
        entityType: 'Document',
        entityId: String(doc._id),
        entityRef: doc.originalName,
        summary: `Upload "${doc.originalName}" (${(buffer.length / 1024).toFixed(1)} Ko) sur ${project.name}`,
        after: { _id: doc._id, originalName: doc.originalName, mimeType: doc.mimeType, size: buffer.length },
      }

      res.status(201).json(doc.toObject())
    } catch (err) {
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// GET /documents/:id/download — renvoie le binaire
// ───────────────────────────────────────────────────────────────────────────

router.get(
  '/documents/:id/download',
  requireScope('read:documents'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const doc = await Document.findById(req.params.id)
      if (!doc) return respondError(res, 404, 'NOT_FOUND', 'Document introuvable')
      const absPath = path.resolve(process.cwd(), doc.storagePath)
      if (!absPath.startsWith(uploadsRoot())) {
        return respondError(res, 403, 'INVALID_PATH', 'Path traversal détecté')
      }
      try {
        await fs.access(absPath)
      } catch {
        return respondError(res, 410, 'FILE_GONE', 'Fichier physique introuvable')
      }

      // Best-effort : mettre à jour downloadedAt
      if (!doc.downloadedAt) {
        doc.downloadedAt = new Date()
        doc.save().catch(() => {})
      }

      res.setHeader('Content-Type', doc.mimeType)
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${doc.originalName.replace(/"/g, '_')}"`
      )
      createReadStream(absPath).pipe(res)
    } catch (err) {
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// DELETE /documents/:id — supprime DB + fichier (best-effort)
// ───────────────────────────────────────────────────────────────────────────

router.delete(
  '/documents/:id',
  requireScope('write:documents'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const doc = await Document.findById(req.params.id)
      if (!doc) return respondError(res, 404, 'NOT_FOUND', 'Document introuvable')
      const before = doc.toObject()
      const absPath = path.resolve(process.cwd(), doc.storagePath)
      // Suppression DB d'abord (la source de vérité)
      await Document.deleteOne({ _id: doc._id })
      // Suppression du fichier physique : best-effort, dans uploads/ uniquement
      if (absPath.startsWith(uploadsRoot())) {
        fs.unlink(absPath).catch(() => {
          // silencieux, fichier déjà absent
        })
      }
      res.locals.audit = {
        entityType: 'Document',
        entityId: String(doc._id),
        entityRef: doc.originalName,
        before,
      }
      res.json({ ok: true, deletedId: String(doc._id) })
    } catch (err) {
      next(err)
    }
  }
)

export default router
