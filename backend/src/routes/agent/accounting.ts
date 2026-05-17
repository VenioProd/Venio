import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { param, validationResult } from 'express-validator'
import AccountingEntry from '../../models/AccountingEntry.js'
import AccountingLine from '../../models/AccountingLine.js'
import ChartOfAccount from '../../models/ChartOfAccount.js'
import Journal from '../../models/Journal.js'
import VatRate from '../../models/VatRate.js'
import VatDeclaration from '../../models/VatDeclaration.js'
import FiscalYear from '../../models/FiscalYear.js'
import ExternalSource from '../../models/ExternalSource.js'
import ExternalTransaction from '../../models/ExternalTransaction.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour la comptabilité — LECTURE SEULE en V1 (cf. spec).
 *
 * Scope unique : `read:accounting`.
 *
 * Couvre :
 *   - Écritures (AccountingEntry) avec lignes (AccountingLine)
 *   - Plan comptable (ChartOfAccount)
 *   - Journaux (Journal)
 *   - Taux de TVA (VatRate)
 *   - Exercices fiscaux (FiscalYear)
 *   - Déclarations TVA (VatDeclaration)
 *   - Sources externes d'ingestion + leurs transactions
 *   - /accounting/dashboard : KPIs agrégés (entrées récentes, totaux par statut)
 */

const router = express.Router()

const ENTRY_STATUSES = ['DRAFT', 'VALIDATED', 'LOCKED'] as const

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

