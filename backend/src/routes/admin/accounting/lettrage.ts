import express, { type Request, type Response, type NextFunction } from 'express'
import type { Types } from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import AccountingLine from '../../../models/AccountingLine.js'
import AccountingEntry from '../../../models/AccountingEntry.js'
import ChartOfAccount from '../../../models/ChartOfAccount.js'
import { letterLines, unletterCode } from '../../../lib/accounting/lettrage.js'
import type { AccountingEntryStatus } from '../../../types/enums.js'
import type { IChartOfAccount } from '../../../types/models/index.js'

const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const VALID_STATUSES: AccountingEntryStatus[] = ['VALIDATED', 'LOCKED']

function round2(n: number | null | undefined): number {
  return Math.round(Number(n || 0) * 100) / 100
}

function handleBusinessError(res: Response, next: NextFunction, err: unknown): void {
  const status = (err as { status?: number } | null | undefined)?.status
  if (status) {
    res.status(status).json({ error: (err as Error).message })
    return
  }
  next(err)
}

/**
 * Charge un compte et 404 si introuvable.
 */
async function loadAccount(code: string): Promise<IChartOfAccount | null> {
  return ChartOfAccount.findOne({ code })
}

// Forme lean d'une ligne comptable (uniquement les champs lus ici).
interface LeanAccountingLine {
  _id: Types.ObjectId
  entry: Types.ObjectId
  journalCode: string
  date: Date
  accountCode: string
  label: string
  debit: number
  credit: number
  lettrage: string
  lettrageDate: Date | null
}

// Ligne enrichie remontée par fetchAccountLines : forme lean + les deux
// champs ajoutés depuis l'écriture parente.
interface EnrichedLine extends LeanAccountingLine {
  entryNumber: string
  pieceRef: string
}

interface FetchAccountLinesParams {
  accountCode: string
  lettered?: boolean
}

/**
 * Récupère les lignes d'un compte filtrées par état de lettrage.
 * Toujours filtrées sur entries VALIDATED/LOCKED. Enrichit chaque ligne avec
 * entryNumber et pieceRef remontés depuis l'écriture parente.
 */
async function fetchAccountLines(params: FetchAccountLinesParams): Promise<EnrichedLine[]> {
  const { accountCode, lettered } = params
  // Filtre principal sur les lignes.
  const lineFilter: Record<string, unknown> = { accountCode }
  if (lettered === true) {
    lineFilter.lettrage = { $ne: '' }
  } else if (lettered === false) {
    lineFilter.lettrage = ''
  }

  const lines = (await AccountingLine.find(lineFilter)
    .sort({ date: 1, _id: 1 })
    .lean()) as unknown as LeanAccountingLine[]
  if (lines.length === 0) return []

  // Récupération des écritures parentes pour filtre statut + enrichissement.
  const entryIds = Array.from(new Set(lines.map((l) => String(l.entry))))
  const entries = await AccountingEntry.find(
    { _id: { $in: entryIds }, status: { $in: VALID_STATUSES } },
    { _id: 1, entryNumber: 1, pieceRef: 1, status: 1 }
  ).lean()
  const entryById = new Map<string, { entryNumber: string; pieceRef: string }>(
    entries.map((e) => [String(e._id), { entryNumber: e.entryNumber, pieceRef: e.pieceRef || '' }])
  )

  return lines
    .filter((l) => entryById.has(String(l.entry)))
    .map((l) => {
      const meta = entryById.get(String(l.entry))!
      return { ...l, entryNumber: meta.entryNumber, pieceRef: meta.pieceRef }
    })
}

// ----------------------------------------------------------------------------
// GET /account/:accountCode/unlettered
// Lignes non lettrées d'un compte (VALIDATED/LOCKED uniquement).
// ----------------------------------------------------------------------------
router.get(
  '/account/:accountCode/unlettered',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountCode = String(req.params.accountCode || '')
      const account = await loadAccount(accountCode)
      if (!account) {
        res.status(404).json({ error: 'Compte introuvable' })
        return
      }
      const lines = await fetchAccountLines({ accountCode, lettered: false })
      res.json({
        account: {
          code: account.code,
          label: account.label,
          accountClass: account.accountClass,
          type: account.type,
          isLettrable: account.isLettrable,
        },
        lines: lines.map((l) => ({
          _id: l._id,
          date: l.date,
          journalCode: l.journalCode,
          entryNumber: l.entryNumber,
          pieceRef: l.pieceRef,
          label: l.label,
          debit: round2(l.debit),
          credit: round2(l.credit),
          lettrage: l.lettrage,
          entry: l.entry,
        })),
      })
    } catch (err) {
      next(err)
    }
  }
)

