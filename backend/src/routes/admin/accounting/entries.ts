import express, { type Request, type Response, type NextFunction } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import AccountingEntry from '../../../models/AccountingEntry.js'
import AccountingLine from '../../../models/AccountingLine.js'
import { createEntry, validateEntry, deleteDraftEntry } from '../../../lib/accounting/doubleEntry.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// GET / : liste paginée des écritures, hors archivées
router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { journal, status, source, from, to, search, page = '1', limit = '50' } = req.query as Record<string, string | undefined>
      const filter: Record<string, unknown> = { archivedAt: null }
      if (journal) filter.journalCode = String(journal).toUpperCase()
      if (status) filter.status = status
      if (source) filter.source = source
      if (from || to) {
        const dateFilter: Record<string, Date> = {}
        if (from) dateFilter.$gte = new Date(from)
        if (to) dateFilter.$lte = new Date(to)
        filter.date = dateFilter
      }
      if (search) {
        filter.$or = [
          { entryNumber: { $regex: search, $options: 'i' } },
          { label: { $regex: search, $options: 'i' } },
          { pieceRef: { $regex: search, $options: 'i' } },
        ]
      }
      const skip = (Number(page) - 1) * Number(limit)
      const [entries, total] = await Promise.all([
        AccountingEntry.find(filter)
          .sort({ date: -1, createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        AccountingEntry.countDocuments(filter),
      ])
      res.json({ entries, total, page: Number(page), limit: Number(limit) })
    } catch (err) {
      next(err)
    }
  }
)

// GET /:id : détail d'une écriture + ses lignes
router.get(
  '/:id',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const entry = await AccountingEntry.findById(req.params.id).lean()
      if (!entry) {
        res.status(404).json({ error: 'Écriture introuvable' })
        return
      }
      const lines = await AccountingLine.find({ entry: entry._id }).sort({ sortIndex: 1 }).lean()
      res.json({ entry, lines })
    } catch (err) {
      next(err)
    }
  }
)

// POST / : crée une écriture manuelle
router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { journal, date, label, pieceRef, lines, status, notes } = req.body || {}
      const result = await createEntry({
        journal,
        date,
        label,
        pieceRef,
        lines,
        source: 'MANUAL',
        status: status === 'VALIDATED' ? 'VALIDATED' : 'DRAFT',
        createdBy: req.user!.id,
        notes,
      })
      res.status(201).json({ entry: result.entry, lines: result.lines })
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status) {
        res.status(status).json({ error: (err as Error).message })
        return
      }
      next(err)
    }
  }
)

// POST /:id/validate : passe DRAFT → VALIDATED
router.post(
  '/:id/validate',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const entry = await validateEntry(String(req.params.id), { userId: req.user!.id })
      res.json({ entry })
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status) {
        res.status(status).json({ error: (err as Error).message })
        return
      }
      next(err)
    }
  }
)

// POST /bulk-validate : valide plusieurs écritures à la fois (best-effort par id)
router.post(
  '/bulk-validate',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ids } = req.body || {}
      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: 'ids[] requis' })
        return
      }
      const results: Array<{ id: string; ok: boolean; entryNumber?: string; error?: string }> = []
      for (const id of ids) {
        try {
          const entry = await validateEntry(id, { userId: req.user!.id })
          results.push({ id, ok: true, entryNumber: entry.entryNumber })
        } catch (err) {
          results.push({ id, ok: false, error: (err as Error).message })
        }
      }
      res.json({ results })
    } catch (err) {
      next(err)
    }
  }
)

// DELETE /:id : suppression d'une écriture DRAFT (refusée sinon)
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await deleteDraftEntry(String(req.params.id))
      res.json({ ok: true })
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status) {
        res.status(status).json({ error: (err as Error).message })
        return
      }
      next(err)
    }
  }
)

export default router
