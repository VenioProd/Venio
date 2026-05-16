import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import AccountingEntry from '../../../models/AccountingEntry.js'
import AccountingLine from '../../../models/AccountingLine.js'
import AuditLog from '../../../models/AuditLog.js'
import {
  createEntry,
  validateEntry,
} from '../../../lib/accounting/doubleEntry.js'
import { softDeleteEntry } from '../../../lib/audit/wrapEntryOps.js'
import { buildActorFromReq } from '../../../lib/audit/auditMiddleware.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

router.get('/', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const { journal, status, source, from, to, search, page = 1, limit = 50 } = req.query
    const filter = { archivedAt: null }
    if (journal) filter.journalCode = String(journal).toUpperCase()
    if (status) filter.status = status
    if (source) filter.source = source
    if (from || to) {
      filter.date = {}
      if (from) filter.date.$gte = new Date(from)
      if (to) filter.date.$lte = new Date(to)
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
})

router.get('/:id', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const entry = await AccountingEntry.findById(req.params.id).lean()
    if (!entry) return res.status(404).json({ error: 'Écriture introuvable' })
    const lines = await AccountingLine.find({ entry: entry._id }).sort({ sortIndex: 1 }).lean()
    res.json({ entry, lines })
  } catch (err) {
    next(err)
  }
})

router.post('/', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
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
      createdBy: req.user.id,
      notes,
    })

    // Audit : création + validation simultanée si status=VALIDATED.
    const actor = buildActorFromReq(req)
    AuditLog.record({
      action: 'ENTRY_CREATE',
      entityType: 'AccountingEntry',
      entityId: result.entry._id,
      entityRef: result.entry.entryNumber,
      actor,
      summary: `Création manuelle ${result.entry.entryNumber} (${result.entry.status})`,
      after: {
        entryNumber: result.entry.entryNumber,
        journalCode: result.entry.journalCode,
        date: result.entry.date,
        label: result.entry.label,
        status: result.entry.status,
        totalDebit: result.entry.totalDebit,
        totalCredit: result.entry.totalCredit,
      },
      metadata: { lineCount: result.lines.length },
    })

    res.status(201).json({ entry: result.entry, lines: result.lines })
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message })
    }
    next(err)
  }
})

router.post('/:id/validate', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const entry = await validateEntry(req.params.id, { userId: req.user.id })
    AuditLog.record({
      action: 'ENTRY_VALIDATE',
      entityType: 'AccountingEntry',
      entityId: entry._id,
      entityRef: entry.entryNumber,
      actor: buildActorFromReq(req),
      summary: `Validation de ${entry.entryNumber}`,
      after: {
        status: entry.status,
        validatedAt: entry.validatedAt,
        totalDebit: entry.totalDebit,
        totalCredit: entry.totalCredit,
      },
    })
    res.json({ entry })
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message })
    }
    next(err)
  }
})

router.post('/bulk-validate', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const { ids } = req.body || {}
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids[] requis' })
    }
    const actor = buildActorFromReq(req)
    const results = []
    for (const id of ids) {
      try {
        const entry = await validateEntry(id, { userId: req.user.id })
        results.push({ id, ok: true, entryNumber: entry.entryNumber })
        AuditLog.record({
          action: 'ENTRY_VALIDATE',
          entityType: 'AccountingEntry',
          entityId: entry._id,
          entityRef: entry.entryNumber,
          actor,
          summary: `Validation en masse de ${entry.entryNumber}`,
          after: {
            status: entry.status,
            validatedAt: entry.validatedAt,
            totalDebit: entry.totalDebit,
            totalCredit: entry.totalCredit,
          },
          metadata: { bulk: true },
        })
      } catch (err) {
        results.push({ id, ok: false, error: err.message })
      }
    }
    res.json({ results })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    // Soft delete homogène : archivedAt = now + audit. Refusé si != DRAFT.
    await softDeleteEntry(req.params.id, buildActorFromReq(req))
    res.json({ ok: true })
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message })
    }
    next(err)
  }
})

export default router