// ═══════════════════════════════════════════════════════════════════════════
// Écritures + lignes
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  '/accounting/entries',
  requireScope('read:accounting'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = {}
      if (typeof req.query.journal === 'string') {
        if (isValidObjectId(req.query.journal)) {
          filter.journal = req.query.journal
        } else {
          filter.journalCode = String(req.query.journal).toUpperCase()
        }
      }
      if (typeof req.query.fiscalYear === 'string' && isValidObjectId(req.query.fiscalYear)) {
        filter.fiscalYear = req.query.fiscalYear
      }
      if (
        typeof req.query.status === 'string' &&
        (ENTRY_STATUSES as readonly string[]).includes(req.query.status)
      ) {
        filter.status = req.query.status
      }
      if (typeof req.query.from === 'string' || typeof req.query.to === 'string') {
        const range: Record<string, Date> = {}
        if (typeof req.query.from === 'string' && !Number.isNaN(Date.parse(req.query.from))) {
          range.$gte = new Date(req.query.from)
        }
        if (typeof req.query.to === 'string' && !Number.isNaN(Date.parse(req.query.to))) {
          range.$lte = new Date(req.query.to)
        }
        if (Object.keys(range).length > 0) filter.date = range
      }
      if (typeof req.query.q === 'string' && req.query.q.trim()) {
        const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        filter.$or = [{ label: regex }, { pieceRef: regex }, { entryNumber: regex }]
      }
      const [items, total] = await Promise.all([
        AccountingEntry.find(filter)
          .sort({ date: -1, _id: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .populate('journal', 'code label type')
          .populate('fiscalYear', 'label startDate endDate')
          .lean(),
        AccountingEntry.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/accounting/entries/:id',
  requireScope('read:accounting'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const entry = await AccountingEntry.findById(req.params.id)
        .populate('journal', 'code label type')
        .populate('fiscalYear', 'label startDate endDate')
        .lean()
      if (!entry) return respondError(res, 404, 'NOT_FOUND', 'Écriture introuvable')
      const lines = await AccountingLine.find({ entry: entry._id })
        .sort({ sortIndex: 1 })
        .populate('account', 'code label type')
        .populate('vatRate', 'code rate')
        .lean()
      res.json({ entry, lines })
    } catch (err) {
      next(err)
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// Référentiels
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  '/accounting/journals',
  requireScope('read:accounting'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await Journal.find().sort({ code: 1 }).lean()
      res.json({ items })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/accounting/chart-of-accounts',
  requireScope('read:accounting'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = {}
      if (typeof req.query.type === 'string') filter.type = req.query.type
      if (typeof req.query.active === 'string') {
        filter.isActive = req.query.active === 'true'
      }
      if (typeof req.query.q === 'string' && req.query.q.trim()) {
        const regex = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        filter.$or = [{ code: regex }, { label: regex }]
      }
      const [items, total] = await Promise.all([
        ChartOfAccount.find(filter).sort({ code: 1 }).skip(pag.skip).limit(pag.limit).lean(),
        ChartOfAccount.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/accounting/vat-rates',
  requireScope('read:accounting'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await VatRate.find().sort({ rate: 1 }).lean()
      res.json({ items })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/accounting/fiscal-years',
  requireScope('read:accounting'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await FiscalYear.find().sort({ startDate: -1 }).lean()
      res.json({ items })
    } catch (err) {
      next(err)
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// Déclarations TVA
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  '/accounting/vat-declarations',
  requireScope('read:accounting'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = {}
      if (typeof req.query.fiscalYear === 'string' && isValidObjectId(req.query.fiscalYear)) {
        filter.fiscalYear = req.query.fiscalYear
      }
      if (typeof req.query.status === 'string') filter.status = req.query.status
      const [items, total] = await Promise.all([
        VatDeclaration.find(filter)
          .sort({ periodStart: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .populate('fiscalYear', 'label')
          .lean(),
        VatDeclaration.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/accounting/vat-declarations/:id',
  requireScope('read:accounting'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const d = await VatDeclaration.findById(req.params.id)
        .populate('fiscalYear', 'label startDate endDate')
        .lean()
      if (!d) return respondError(res, 404, 'NOT_FOUND', 'Déclaration introuvable')
      res.json(d)
    } catch (err) {
      next(err)
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// Sources externes + transactions
// ═══════════════════════════════════════════════════════════════════════════

router.get(
  '/accounting/external-sources',
  requireScope('read:accounting'),
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await ExternalSource.find()
        .sort({ createdAt: -1 })
        .select('-apiKeyHash -webhookSecret')
        .lean()
      res.json({ items })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/accounting/external-sources/:id',
  requireScope('read:accounting'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const s = await ExternalSource.findById(req.params.id)
        .select('-apiKeyHash -webhookSecret')
        .lean()
      if (!s) return respondError(res, 404, 'NOT_FOUND', 'Source introuvable')
      res.json(s)
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/accounting/external-transactions',
  requireScope('read:accounting'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = {}
      if (typeof req.query.source === 'string' && isValidObjectId(req.query.source)) {
        filter.source = req.query.source
      }
      if (typeof req.query.sourceSlug === 'string') {
        filter.sourceSlug = req.query.sourceSlug
      }
      if (typeof req.query.status === 'string') filter.status = req.query.status
      const [items, total] = await Promise.all([
        ExternalTransaction.find(filter)
          .sort({ receivedAt: -1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .lean(),
        ExternalTransaction.countDocuments(filter),
      ])
      res.json(paginatedResponse(items, pag, total))
    } catch (err) {
      next(err)
    }
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard — KPIs agrégés
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /accounting/dashboard
 *   ?fiscalYear=<id>    optionnel (défaut : exercice courant si on en trouve un)
 *
 * Retourne :
 *   {
 *     fiscalYear: {...} | null,
 *     entries: { byStatus: { DRAFT, VALIDATED, LOCKED }, total },
 *     periods: { last30Days: { entries, totalDebit, totalCredit } },
 *     openVatDeclarations: <count>,
 *     externalIngestion: { activeSources, last24h: <transactions> },
 *   }
 */
router.get(
  '/accounting/dashboard',
  requireScope('read:accounting'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const fyId =
        typeof req.query.fiscalYear === 'string' && isValidObjectId(req.query.fiscalYear)
          ? req.query.fiscalYear
          : null
      const fiscalYear = fyId
        ? await FiscalYear.findById(fyId).lean()
        : await FiscalYear.findOne({ status: 'OUVERT' }).sort({ startDate: -1 }).lean()

      const entryFilter: Record<string, unknown> = {}
      if (fiscalYear) entryFilter.fiscalYear = fiscalYear._id

      const [drafts, validated, locked, totalEntries] = await Promise.all([
        AccountingEntry.countDocuments({ ...entryFilter, status: 'DRAFT' }),
        AccountingEntry.countDocuments({ ...entryFilter, status: 'VALIDATED' }),
        AccountingEntry.countDocuments({ ...entryFilter, status: 'LOCKED' }),
        AccountingEntry.countDocuments(entryFilter),
      ])

      const last30d = new Date(Date.now() - 30 * 24 * 3600 * 1000)
      const recent = await AccountingEntry.aggregate([
        { $match: { ...entryFilter, date: { $gte: last30d } } },
        {
          $group: {
            _id: null,
            entries: { $sum: 1 },
            totalDebit: { $sum: '$totalDebit' },
            totalCredit: { $sum: '$totalCredit' },
          },
        },
      ])

      const last24h = new Date(Date.now() - 24 * 3600 * 1000)
      const [openVatDecls, activeSources, recentIngest] = await Promise.all([
        VatDeclaration.countDocuments({ status: 'DRAFT' }),
        ExternalSource.countDocuments({ status: 'ACTIVE' }),
        ExternalTransaction.countDocuments({ receivedAt: { $gte: last24h } }),
      ])

      res.json({
        fiscalYear: fiscalYear || null,
        entries: {
          byStatus: { DRAFT: drafts, VALIDATED: validated, LOCKED: locked },
          total: totalEntries,
        },
        periods: {
          last30Days: recent[0] || { entries: 0, totalDebit: 0, totalCredit: 0 },
        },
        openVatDeclarations: openVatDecls,
        externalIngestion: { activeSources, last24h: recentIngest },
      })
    } catch (err) {
      next(err)
    }
  }
)

export default router
