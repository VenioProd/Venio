import express, { type Request, type Response, type NextFunction } from 'express'
import type { Types } from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import FiscalYear from '../../../models/FiscalYear.js'
import AccountingEntry from '../../../models/AccountingEntry.js'
import Journal from '../../../models/Journal.js'
import ChartOfAccount from '../../../models/ChartOfAccount.js'
import { createEntry, type CreateEntryLineInput } from '../../../lib/accounting/doubleEntry.js'
import { computeAccountBalances } from '../../../lib/accounting/reports/balanceCompute.js'
import { runInTransaction } from '../../../lib/transaction.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const EPSILON = 0.01

function round2(n: number | null | undefined): number {
  return Math.round(Number(n || 0) * 100) / 100
}

// GET / : liste les exercices fiscaux (du plus récent au plus ancien)
router.get(
  '/',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const years = await FiscalYear.find().sort({ startDate: -1 }).lean()
      res.json({ fiscalYears: years })
    } catch (err) {
      next(err)
    }
  },
)

// POST / : crée un exercice
router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code, label, startDate, endDate } = req.body || {}
      if (!code || !startDate || !endDate) {
        res.status(400).json({ error: 'code, startDate, endDate requis' })
        return
      }
      const fy = await FiscalYear.create({
        code,
        label: label || code,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: 'OUVERT',
      })
      res.status(201).json({ fiscalYear: fy })
    } catch (err) {
      next(err)
    }
  },
)

// PATCH /:id : met à jour un exercice (refusé si CLOTURE)
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fy = await FiscalYear.findById(req.params.id)
      if (!fy) {
        res.status(404).json({ error: 'Exercice introuvable' })
        return
      }
      if (fy.status === 'CLOTURE') {
        res.status(423).json({ error: 'Exercice clôturé, modification impossible' })
        return
      }
      const { code, label, startDate, endDate } = req.body || {}
      if (code !== undefined) fy.code = code
      if (label !== undefined) fy.label = label
      if (startDate !== undefined) fy.startDate = new Date(startDate)
      if (endDate !== undefined) fy.endDate = new Date(endDate)
      await fy.save()
      res.json({ fiscalYear: fy })
    } catch (err) {
      next(err)
    }
  },
)

// ----------------------------------------------------------------------------
// POST /:id/close
// Clôture un exercice :
//  1. Refuse s'il reste des écritures DRAFT sur l'exercice.
//  2. Refuse si l'ensemble de l'exercice n'est pas équilibré.
//  3. Crée l'exercice suivant s'il n'existe pas (auto ou fourni dans le body).
//  4. Calcule les soldes des comptes bilan (classes 1-5).
//  5. Calcule le résultat (Σ produits 7 - Σ charges 6) et l'affecte au 120
//     (bénéfice) ou 129 (perte).
//  6. Crée l'écriture AN dans le nouvel exercice à sa startDate, status
//     VALIDATED, et la lettre 'AN'.
//  7. Verrouille toutes les écritures de l'exercice clos (status LOCKED).
//  8. Marque l'exercice clos comme CLOTURE et stocke openingEntryId.
// ----------------------------------------------------------------------------
interface CloseBody {
  nextFiscalYear?: {
    code?: string
    label?: string
    startDate?: string
    endDate?: string
  }
}

