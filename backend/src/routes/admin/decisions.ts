import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin, requireSuperAdmin } from '../../middleware/role.js'
import Decision from '../../models/Decision.js'
import User from '../../models/User.js'
import { createNotification } from '../../lib/notifications.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

const uploadDir = path.resolve(process.cwd(), 'uploads', 'decisions')
fs.mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024, files: 5 },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function contentDispositionFilename(name: string): string {
  const fallback = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

function inferMimeType(attachment: { originalName: string; mimeType?: string }): string {
  if (attachment.mimeType && attachment.mimeType !== 'application/octet-stream') return attachment.mimeType
  if (attachment.originalName.toLowerCase().endsWith('.pdf')) return 'application/pdf'
  return attachment.mimeType || 'application/octet-stream'
}

function serializeDecision(decision: any) {
  const obj = typeof decision.toObject === 'function' ? decision.toObject() : decision
  return {
    ...obj,
    attachments: (obj.attachments || []).map((attachment: any) => ({
      ...attachment,
      mimeType: inferMimeType(attachment),
    })),
  }
}

async function notifyDecision(
  decisionId: string,
  title: string,
  message: string,
  type: string,
  excludeUserId: string,
  extraRecipientIds: string[] = []
) {
  const superAdmins = await User.find({ role: 'SUPER_ADMIN', isActive: true }).select('_id').lean()
  const allIds = new Set([
    ...superAdmins.map((a) => String(a._id)),
    ...extraRecipientIds,
  ])
  allIds.delete(excludeUserId)
  await Promise.allSettled(
    Array.from(allIds).map((id) =>
      createNotification({
        recipient: id,
        type: type as any,
        title,
        message,
        link: `/admin/decisions`,
        metadata: { decisionId },
      })
    )
  )
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/admin/decisions
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, mine } = req.query
    const filter: Record<string, unknown> = {}
    if (typeof status === 'string') filter.status = status
    if (mine === 'true') filter.submittedBy = req.user!.id

    const decisions = await Decision.find(filter)
      .sort({ priority: -1, createdAt: -1 })
      .limit(50)
      .populate('submittedBy', 'name email avatarUrl')
      .populate('decidedBy', 'name email')
      .populate('recipients', 'name email')

    return res.json({ decisions: decisions.map(serializeDecision) })
  } catch (err) {
    return next(err)
  }
})

// GET /api/admin/decisions/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = await Decision.findById(req.params.id)
      .populate('submittedBy', 'name email avatarUrl')
      .populate('decidedBy', 'name email')
      .populate('recipients', 'name email')
    if (!decision) return res.status(404).json({ message: 'Décision introuvable' })
    return res.json({ decision })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/decisions — multipart (fichiers + champs texte)
router.post(
  '/',
  upload.array('files', 5),
  body('title').isString().isLength({ min: 3, max: 200 }),
  body('description').isString().isLength({ min: 3 }),
  body('category').optional().isIn(['BUDGET', 'EMBAUCHE', 'PROJET', 'PARTENARIAT', 'AUTRE']),
  body('priority').optional().isIn(['BASSE', 'NORMALE', 'HAUTE', 'URGENTE']),
  body('deadline').optional({ nullable: true }).isISO8601(),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

      const { title, description, category, priority, context, options, recommendation, deadline, recipients } = req.body

      // Destinataires ciblés (JSON string ou tableau)
      let recipientIds: string[] = []
      try {
        recipientIds = recipients ? JSON.parse(recipients) : []
      } catch {
        recipientIds = []
      }

      // Pièces jointes
      const files = (req.files || []) as Express.Multer.File[]
      const attachments = files.map((f) => ({
        originalName: f.originalname,
        storagePath: path.relative(process.cwd(), f.path),
        mimeType: f.mimetype,
        size: f.size,
      }))

      const decision = await Decision.create({
        title,
        description,
        category: category || 'AUTRE',
        priority: priority || 'NORMALE',
        submittedBy: req.user!.id,
        submittedByName: req.user!.name || req.user!.email || 'Inconnu',
        context: context || null,
        options: (() => { try { return JSON.parse(options || '[]') } catch { return [] } })().slice(0, 10),
        recommendation: recommendation || null,
        deadline: deadline ? new Date(deadline) : null,
        attachments,
        recipients: recipientIds,
      })

      const submitterName = req.user!.name || req.user!.email || 'Un admin'
      await notifyDecision(
        String(decision._id),
        'Nouvelle décision à valider',
        `${submitterName} a soumis : "${title}"`,
        'DECISION_SUBMITTED',
        req.user!.id,
        recipientIds
      )

      return res.status(201).json({ decision })
    } catch (err) {
      return next(err)
    }
  }
)

