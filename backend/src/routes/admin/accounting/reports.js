import express from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import AccountingEntry from '../../../models/AccountingEntry.js'
import AccountingLine from '../../../models/AccountingLine.js'
import Journal from '../../../models/Journal.js'
import { getGeneralLedger } from '../../../lib/accounting/reports/generalLedger.js'
import { getTrialBalance } from '../../../lib/accounting/reports/balance.js'
import { getBalanceSheet } from '../../../lib/accounting/reports/balanceSheet.js'
import { getIncomeStatement } from '../../../lib/accounting/reports/incomeStatement.js'
import { getAccountingDashboard } from '../../../lib/accounting/reports/dashboard.js'
import { buildCsv } from '../../../lib/accounting/csvExport.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

// Helpers locaux ----------------------------------------------------------

function parseDateParam(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
}

function formatDateISO(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

// -------------------------------------------------------------------------
// GET /general-ledger?accountCode=...&from=...&to=...&fiscalYear=...&format=csv
// -------------------------------------------------------------------------
router.get('/general-ledger', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const { accountCode, fiscalYear, format } = req.query
    if (!accountCode) {
      return res.status(400).json({ error: 'accountCode requis' })
    }
    const from = parseDateParam(req.query.from)
    const to = parseDateParam(req.query.to)

    const ledger = await getGeneralLedger({
      accountCode: String(accountCode),
      from,
      to,
      fiscalYear: fiscalYear || null,
      includeOpening: true,
    })

    if (format === 'csv') {
      const headers = [
        'Date',
        'Journal',
        'N° écriture',
        'Pièce',
        'Libellé',
        'Débit',
        'Crédit',
        'Solde cumulé',
        'Lettrage',
        'Statut',
      ]
      const rows = [
        ['', '', '', '', 'Solde d’ouverture', '', '', ledger.openingBalance, '', ''],
        ...ledger.movements.map((m) => [
          formatDateISO(m.date),
          m.journalCode,
          m.entryNumber,
          m.pieceRef,
          m.label,
          m.debit,
          m.credit,
          m.runningBalance,
          m.lettrage,
          m.entryStatus,
        ]),
        ['', '', '', '', 'TOTAUX', ledger.totals.debit, ledger.totals.credit, ledger.totals.closingBalance, '', ''],
      ]
      const csv = buildCsv(headers, rows)
      return sendCsv(res, `grand-livre-${ledger.account.code}.csv`, csv)
    }
    return res.json(ledger)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    return next(err)
  }
})

// -------------------------------------------------------------------------
// GET /balance?from=...&to=...&fiscalYear=...&accountClass=...&includeZero=...&format=csv
// -------------------------------------------------------------------------
router.get('/balance', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const { fiscalYear, accountClass, includeZero, format } = req.query
    const from = parseDateParam(req.query.from)
    const to = parseDateParam(req.query.to)

    const balance = await getTrialBalance({
      from,
      to,
      fiscalYear: fiscalYear || null,
      accountClass: accountClass ? Number(accountClass) : undefined,
      includeZero: includeZero === 'true',
    })

    if (format === 'csv') {
      const headers = ['Code', 'Libellé', 'Classe', 'Type', 'Débit', 'Crédit', 'Solde']
      const rows = [
        ...balance.rows.map((r) => [
          r.accountCode,
          r.accountLabel,
          r.accountClass,
          r.type,
          r.debit,
          r.credit,
          r.balance,
        ]),
        ['', 'TOTAUX', '', '', balance.totals.debit, balance.totals.credit, ''],
      ]
      const csv = buildCsv(headers, rows)
      return sendCsv(res, 'balance.csv', csv)
    }
    return res.json(balance)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    return next(err)
  }
})

// -------------------------------------------------------------------------
// GET /balance-sheet?fiscalYear=...&asOf=...&format=csv
// -------------------------------------------------------------------------
router.get('/balance-sheet', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const { fiscalYear, format } = req.query
    const asOf = parseDateParam(req.query.asOf)

    const bs = await getBalanceSheet({ fiscalYear: fiscalYear || null, asOf })

    if (format === 'csv') {
      const headers = ['Section', 'Code', 'Libellé', 'Classe', 'Montant']
      const rows = []
      for (const r of bs.actif) {
        rows.push(['ACTIF', r.code, r.label, r.accountClass, r.amount])
      }
      rows.push(['ACTIF', '', 'TOTAL ACTIF', '', bs.totalActif])
      for (const r of bs.passif) {
        rows.push(['PASSIF', r.code, r.label, r.accountClass, r.amount])
      }
      rows.push(['PASSIF', '', 'TOTAL PASSIF', '', bs.totalPassif])
      rows.push(['', '', 'Résultat de l’exercice', '', bs.resultExercise])
      rows.push(['', '', 'Écart actif - passif', '', bs.imbalance])
      const csv = buildCsv(headers, rows)
      return sendCsv(res, `bilan-${formatDateISO(bs.asOf)}.csv`, csv)
    }
    return res.json(bs)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    return next(err)
  }
})

