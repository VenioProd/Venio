import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { body, param, validationResult } from 'express-validator'
import BillingDocument from '../../models/BillingDocument.js'
import Project from '../../models/Project.js'
import User from '../../models/User.js'
import { getNextSequence } from '../../models/Sequence.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour la facturation (BillingDocument).
 *
 * Types : QUOTE (devis) et INVOICE (facture). Statuts : DRAFT, ISSUED, SENT,
 * ACCEPTED, PAID, CANCELLED.
 *
 * Numérotation auto via Sequence (DEV-0001, FAC-0001…). L'agent peut aussi
 * fournir un `number` explicite (rare, pour migration). Le numéro est unique.
 *
 * Calcul des totaux : `subtotal = Σ lines.total`, `taxTotal = Σ lines.total *
 * lines.taxRate/100`, `total = subtotal + taxTotal`. Si `lines.total` n'est
 * pas fourni, on calcule `quantity * unitPrice`.
 *
 * Transitions de statut typées via endpoints dédiés :
 *   POST /:id/issue       DRAFT → ISSUED (+ issuedAt)
 *   POST /:id/mark-sent   ISSUED → SENT  (+ sentAt)
 *   POST /:id/mark-paid   * → PAID       (+ paidAt)
 *   POST /:id/cancel      * → CANCELLED
 *
 * DELETE : autorisé uniquement sur DRAFT (sinon 409). Pour invalider un doc
 * émis, utiliser cancel.
 */

const router = express.Router()

const TYPES = ['QUOTE', 'INVOICE'] as const
const STATUSES = ['DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'PAID', 'CANCELLED'] as const

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

interface RawBillingLine {
  description?: unknown
  quantity?: unknown
  unitPrice?: unknown
  taxRate?: unknown
  total?: unknown
}

interface NormalizedLine {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  total: number
}

interface ComputedTotals {
  lines: NormalizedLine[]
  subtotal: number
  taxTotal: number
  total: number
}

function normalizeLines(raw: unknown): NormalizedLine[] {
  if (!Array.isArray(raw)) return []
  return raw.map((l: RawBillingLine): NormalizedLine => {
    const quantity = Number(l.quantity) || 1
    const unitPrice = Number(l.unitPrice) || 0
    const taxRate = Number(l.taxRate) || 0
    const lineTotal = l.total !== undefined && l.total !== null ? Number(l.total) : quantity * unitPrice
    return {
      description: String(l.description || ''),
      quantity,
      unitPrice,
      taxRate,
      total: Number.isFinite(lineTotal) ? lineTotal : 0,
    }
  })
}

function computeTotals(lines: NormalizedLine[]): ComputedTotals {
  const subtotal = lines.reduce((s, l) => s + (l.total || 0), 0)
  const taxTotal = lines.reduce((s, l) => s + (l.total || 0) * ((l.taxRate || 0) / 100), 0)
  return { lines, subtotal, taxTotal, total: subtotal + taxTotal }
}

async function nextBillingNumber(type: 'QUOTE' | 'INVOICE'): Promise<string> {
  if (type === 'QUOTE') {
    const seq = await getNextSequence('quoteNumber', { prefix: 'DEV-', padding: 4 })
    return seq.formatted
  }
  const seq = await getNextSequence('invoiceNumber', { prefix: 'FAC-', padding: 4 })
  return seq.formatted
}

// ───────────────────────────────────────────────────────────────────────────
// GET /billing — liste paginée + filtres
// ───────────────────────────────────────────────────────────────────────────

router.get('/billing', requireScope('read:billing'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.type === 'string' && (TYPES as readonly string[]).includes(req.query.type)) {
      filter.type = req.query.type
    }
    if (typeof req.query.status === 'string' && (STATUSES as readonly string[]).includes(req.query.status)) {
      filter.status = req.query.status
    }
    if (typeof req.query.project === 'string' && isValidObjectId(req.query.project)) {
      filter.project = req.query.project
    }
    if (typeof req.query.client === 'string' && isValidObjectId(req.query.client)) {
      filter.client = req.query.client
    }
    if (typeof req.query.q === 'string' && req.query.q.trim()) {
      const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ number: regex }, { note: regex }]
    }

    const [items, total] = await Promise.all([
      BillingDocument.find(filter)
        .sort({ createdAt: -1 })
        .skip(pag.skip)
        .limit(pag.limit)
        .populate('project', 'name')
        .populate('client', 'name email companyName')
        .lean(),
      BillingDocument.countDocuments(filter),
    ])

    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