router.post(
  '/:id/close',
  requirePermission(PERMISSIONS.LOCK_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await runInTransaction(async (session) => {
        const updated = await FiscalYear.updateOne(
          { _id: req.params.id, status: 'OUVERT' },
          { $currentDate: { updatedAt: true } },
          { session },
        )
        const fy = await FiscalYear.findById(req.params.id).session(session)
        if (!fy) {
          throw Object.assign(new Error('Exercice introuvable'), { status: 404 })
        }
        if (updated.matchedCount === 0) {
          throw Object.assign(new Error('Exercice déjà clôturé'), { status: 400 })
        }

        // 1. Aucun draft autorisé sur l'exercice.
        const drafts = await AccountingEntry.find(
          { fiscalYear: fy._id, status: 'DRAFT' },
          { entryNumber: 1, date: 1, journalCode: 1 },
        )
          .session(session)
          .sort({ date: 1 })
          .lean()
        if (drafts.length > 0) {
          throw Object.assign(
            new Error('Des écritures DRAFT subsistent — validez-les ou supprimez-les avant la clôture'),
            {
              status: 400,
              draftEntries: drafts.map((d) => ({
                entryNumber: d.entryNumber,
                date: d.date,
                journalCode: d.journalCode,
              })),
            },
          )
        }

        // 2. Équilibre global de l'exercice (sur entries VALIDATED).
        const totals = (await AccountingEntry.aggregate([
          { $match: { fiscalYear: fy._id, status: { $in: ['VALIDATED', 'LOCKED'] } } },
          {
            $group: {
              _id: null,
              totalDebit: { $sum: '$totalDebit' },
              totalCredit: { $sum: '$totalCredit' },
            },
          },
        ]).session(session)) as unknown as Array<{ totalDebit: number; totalCredit: number }>
        const totalDebit = totals.length ? round2(totals[0]!.totalDebit) : 0
        const totalCredit = totals.length ? round2(totals[0]!.totalCredit) : 0
        if (Math.abs(totalDebit - totalCredit) > EPSILON) {
          throw Object.assign(
            new Error(`Exercice déséquilibré : total débit ${totalDebit} ≠ total crédit ${totalCredit}`),
            { status: 400 },
          )
        }

        // 3. Exercice suivant : soit fourni soit calculé auto (année calendaire +1).
        const body = (req.body || {}) as CloseBody
        const provided = body.nextFiscalYear || null
        let nextStart: Date
        let nextEnd: Date
        let nextCode: string
        let nextLabel: string
        if (provided) {
          if (!provided.code || !provided.startDate || !provided.endDate) {
            throw Object.assign(new Error('nextFiscalYear nécessite code, startDate et endDate'), { status: 400 })
          }
          nextStart = new Date(provided.startDate)
          nextEnd = new Date(provided.endDate)
          nextCode = provided.code
          nextLabel = provided.label || provided.code
        } else {
          // Calcul auto : start = endDate du FY courant + 1 jour, end = +1 an.
          nextStart = new Date(fy.endDate)
          nextStart.setUTCDate(nextStart.getUTCDate() + 1)
          nextStart.setUTCHours(0, 0, 0, 0)
          nextEnd = new Date(nextStart)
          nextEnd.setUTCFullYear(nextEnd.getUTCFullYear() + 1)
          nextEnd.setUTCDate(nextEnd.getUTCDate() - 1)
          nextEnd.setUTCHours(23, 59, 59, 999)
          const year = nextStart.getUTCFullYear()
          nextCode = `FY-${year}`
          nextLabel = `Exercice ${year}`
        }

        // Si un FY existe déjà pour cette période, on le réutilise plutôt que d'en créer un.
        let nextFy = await FiscalYear.findOne({ code: nextCode }).session(session)
        if (!nextFy) {
          nextFy = new FiscalYear({
            code: nextCode,
            label: nextLabel,
            startDate: nextStart,
            endDate: nextEnd,
            status: 'OUVERT',
          })
          await nextFy.save({ session })
        } else if (nextFy.status === 'CLOTURE') {
          throw Object.assign(new Error(`L'exercice suivant ${nextFy.code} est clôturé — clôture impossible`), {
            status: 400,
          })
        }
        if (String(nextFy._id) === String(fy._id) || nextFy.startDate <= fy.endDate) {
          throw Object.assign(
            new Error(`L'exercice suivant ${nextFy.code} doit commencer après la fin de ${fy.code}`),
            {
              status: 400,
            },
          )
        }

        // 4. Soldes des comptes bilan (classes 1-5) sur l'exercice clôturé.
        const balanceRows = await computeAccountBalances(
          {
            fiscalYear: fy._id as Types.ObjectId,
            accountCodePrefixes: ['1', '2', '3', '4', '5'],
          },
          session,
        )

        // 5. Résultat = Σ produits (7x) - Σ charges (6x).
        const pnlRows = await computeAccountBalances(
          {
            fiscalYear: fy._id as Types.ObjectId,
            accountCodePrefixes: ['6', '7'],
          },
          session,
        )
        let totalProduits = 0
        let totalCharges = 0
        for (const r of pnlRows) {
          if (r.accountClass === 6) totalCharges += r.debit - r.credit
          if (r.accountClass === 7) totalProduits += r.credit - r.debit
        }
        const result = round2(totalProduits - totalCharges)

        // 6. Construction de l'écriture AN.
        const journal = await Journal.findOne({ code: 'AN' }).session(session)
        if (!journal) {
          const err = new Error("Journal 'AN' introuvable — initialisez le PCG/journaux") as Error & { status?: number }
          err.status = 400
          throw err
        }

        // Préchargement des comptes 120 / 129 pour gérer le cas où l'un est manquant.
        const beneficeAccount = await ChartOfAccount.findOne({ code: '120000' }).session(session)
        const perteAccount = await ChartOfAccount.findOne({ code: '129000' }).session(session)
        if (result > 0 && !beneficeAccount) {
          const err = new Error('Compte 120000 (bénéfice) absent du plan comptable') as Error & {
            status?: number
          }
          err.status = 400
          throw err
        }
        if (result < 0 && !perteAccount) {
          const err = new Error('Compte 129000 (perte) absent du plan comptable') as Error & {
            status?: number
          }
          err.status = 400
          throw err
        }

        const anLines: CreateEntryLineInput[] = []
        let sumDebit = 0
        let sumCredit = 0
        for (const row of balanceRows) {
          const bal = round2(row.balance)
          if (Math.abs(bal) < EPSILON) continue
          if (bal > 0) {
            anLines.push({
              account: row.accountCode,
              label: 'À nouveau',
              debit: bal,
              credit: 0,
              lettrage: 'AN',
            })
            sumDebit += bal
          } else {
            anLines.push({
              account: row.accountCode,
              label: 'À nouveau',
              debit: 0,
              credit: -bal,
              lettrage: 'AN',
            })
            sumCredit += -bal
          }
        }

        // Ligne de résultat (120 si bénéfice, 129 si perte ou nul). Pour résultat
        // nul on n'ajoute pas de ligne.
        if (result > 0) {
          anLines.push({
            account: '120000',
            label: 'Affectation du résultat (bénéfice)',
            debit: 0,
            credit: round2(result),
            lettrage: 'AN',
          })
          sumCredit += result
        } else if (result < 0) {
          anLines.push({
            account: '129000',
            label: 'Affectation du résultat (perte)',
            debit: round2(-result),
            credit: 0,
            lettrage: 'AN',
          })
          sumDebit += -result
        }

        if (anLines.length < 2) {
          const err = new Error('Aucun solde bilan à reporter — exercice vide ?') as Error & {
            status?: number
          }
          err.status = 400
          throw err
        }

        if (Math.abs(round2(sumDebit) - round2(sumCredit)) > EPSILON) {
          const err = new Error(
            `Écriture AN déséquilibrée : ${round2(sumDebit)} ≠ ${round2(sumCredit)} (erreur de calcul interne)`,
          ) as Error & { status?: number }
          err.status = 500
          throw err
        }

        // 7. Création de l'écriture AN dans le nouvel exercice.
        const { entry: openingEntry } = await createEntry({
          journal: journal._id as Types.ObjectId,
          date: nextFy.startDate,
          label: `Report à nouveau ${fy.code} → ${nextFy.code}`,
          lines: anLines,
          source: 'AN',
          status: 'VALIDATED',
          createdBy: req.user!.id,
          idempotencyKey: `AN:${String(fy._id)}:${String(nextFy._id)}`,
          session,
        })

        // 8. Verrouillage des écritures de l'exercice clos.
        const now = new Date()
        await AccountingEntry.updateMany(
          { fiscalYear: fy._id, status: 'VALIDATED' },
          { $set: { status: 'LOCKED', lockedAt: now } },
          { session },
        )

        // 9. Mise à jour du FY clos.
        fy.status = 'CLOTURE'
        fy.closedAt = now
        fy.closedBy = req.user!.id as unknown as typeof fy.closedBy
        if (String(openingEntry.fiscalYear) !== String(nextFy._id)) {
          throw Object.assign(new Error(`L'écriture d'à-nouveaux ne tombe pas dans ${nextFy.code}`), { status: 400 })
        }
        fy.openingEntryId = openingEntry._id as typeof fy.openingEntryId
        await fy.save({ session })

        const balanceTransferred = {
          accountsCount: anLines.length - (result !== 0 ? 1 : 0),
          totalDebit: round2(sumDebit),
          totalCredit: round2(sumCredit),
          result,
        }

        return {
          closedFiscalYear: fy,
          nextFiscalYear: nextFy,
          openingEntry,
          balanceTransferred,
        }
      })
      res.json(result)
    } catch (err) {
      const status = (err as { status?: number } | null | undefined)?.status
      if (status) {
        const draftEntries = (err as { draftEntries?: unknown[] }).draftEntries
        res.status(status).json({ error: (err as Error).message, ...(draftEntries ? { draftEntries } : {}) })
        return
      }
      next(err)
    }
  },
)

export default router