// -------------------------------------------------------------------------
// GET /income-statement?fiscalYear=...&from=...&to=...&format=csv
// -------------------------------------------------------------------------
router.get('/income-statement', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const { fiscalYear, format } = req.query
    const from = parseDateParam(req.query.from)
    const to = parseDateParam(req.query.to)

    const is = await getIncomeStatement({ fiscalYear: fiscalYear || null, from, to })

    if (format === 'csv') {
      const headers = ['Section', 'Code', 'Libellé', 'Classe', 'Montant']
      const rows = []
      for (const r of is.charges) {
        rows.push(['CHARGES', r.code, r.label, r.accountClass, r.amount])
      }
      rows.push(['CHARGES', '', 'TOTAL CHARGES', '', is.totalCharges])
      for (const r of is.produits) {
        rows.push(['PRODUITS', r.code, r.label, r.accountClass, r.amount])
      }
      rows.push(['PRODUITS', '', 'TOTAL PRODUITS', '', is.totalProduits])
      rows.push(['', '', 'RÉSULTAT', '', is.result])
      const csv = buildCsv(headers, rows)
      return sendCsv(res, 'compte-de-resultat.csv', csv)
    }
    return res.json(is)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    return next(err)
  }
})

// -------------------------------------------------------------------------
// GET /dashboard (JSON uniquement)
// -------------------------------------------------------------------------
router.get('/dashboard', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (_req, res, next) => {
  try {
    const dashboard = await getAccountingDashboard({ now: new Date() })
    return res.json(dashboard)
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    return next(err)
  }
})

// -------------------------------------------------------------------------
// GET /journal?journal=VE&from=...&to=...&fiscalYear=...
// -------------------------------------------------------------------------
router.get('/journal', requirePermission(PERMISSIONS.VIEW_ACCOUNTING), async (req, res, next) => {
  try {
    const { journal: journalCode, fiscalYear } = req.query
    if (!journalCode) {
      return res.status(400).json({ error: 'journal requis (code journal)' })
    }
    const from = parseDateParam(req.query.from)
    const to = parseDateParam(req.query.to)

    const journalDoc = await Journal.findByCode(journalCode)
    if (!journalDoc) {
      return res.status(404).json({ error: `Journal introuvable : ${journalCode}` })
    }

    // Construction du filtre sur les entries — on n'inclut JAMAIS les DRAFT.
    const entryFilter = {
      journalCode: journalDoc.code,
      status: { $in: ['VALIDATED', 'LOCKED'] },
      archivedAt: null,
    }
    if (from || to) {
      entryFilter.date = {}
      if (from) entryFilter.date.$gte = from
      if (to) entryFilter.date.$lte = to
    }
    if (fiscalYear) entryFilter.fiscalYear = fiscalYear

    const entries = await AccountingEntry.find(entryFilter)
      .sort({ date: 1, entryNumber: 1 })
      .lean()

    const entryIds = entries.map((e) => e._id)
    const lines = await AccountingLine.find({ entry: { $in: entryIds } })
      .sort({ sortIndex: 1 })
      .lean()

    const linesByEntry = new Map()
    for (const line of lines) {
      const key = String(line.entry)
      if (!linesByEntry.has(key)) linesByEntry.set(key, [])
      linesByEntry.get(key).push(line)
    }

    const enrichedEntries = entries.map((e) => ({
      _id: e._id,
      entryNumber: e.entryNumber,
      date: e.date,
      label: e.label || '',
      pieceRef: e.pieceRef || '',
      status: e.status,
      source: e.source,
      totalDebit: e.totalDebit,
      totalCredit: e.totalCredit,
      lines: linesByEntry.get(String(e._id)) || [],
    }))

    return res.json({
      journal: { code: journalDoc.code, label: journalDoc.label, type: journalDoc.type },
      entries: enrichedEntries,
    })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    return next(err)
  }
})

export default router