router.get(
  '/billing/:id',
  requireScope('read:billing'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const doc = await BillingDocument.findById(req.params.id)
        .populate('project', 'name')
        .populate('client', 'name email companyName')
        .lean()
      if (!doc) return respondError(res, 404, 'NOT_FOUND', 'Document introuvable')
      res.json(doc)
    } catch (err) {
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// POST /billing — crée QUOTE ou INVOICE
// ───────────────────────────────────────────────────────────────────────────

router.post(
  '/billing',
  requireScope('write:billing'),
  body('type').isIn(TYPES as unknown as string[]).withMessage('type QUOTE ou INVOICE requis'),
  body('project').custom((v) => isValidObjectId(v)).withMessage('project (ObjectId) requis'),
  body('lines').optional().isArray(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const project = await Project.findById(req.body.project).lean()
      if (!project) return respondError(res, 422, 'INVALID_PROJECT', 'Projet introuvable')

      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN pour createdBy')

      const lines = normalizeLines(req.body.lines)
      // Si aucune ligne fournie, on crée une ligne par défaut depuis le budget
      if (lines.length === 0) {
        const budget = project.budget?.amount ?? 0
        lines.push({
          description: project.summary || project.name || 'Prestation',
          quantity: 1,
          unitPrice: budget,
          taxRate: 0,
          total: budget,
        })
      }
      const totals = computeTotals(lines)

      const number = req.body.number ? String(req.body.number).trim() : await nextBillingNumber(req.body.type)

      const doc = await BillingDocument.create({
        type: req.body.type,
        number,
        project: project._id,
        client: project.client,
        status: 'DRAFT',
        lines: totals.lines,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        currency: typeof req.body.currency === 'string' ? req.body.currency : project.budget?.currency || 'EUR',
        dueAt: req.body.dueAt ? new Date(req.body.dueAt) : null,
        note: typeof req.body.note === 'string' ? req.body.note : '',
        createdBy: admin._id,
      })

      res.locals.audit = {
        entityType: 'BillingDocument',
        entityId: String(doc._id),
        entityRef: doc.number,
        summary: `Création ${doc.type} ${doc.number} (${doc.total.toFixed(2)} ${doc.currency})`,
        after: doc.toObject(),
      }
      res.status(201).json(doc.toObject())
    } catch (err) {
      // Numéro déjà utilisé → 409
      if ((err as { code?: number }).code === 11000) {
        return respondError(res, 409, 'NUMBER_ALREADY_EXISTS', 'Ce numéro de document existe déjà')
      }
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// PATCH /billing/:id — modifie un DRAFT (autres statuts : seuls dueAt/note/sentAt)
// ───────────────────────────────────────────────────────────────────────────

router.patch(
  '/billing/:id',
  requireScope('write:billing'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const doc = await BillingDocument.findById(req.params.id)
      if (!doc) return respondError(res, 404, 'NOT_FOUND', 'Document introuvable')
      const before = doc.toObject()

      // Sur les non-DRAFT on autorise un sous-ensemble très restreint
      const isDraft = doc.status === 'DRAFT'

      if (Array.isArray(req.body.lines)) {
        if (!isDraft) {
          return respondError(res, 409, 'IMMUTABLE_AFTER_DRAFT', 'Lignes non modifiables après émission')
        }
        const totals = computeTotals(normalizeLines(req.body.lines))
        doc.lines = totals.lines as unknown as typeof doc.lines
        doc.subtotal = totals.subtotal
        doc.taxTotal = totals.taxTotal
        doc.total = totals.total
      }
      if (typeof req.body.note === 'string') doc.note = req.body.note
      if (req.body.dueAt !== undefined) {
        doc.dueAt = req.body.dueAt ? new Date(req.body.dueAt) : null
      }
      if (typeof req.body.currency === 'string' && isDraft) {
        doc.currency = req.body.currency
      }
      if (typeof req.body.number === 'string' && isDraft) {
        doc.number = req.body.number.trim()
      }

      await doc.save()
      res.locals.audit = {
        entityType: 'BillingDocument',
        entityId: String(doc._id),
        entityRef: doc.number,
        before,
        after: doc.toObject(),
      }
      res.json(doc.toObject())
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        return respondError(res, 409, 'NUMBER_ALREADY_EXISTS', 'Ce numéro de document existe déjà')
      }
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// Transitions de statut (endpoints typés, plus parlants qu'un PATCH status)
// ───────────────────────────────────────────────────────────────────────────

function transition(
  to: typeof STATUSES[number],
  options: { from?: readonly string[]; setField?: 'issuedAt' | 'sentAt' | 'paidAt' } = {}
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg)
      return
    }
    try {
      const doc = await BillingDocument.findById(req.params.id)
      if (!doc) {
        respondError(res, 404, 'NOT_FOUND', 'Document introuvable')
        return
      }
      if (options.from && !options.from.includes(doc.status)) {
        respondError(
          res,
          409,
          'INVALID_TRANSITION',
          `Transition ${doc.status} → ${to} non autorisée. Attendu : ${options.from.join(', ')}`
        )
        return
      }
      const before = doc.toObject()
      doc.status = to
      if (options.setField) {
        ;(doc as unknown as Record<string, Date>)[options.setField] = new Date()
      }
      await doc.save()
      res.locals.audit = {
        entityType: 'BillingDocument',
        entityId: String(doc._id),
        entityRef: doc.number,
        summary: `${doc.number} : ${before.status} → ${to}`,
        before,
        after: doc.toObject(),
      }
      res.json(doc.toObject())
    } catch (err) {
      next(err)
    }
  }
}

router.post(
  '/billing/:id/issue',
  requireScope('write:billing'),
  param('id').isMongoId(),
  transition('ISSUED', { from: ['DRAFT'], setField: 'issuedAt' })
)

router.post(
  '/billing/:id/mark-sent',
  requireScope('write:billing'),
  param('id').isMongoId(),
  transition('SENT', { from: ['ISSUED'], setField: 'sentAt' })
)

router.post(
  '/billing/:id/mark-paid',
  requireScope('write:billing'),
  param('id').isMongoId(),
  transition('PAID', { from: ['ISSUED', 'SENT', 'ACCEPTED'], setField: 'paidAt' })
)

router.post(
  '/billing/:id/accept',
  requireScope('write:billing'),
  param('id').isMongoId(),
  transition('ACCEPTED', { from: ['ISSUED', 'SENT'] })
)

router.post(
  '/billing/:id/cancel',
  requireScope('write:billing'),
  param('id').isMongoId(),
  transition('CANCELLED')
)

// ───────────────────────────────────────────────────────────────────────────
// DELETE /billing/:id — uniquement sur DRAFT
// ───────────────────────────────────────────────────────────────────────────

router.delete(
  '/billing/:id',
  requireScope('write:billing'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const doc = await BillingDocument.findById(req.params.id)
      if (!doc) return respondError(res, 404, 'NOT_FOUND', 'Document introuvable')
      if (doc.status !== 'DRAFT') {
        return respondError(
          res,
          409,
          'IMMUTABLE_AFTER_DRAFT',
          'Suppression réservée aux DRAFT. Pour invalider un document émis, utiliser /cancel.'
        )
      }
      const before = doc.toObject()
      await BillingDocument.deleteOne({ _id: doc._id })
      res.locals.audit = {
        entityType: 'BillingDocument',
        entityId: String(doc._id),
        entityRef: doc.number,
        before,
      }
      res.json({ ok: true, deletedId: String(doc._id) })
    } catch (err) {
      next(err)
    }
  }
)

export default router