// ----------------------------------------------------------------------------
// GET /account/:accountCode/lettered
// Lignes lettrées d'un compte, groupées par code de lettrage.
// ----------------------------------------------------------------------------
interface LettrageGroup {
  code: string
  lineCount: number
  totalDebit: number
  totalCredit: number
  lettrageDate: Date | null
  lines: Array<{
    _id: unknown
    date: Date
    journalCode: string
    entryNumber: string
    pieceRef: string
    label: string
    debit: number
    credit: number
    lettrageDate: Date | null
    entry: unknown
  }>
}

router.get(
  '/account/:accountCode/lettered',
  requirePermission(PERMISSIONS.VIEW_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountCode = String(req.params.accountCode || '')
      const account = await loadAccount(accountCode)
      if (!account) {
        res.status(404).json({ error: 'Compte introuvable' })
        return
      }
      const lines = await fetchAccountLines({ accountCode, lettered: true })

      // Regroupement par code, ordonné par date de lettrage desc.
      const groupsMap = new Map<string, LettrageGroup>()
      for (const line of lines) {
        const code = line.lettrage
        if (!groupsMap.has(code)) {
          groupsMap.set(code, {
            code,
            lineCount: 0,
            totalDebit: 0,
            totalCredit: 0,
            lettrageDate: line.lettrageDate || null,
            lines: [],
          })
        }
        const grp = groupsMap.get(code)!
        grp.lineCount += 1
        grp.totalDebit += line.debit || 0
        grp.totalCredit += line.credit || 0
        if (
          line.lettrageDate &&
          (!grp.lettrageDate || line.lettrageDate > grp.lettrageDate)
        ) {
          grp.lettrageDate = line.lettrageDate
        }
        grp.lines.push({
          _id: line._id,
          date: line.date,
          journalCode: line.journalCode,
          entryNumber: line.entryNumber,
          pieceRef: line.pieceRef,
          label: line.label,
          debit: round2(line.debit),
          credit: round2(line.credit),
          lettrageDate: line.lettrageDate,
          entry: line.entry,
        })
      }

      const groups = Array.from(groupsMap.values())
        .map((g) => ({
          ...g,
          totalDebit: round2(g.totalDebit),
          totalCredit: round2(g.totalCredit),
        }))
        .sort((a, b) => {
          const da = a.lettrageDate ? new Date(a.lettrageDate).getTime() : 0
          const db = b.lettrageDate ? new Date(b.lettrageDate).getTime() : 0
          return db - da
        })

      res.json({
        account: {
          code: account.code,
          label: account.label,
          accountClass: account.accountClass,
          type: account.type,
          isLettrable: account.isLettrable,
        },
        groups,
      })
    } catch (err) {
      next(err)
    }
  }
)

// ----------------------------------------------------------------------------
// POST /
// body { lineIds: [...], code?, override? }
// ----------------------------------------------------------------------------
interface LetterLinesBody {
  lineIds?: string[]
  code?: string
  override?: boolean
}

router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { lineIds, code, override } = (req.body || {}) as LetterLinesBody
      const result = await letterLines({
        lineIds: lineIds || [],
        code,
        override: Boolean(override),
      })
      res.status(201).json(result)
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  }
)

// ----------------------------------------------------------------------------
// DELETE /account/:accountCode/:code
// ----------------------------------------------------------------------------
router.delete(
  '/account/:accountCode/:code',
  requirePermission(PERMISSIONS.MANAGE_ACCOUNTING),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const accountCode = String(req.params.accountCode || '')
      const code = String(req.params.code || '')
      const result = await unletterCode(accountCode, code)
      res.json(result)
    } catch (err) {
      handleBusinessError(res, next, err)
    }
  }
)

export default router