// GET /api/admin/decisions/:id/attachments/:index/download
router.get('/:id/attachments/:index/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = await Decision.findById(req.params.id)
    const index = Number(req.params.index)
    const attachment = decision?.attachments[index]
    if (!decision || !attachment) return res.status(404).json({ error: 'Fichier non trouvé' })

    const safeRoot = path.resolve(process.cwd(), 'uploads', 'decisions')
    const filePath = path.resolve(process.cwd(), attachment.storagePath)
    if (!filePath.startsWith(safeRoot)) return res.status(403).json({ error: 'Access denied' })

    const stat = await fs.promises.stat(filePath).catch(() => null)
    if (!stat?.isFile()) return res.status(404).json({ error: 'Fichier non trouvé' })

    const dispositionType = req.query.download === '1' ? 'attachment' : 'inline'
    res.setHeader('Content-Type', inferMimeType(attachment))
    res.setHeader('Content-Length', String(stat.size))
    res.setHeader(
      'Content-Disposition',
      `${dispositionType}; ${contentDispositionFilename(attachment.originalName)}`
    )
    res.setHeader('X-Content-Type-Options', 'nosniff')

    return res.sendFile(filePath)
  } catch (err) {
    return next(err)
  }
})

// PATCH /api/admin/decisions/:id/comment
router.patch(
  '/:id/comment',
  requireSuperAdmin,
  body('comment').optional({ nullable: true }).isString().isLength({ max: 2000 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

      const { comment } = req.body
      const decision = await Decision.findById(req.params.id)
      if (!decision) return res.status(404).json({ message: 'Décision introuvable' })

      decision.decisionComment = typeof comment === 'string' && comment.trim() ? comment.trim() : null
      await decision.save()

      return res.json({ decision })
    } catch (err) {
      return next(err)
    }
  }
)

// POST /api/admin/decisions/:id/approve
router.post('/:id/approve', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { comment } = req.body
    const decision = await Decision.findById(req.params.id)
    if (!decision) return res.status(404).json({ message: 'Décision introuvable' })
    if (decision.status !== 'PENDING') return res.status(409).json({ message: 'Décision déjà traitée' })

    decision.status = 'APPROVED'
    decision.decidedBy = req.user!.id as any
    decision.decidedByName = req.user!.name || req.user!.email || 'Super admin'
    decision.decisionComment = comment || null
    decision.decidedAt = new Date()
    await decision.save()

    if (String(decision.submittedBy) !== req.user!.id) {
      createNotification({
        recipient: decision.submittedBy,
        type: 'DECISION_APPROVED',
        title: 'Décision approuvée ✅',
        message: `"${decision.title}" a été approuvée${comment ? ` : ${comment}` : ''}`,
        link: '/admin/decisions',
        metadata: { decisionId: String(decision._id) },
      }).catch(() => {})
    }

    return res.json({ decision })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/decisions/:id/improve
router.post('/:id/improve', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { comment } = req.body
    const decision = await Decision.findById(req.params.id)
    if (!decision) return res.status(404).json({ message: 'Décision introuvable' })
    if (decision.status !== 'PENDING') return res.status(409).json({ message: 'Décision déjà traitée' })

    decision.status = 'IMPROVEMENT'
    decision.decidedBy = req.user!.id as any
    decision.decidedByName = req.user!.name || req.user!.email || 'Super admin'
    decision.decisionComment = typeof comment === 'string' && comment.trim() ? comment.trim() : decision.decisionComment || null
    decision.decidedAt = new Date()
    await decision.save()

    if (String(decision.submittedBy) !== req.user!.id) {
      createNotification({
        recipient: decision.submittedBy,
        type: 'DECISION_IMPROVEMENT',
        title: 'Décision à améliorer',
        message: `"${decision.title}" doit être améliorée${decision.decisionComment ? ` : ${decision.decisionComment}` : ''}`,
        link: '/admin/decisions',
        metadata: { decisionId: String(decision._id) },
      }).catch(() => {})
    }

    return res.json({ decision })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/decisions/:id/reject
router.post('/:id/reject', requireSuperAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { comment } = req.body
    const decision = await Decision.findById(req.params.id)
    if (!decision) return res.status(404).json({ message: 'Décision introuvable' })
    if (decision.status !== 'PENDING') return res.status(409).json({ message: 'Décision déjà traitée' })

    decision.status = 'REJECTED'
    decision.decidedBy = req.user!.id as any
    decision.decidedByName = req.user!.name || req.user!.email || 'Super admin'
    decision.decisionComment = comment || null
    decision.decidedAt = new Date()
    await decision.save()

    if (String(decision.submittedBy) !== req.user!.id) {
      createNotification({
        recipient: decision.submittedBy,
        type: 'DECISION_REJECTED',
        title: 'Décision refusée ❌',
        message: `"${decision.title}" a été refusée${comment ? ` : ${comment}` : ''}`,
        link: '/admin/decisions',
        metadata: { decisionId: String(decision._id) },
      }).catch(() => {})
    }

    return res.json({ decision })
  } catch (err) {
    return next(err)
  }
})

// DELETE /api/admin/decisions/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decision = await Decision.findById(req.params.id)
    if (!decision) return res.status(404).json({ message: 'Décision introuvable' })
    const isOwner = String(decision.submittedBy) === req.user!.id
    const isSuper = req.user!.role === 'SUPER_ADMIN'
    if (!isOwner && !isSuper) return res.status(403).json({ message: 'Accès refusé' })
    await decision.deleteOne()
    return res.json({ ok: true })
  } catch (err) {
    return next(err)
  }
})

export default router
