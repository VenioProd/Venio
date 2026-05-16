import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import FiscalYear from '../../../models/FiscalYear.js'
import AccountingEntry from '../../../models/AccountingEntry.js'
import AccountingLine from '../../../models/AccountingLine.js'
import Journal from '../../../models/Journal.js'
import ChartOfAccount from '../../../models/ChartOfAccount.js'
import AuditLog from '../../../models/AuditLog.js'
import { createEntry } from '../../../lib/accounting/doubleEntry.js'
import { computeAccountBalances } from '../../../lib/accounting/reports/balanceCompute.js'
import { buildActorFromReq } from '../../../lib/audit/auditMiddleware.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const EPSILON = 0.01

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

router.get('/', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (_req, res, next) => {
  try {
    const years = await FiscalYear.find().sort({ startDate: -1 }).lean()
    res.json({ fiscalYears: years })
  } catch (err) {
    next(err)
  }
})

router.post('/', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const { code, label, startDate, endDate } = req.body || {}
    if (!code || !startDate || !endDate) {
      return res.status(400).json({ error: 'code, startDate, endDate requis' })
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
})

router.patch('/:id', requirePermission(PERMISSIONS.MANAGE_ACCOUNTING), async (req, res, next) => {
  try {
    const fy = await FiscalYear.findById(req.params.id)
    if (!fy) return res.status(404).json({ error: 'Exercice introuvable' })
    if (fy.status === 'CLOTURE') {
      return res.status(423).json({ error: 'Exercice clôturé, modification impossible' })
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
})

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
// Le tout sous try/catch : si une étape échoue après création du nouvel
// exercice, on tente de rollback en supprimant le FY créé.
// ----------------------------------------------------------------------------
router.post('/:id/close', requirePermission(PERMISSIONS.LOCK_ACCOUNTING), async (req, res, next) => {
  let createdNextFy = null
  try {
    const fy = await FiscalYear.findById(req.params.id)
    if (!fy) return res.status(404).json({ error: 'Exercice introuvable' })
    if (fy.status === 'CLOTURE') {
      return res.status(400).json({ error: 'Exercice déjà clôturé' })
    }

    // 1. Aucun draft autorisé sur l'exercice.
    const drafts = await AccountingEntry.find(
      { fiscalYear: fy._id, status: 'DRAFT' },
      { entryNumber: 1, date: 1, journalCode: 1 }
    )
      .sort({ date: 1 })
      .lean()
    if (drafts.length > 0) {
      return res.status(400).json({
        error: 'Des écritures DRAFT subsistent — validez-les ou supprimez-les avant la clôture',
        draftEntries: drafts.map((d) => ({
          entryNumber: d.entryNumber,
          date: d.date,
          journalCode: d.journalCode,
        })),
      })
    }

    // 2. Équilibre global de l'exercice (sur entries VALIDATED).
    const totals = await AccountingEntry.aggregate([
      { $match: { fiscalYear: fy._id, status: { $in: ['VALIDATED', 'LOCKED'] } } },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: '$totalDebit' },
          totalCredit: { $sum: '$totalCredit' },
        },
      },
    ])
    const totalDebit = totals.length ? round2(totals[0].totalDebit) : 0
    const totalCredit = totals.length ? round2(totals[0].totalCredit) : 0
    if (Math.abs(totalDebit - totalCredit) > EPSILON) {
      return res.status(400).json({
        error: `Exercice déséquilibré : total débit ${totalDebit} ≠ total crédit ${totalCredit}`,
      })
    }

    // 3. Exercice suivant : soit fourni soit calculé auto (année calendaire +1).
    const provided = (req.body && req.body.nextFiscalYear) || null
    let nextStart
    let nextEnd
    let nextCode
    let nextLabel
    if (provided) {
      if (!provided.code || !provided.startDate || !provided.endDate) {
        return res.status(400).json({
          error: 'nextFiscalYear nécessite code, startDate et endDate',
        })
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
      nextEnd.setUTCHours(23, 59, 59, 0)
      const year = nextStart.getUTCFullYear()
      nextCode = `FY-${year}`
      nextLabel = `Exercice ${year}`
    }

    // Si un FY existe déjà pour cette période, on le réutilise plutôt que d'en créer un.
    let nextFy = await FiscalYear.findOne({ code: nextCode })
    if (!nextFy) {
      nextFy = await FiscalYear.create({
        code: nextCode,
        label: nextLabel,
        startDate: nextStart,
        endDate: nextEnd,
        status: 'OUVERT',
      })
      createdNextFy = nextFy
    } else if (nextFy.status === 'CLOTURE') {
      return res.status(400).json({
        error: `L'exercice suivant ${nextFy.code} est clôturé — clôture impossible`,
      })
    }

    // 4. Soldes des comptes bilan (classes 1-5) sur l'exercice clôturé.
    const balanceRows = await computeAccountBalances({
      fiscalYear: fy._id,
      accountCodePrefixes: ['1', '2', '3', '4', '5'],
    })

    // 5. Résultat = Σ produits (7x) - Σ charges (6x).
    const pnlRows = await computeAccountBalances({
      fiscalYear: fy._id,
      accountCodePrefixes: ['6', '7'],
    })
    let totalProduits = 0
    let totalCharges = 0
    for (const r of pnlRows) {
      if (r.accountClass === 6) totalCharges += r.debit - r.credit
      if (r.accountClass === 7) totalProduits += r.credit - r.debit
    }
    const result = round2(totalProduits - totalCharges)

    // 6. Construction de l'écriture AN.
    const journal = await Journal.findByCode('AN')
    if (!journal) {
      throw Object.assign(new Error("Journal 'AN' introuvable — initialisez le PCG/journaux"), {
        status: 400,
      })
    }

    // Préchargement des comptes 120 / 129 pour gérer le cas où l'un est manquant.
    const beneficeAccount = await ChartOfAccount.findOne({ code: '120000' })
    const perteAccount = await ChartOfAccount.findOne({ code: '129000' })
    if (result > 0 && !beneficeAccount) {
      throw Object.assign(new Error("Compte 120000 (bénéfice) absent du plan comptable"), {
        status: 400,
      })
    }
    if (result < 0 && !perteAccount) {
      throw Object.assign(new Error("Compte 129000 (perte) absent du plan comptable"), {
        status: 400,
      })
    }

    const anLines = []
    let sumDebit = 0
    let sumCredit = 0
    for (const row of balanceRows) {
      const bal = round2(row.balance)
      if (Math.abs(bal) < EPSILON) continue
      if (bal > 0) {
        anLines.push({ account: row.accountCode, label: 'À nouveau', debit: bal, credit: 0, lettrage: 'AN' })
        sumDebit += bal
      } else {
        anLines.push({ account: row.accountCode, label: 'À nouveau', debit: 0, credit: -bal, lettrage: 'AN' })
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
      throw Object.assign(new Error("Aucun solde bilan à reporter — exercice vide ?"), {
        status: 400,
      })
    }

    if (Math.abs(round2(sumDebit) - round2(sumCredit)) > EPSILON) {
      throw Object.assign(
        new Error(
          `Écriture AN déséquilibrée : ${round2(sumDebit)} ≠ ${round2(sumCredit)} (erreur de calcul interne)`
        ),
        { status: 500 }
      )
    }

    // 7. Création de l'écriture AN dans le nouvel exercice.
    const { entry: openingEntry } = await createEntry({
      journal: journal._id,
      date: nextFy.startDate,
      label: `Report à nouveau ${fy.code} → ${nextFy.code}`,
      lines: anLines,
      source: 'AN',
      status: 'VALIDATED',
      createdBy: req.user.id,
      idempotencyKey: `AN:${fy._id}:${nextFy._id}`,
    })

    // 8. Verrouillage des écritures de l'exercice clos.
    const now = new Date()
    await AccountingEntry.updateMany(
      { fiscalYear: fy._id, status: 'VALIDATED' },
      { $set: { status: 'LOCKED', lockedAt: now } }
    )

    // 9. Mise à jour du FY clos.
    fy.status = 'CLOTURE'
    fy.closedAt = now
    fy.closedBy = req.user.id
    fy.openingEntryId = openingEntry._id
    await fy.save()

    // 10. Audit de la clôture (best effort).
    const balanceTransferred = {
      accountsCount: anLines.length - (result !== 0 ? 1 : 0),
      totalDebit: round2(sumDebit),
      totalCredit: round2(sumCredit),
      result,
    }
    AuditLog.record({
      action: 'FISCAL_YEAR_CLOSE',
      entityType: 'FiscalYear',
      entityId: fy._id,
      entityRef: fy.code,
      actor: buildActorFromReq(req),
      summary: `Clôture ${fy.code} → ${nextFy.code} (résultat ${result})`,
      after: {
        status: fy.status,
        closedAt: fy.closedAt,
        openingEntryId: fy.openingEntryId,
      },
      metadata: {
        balanceTransferred,
        nextFiscalYearCode: nextFy.code,
        openingEntryNumber: openingEntry.entryNumber,
      },
    })

    res.json({
      closedFiscalYear: fy,
      nextFiscalYear: nextFy,
      openingEntry,
      balanceTransferred,
    })
  } catch (err) {
    // Rollback : si on avait créé un nouveau FY pendant cet appel, on le supprime.
    if (createdNextFy && createdNextFy._id) {
      try {
        // Vérifier qu'aucune écriture n'y a été créée entre-temps (sauf l'AN
        // qui a pu être créée puis échouer en aval).
        const hasEntries = await AccountingEntry.exists({ fiscalYear: createdNextFy._id })
        if (hasEntries) {
          // Si l'AN a été créée, on doit aussi la nettoyer pour annuler proprement.
          await AccountingLine.deleteMany({ fiscalYear: createdNextFy._id })
          await AccountingEntry.deleteMany({ fiscalYear: createdNextFy._id })
        }
        await FiscalYear.deleteOne({ _id: createdNextFy._id })
      } catch {
        // Rollback best-effort : on remonte l'erreur d'origine quoi qu'il arrive.
      }
    }
    if (err && err.status) {
      return res.status(err.status).json({ error: err.message })
    }
    next(err)
  }
})

export default router
