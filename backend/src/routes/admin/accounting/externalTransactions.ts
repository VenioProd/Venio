import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose, { type Types } from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import ExternalSource from '../../../models/ExternalSource.js'
import ExternalTransaction from '../../../models/ExternalTransaction.js'
import AccountingEntry from '../../../models/AccountingEntry.js'
import AccountingLine from '../../../models/AccountingLine.js'
import { normalizePayload } from '../../../lib/external/normalize.js'
import { classifyTransaction } from '../../../lib/external/classifier.js'
import { createEntry, deleteDraftEntry } from '../../../lib/accounting/doubleEntry.js'

/**
 * Admin — file d'attente des transactions externes (toutes sources confondues).
 *
 * - GET / : liste filtrable (status, sourceSlug, from, to) — perm VIEW_ACCOUNTING
 * - GET /:id : détail (rawPayload, normalizedPayload, écriture générée) — VIEW_ACCOUNTING
 * - POST /:id/replay : rejoue la classification (utile après mise à jour des rules) — MANAGE_ACCOUNTING
 */

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

function isValidObjectId(value: unknown): boolean {
  return mongoose.isValidObjectId(value)
}

router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        status,
        sourceSlug,
        externalId,
        from,
        to,
        page = '1',
        limit = '50',
      } = req.query as Record<string, string | undefined>
      const filter: Record<string, unknown> = {}
      if (status) filter.status = String(status)
      if (sourceSlug) filter.sourceSlug = String(sourceSlug).toLowerCase()
      if (externalId) filter.externalId = String(externalId)
      if (from || to) {
        const range: Record<string, Date> = {}
        if (from) range.$gte = new Date(String(from))
        if (to) range.$lte = new Date(String(to))
        filter.receivedAt = range
      }
      const skip = (Number(page) - 1) * Number(limit)
      const [items, total] = await Promise.all([
        ExternalTransaction.find(filter)
          .sort({ receivedAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .lean(),
        ExternalTransaction.countDocuments(filter),
      ])
      res.json({ items, total, page: Number(page), limit: Number(limit) })
    } catch (err) {
      next(err)
    }
  }
)

router.get(
  '/:id',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isValidObjectId(req.params.id)) {
        res.status(404).json({ error: 'Transaction introuvable' })
        return
      }
      const tx = await ExternalTransaction.findById(req.params.id).lean()
      if (!tx) {
        res.status(404).json({ error: 'Transaction introuvable' })
        return
      }
      let entry: unknown = null
      let lines: unknown[] = []
      if (tx.generatedEntry) {
        const entryDoc = await AccountingEntry.findById(tx.generatedEntry).lean()
        if (entryDoc) {
          entry = entryDoc
          lines = await AccountingLine.find({ entry: entryDoc._id })
            .sort({ sortIndex: 1 })
            .lean()
        }
      }
      res.json({ transaction: tx, entry, lines })
    } catch (err) {
      next(err)
    }
  }
)

/**
 * Rejoue la classification + création d'écriture pour une transaction.
 *
 * Comportement :
 *   - Si l'écriture précédente existe et est DRAFT : on la supprime
 *     puis on relance le pipeline (idempotency key réutilisée).
 *   - Si elle est VALIDATED/LOCKED : on refuse (422) — il faut d'abord
 *     l'annuler à la main via les routes accounting/entries.
 *   - Si pas d'écriture (REJECTED, AWAITING_REVIEW orphelin) : on relance
 *     simplement.
 */
router.post(
  '/:id/replay',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isValidObjectId(req.params.id)) {
        res.status(404).json({ error: 'Transaction introuvable' })
        return
      }
      const tx = await ExternalTransaction.findById(req.params.id)
      if (!tx) {
        res.status(404).json({ error: 'Transaction introuvable' })
        return
      }

      const source = await ExternalSource.findById(tx.source)
      if (!source) {
        res.status(400).json({ error: "Source d'origine supprimée" })
        return
      }

      // Supprimer une éventuelle écriture DRAFT précédente liée
      if (tx.generatedEntry) {
        const previous = await AccountingEntry.findById(tx.generatedEntry)
        if (previous) {
          if (previous.status === 'DRAFT') {
            await deleteDraftEntry(previous._id as Types.ObjectId)
          } else {
            res.status(422).json({
              error:
                "L'écriture liée est validée ou verrouillée — impossible de rejouer. Annulez-la manuellement avant.",
            })
            return
          }
        }
        tx.generatedEntry = null
      }

      try {
        const normalized = normalizePayload(tx.rawPayload)
        const classification = await classifyTransaction(source, normalized)
        const entryIdempotencyKey = `external:${source.slug}:${tx.idempotencyKey}`

        const result = await createEntry({
          journal: classification.journalCode,
          date: normalized.date,
          label: classification.labelTemplate,
          pieceRef: normalized.externalId || '',
          lines: classification.lines.map((l) => ({
            account: l.accountCode,
            label: l.label,
            debit: l.debit,
            credit: l.credit,
            vatRateValue: l.vatRateValue,
            lettrage: l.lettrage,
            auxiliaryRef: l.auxiliaryRef
              ? {
                  kind: (l.auxiliaryRef.kind || 'OTHER') as 'CLIENT' | 'SUPPLIER' | 'OTHER',
                  id: null,
                }
              : undefined,
          })),
          source: 'EXTERNAL',
          externalSource: source._id as Types.ObjectId,
          sourceRef: { kind: 'EXTERNAL_TX', id: tx._id as Types.ObjectId },
          idempotencyKey: entryIdempotencyKey,
          status: classification.autoValidate ? 'VALIDATED' : 'DRAFT',
          currency: normalized.currency || 'EUR',
          createdBy: req.user?.id || null,
          notes: classification.auxiliaryWarnings?.join(' | ') || '',
        })

        tx.status = classification.autoValidate ? 'POSTED' : 'AWAITING_REVIEW'
        tx.autoValidated = Boolean(classification.autoValidate)
        tx.matchedRule = classification.ruleId
        tx.normalizedPayload = normalized
        tx.generatedEntry = result.entry._id as Types.ObjectId
        tx.errorReason = ''
        tx.processedAt = new Date()
        await tx.save()

        res.json({
          transaction: tx,
          entry: {
            _id: result.entry._id,
            entryNumber: result.entry.entryNumber,
            status: result.entry.status,
          },
          replayed: true,
        })
      } catch (err) {
        const e = err as Error & { errors?: unknown[]; status?: number }
        tx.status = 'REJECTED'
        tx.errorReason =
          e.errors && Array.isArray(e.errors)
            ? JSON.stringify(e.errors)
            : e.message || 'Erreur inconnue'
        tx.processedAt = new Date()
        await tx.save()
        res.status(e.status || 422).json({
          error: e.message || 'Replay échoué',
          errors: e.errors || undefined,
          transaction: tx,
        })
      }
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status) {
        res.status(e.status).json({ error: e.message })
        return
      }
      next(err)
    }
  }
)

export default router
