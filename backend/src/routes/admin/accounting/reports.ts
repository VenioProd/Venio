import express, { type Request, type Response, type NextFunction } from 'express'
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
import { buildCsv, type CsvCell } from '../../../lib/accounting/csvExport.js'
import { sensitiveActionWhen } from '../../../lib/security/sensitiveActions.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const protectCsvExport = sensitiveActionWhen('ACCOUNTING_REPORT_EXPORT', (req) => req.query.format === 'csv')

// Helpers locaux ----------------------------------------------------------

function parseDateParam(value: unknown): Date | null {
  if (!value) return null
  const d = new Date(value as string)
  if (Number.isNaN(d.getTime())) return null
  return d
}

function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(csv)
}

function formatDateISO(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

// Helper d'erreur métier (status-typed)
function handleBusinessError(res: Response, next: NextFunction, err: unknown): void {
  const status = (err as { status?: number } | null | undefined)?.status
  if (status) {
    res.status(status).json({ error: (err as Error).message })
    return
  }
  next(err)
}

// -------------------------------------------------------------------------
// GET /general-ledger?accountCode=...&from=...&to=...&fiscalYear=...&format=csv
// -------------------------------------------------------------------------
router.get(
  '/general-ledger',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  protectCsvExport,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { accountCode, fiscalYear, format } = req.query as Record<string, string | undefined>
      if (!accountCode) {
        res.status(400).json({ error: 'accountCode requis' })
        return
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
        const rows: CsvCell[][] = [
          ['', '', '', '', 'Solde d’ouverture', '', '', ledger.openingBalance, '', ''],
          ...ledger.movements.map((m): CsvCell[] => [
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
        sendCsv(res, `grand-livre-${ledger.account.code}.csv`, csv)
        return
      }
      res.json(ledger)
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  },
)

// -------------------------------------------------------------------------
// GET /balance?from=...&to=...&fiscalYear=...&accountClass=...&includeZero=...&format=csv
// -------------------------------------------------------------------------
router.get(
  '/balance',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  protectCsvExport,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fiscalYear, accountClass, includeZero, format } = req.query as Record<string, string | undefined>
      const from = parseDateParam(req.query.from)
      const to = parseDateParam(req.query.to)

      const balance = await getTrialBalance({
        from,
        to,
        fiscalYear: fiscalYear || null,
        accountClass: accountClass ? Number(accountClass) : null,
        includeZero: includeZero === 'true',
      })

      if (format === 'csv') {
        const headers = ['Code', 'Libellé', 'Classe', 'Type', 'Débit', 'Crédit', 'Solde']
        const rows: CsvCell[][] = [
          ...balance.rows.map((r): CsvCell[] => [
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
        sendCsv(res, 'balance.csv', csv)
        return
      }
      res.json(balance)
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  },
)

// -------------------------------------------------------------------------
// GET /balance-sheet?fiscalYear=...&asOf=...&format=csv
// -------------------------------------------------------------------------
router.get(
  '/balance-sheet',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  protectCsvExport,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fiscalYear, format } = req.query as Record<string, string | undefined>
      const asOf = parseDateParam(req.query.asOf)

      const bs = await getBalanceSheet({ fiscalYear: fiscalYear || null, asOf })

      if (format === 'csv') {
        const headers = ['Section', 'Code', 'Libellé', 'Classe', 'Montant']
        const rows: CsvCell[][] = []
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
        sendCsv(res, `bilan-${formatDateISO(bs.asOf)}.csv`, csv)
        return
      }
      res.json(bs)
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  },
)

// -------------------------------------------------------------------------
// GET /income-statement?fiscalYear=...&from=...&to=...&format=csv
// -------------------------------------------------------------------------
router.get(
  '/income-statement',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  protectCsvExport,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fiscalYear, format } = req.query as Record<string, string | undefined>
      const from = parseDateParam(req.query.from)
      const to = parseDateParam(req.query.to)

      const is = await getIncomeStatement({ fiscalYear: fiscalYear || null, from, to })

      if (format === 'csv') {
        const headers = ['Section', 'Code', 'Libellé', 'Classe', 'Montant']
        const rows: CsvCell[][] = []
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
        sendCsv(res, 'compte-de-resultat.csv', csv)
        return
      }
      res.json(is)
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  },
)

// -------------------------------------------------------------------------
// GET /dashboard (JSON uniquement)
// -------------------------------------------------------------------------
router.get(
  '/dashboard',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dashboard = await getAccountingDashboard({ now: new Date() })
      res.json(dashboard)
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  },
)

// -------------------------------------------------------------------------
// GET /journal?journal=VE&from=...&to=...&fiscalYear=...
// -------------------------------------------------------------------------
router.get(
  '/journal',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { journal: journalCode, fiscalYear } = req.query as Record<string, string | undefined>
      if (!journalCode) {
        res.status(400).json({ error: 'journal requis (code journal)' })
        return
      }
      const from = parseDateParam(req.query.from)
      const to = parseDateParam(req.query.to)

      const journalDoc = await Journal.findByCode(journalCode)
      if (!journalDoc) {
        res.status(404).json({ error: `Journal introuvable : ${journalCode}` })
        return
      }

      // Construction du filtre sur les entries — on n'inclut JAMAIS les DRAFT.
      const entryFilter: Record<string, unknown> = {
        journalCode: journalDoc.code,
        status: { $in: ['VALIDATED', 'LOCKED'] },
        archivedAt: null,
      }
      if (from || to) {
        const dateFilter: Record<string, Date> = {}
        if (from) dateFilter.$gte = from
        if (to) dateFilter.$lte = to
        entryFilter.date = dateFilter
      }
      if (fiscalYear) entryFilter.fiscalYear = fiscalYear

      const entries = await AccountingEntry.find(entryFilter).sort({ date: 1, entryNumber: 1 }).lean()

      const entryIds = entries.map((e) => e._id)
      const lines = await AccountingLine.find({ entry: { $in: entryIds } })
        .sort({ sortIndex: 1 })
        .lean()

      const linesByEntry = new Map<string, typeof lines>()
      for (const line of lines) {
        const key = String(line.entry)
        if (!linesByEntry.has(key)) linesByEntry.set(key, [])
        linesByEntry.get(key)!.push(line)
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

      res.json({
        journal: { code: journalDoc.code, label: journalDoc.label, type: journalDoc.type },
        entries: enrichedEntries,
      })
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  },
)

export default router
