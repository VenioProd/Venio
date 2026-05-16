import mongoose, { type Types, type PipelineStage } from 'mongoose'
import AccountingLine from '../../../models/AccountingLine.js'
import ChartOfAccount from '../../../models/ChartOfAccount.js'
import { computeOpeningBalance, VALID_STATUSES, round2 } from './balanceCompute.js'
import type { AccountType, AccountingEntryStatus } from '../../../types/enums.js'

type ObjectIdInput = string | Types.ObjectId | { _id: Types.ObjectId | string } | null | undefined

function toObjectId(value: ObjectIdInput): Types.ObjectId | null {
  if (!value) return null
  if (value instanceof mongoose.Types.ObjectId) return value
  if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value)
  }
  if (typeof value === 'object' && '_id' in value && value._id) {
    return toObjectId(value._id as ObjectIdInput)
  }
  return null
}

export interface GeneralLedgerParams {
  accountCode: string
  from?: Date | string | null
  to?: Date | string | null
  fiscalYear?: ObjectIdInput
  includeOpening?: boolean
}

export interface LedgerMovement {
  _id: Types.ObjectId
  date: Date
  journalCode: string
  entryNumber: string
  pieceRef: string
  label: string
  debit: number
  credit: number
  runningBalance: number
  lettrage: string
  entryStatus: AccountingEntryStatus
}

export interface GeneralLedgerResult {
  account: {
    code: string
    label: string
    class: number
    type: AccountType
    isLettrable: boolean
  }
  openingBalance: number
  movements: LedgerMovement[]
  totals: {
    debit: number
    credit: number
    balance: number
    closingBalance: number
  }
}

// Forme brute des lignes remontées par l'agrégation.
interface RawMovement {
  _id: Types.ObjectId
  date: Date
  journalCode: string
  label: string
  debit: number
  credit: number
  lettrage: string
  sortIndex: number
  entryNumber: string
  pieceRef: string
  entryStatus: AccountingEntryStatus
}

/**
 * Renvoie le grand livre d'un compte : entête compte, solde d'ouverture,
 * mouvements détaillés avec solde courant cumulé, et totaux.
 *
 * Inclut uniquement les écritures VALIDATED et LOCKED (jamais DRAFT).
 */
export async function getGeneralLedger(params: GeneralLedgerParams): Promise<GeneralLedgerResult> {
  const { accountCode, from, to, fiscalYear, includeOpening = true } = params || ({} as GeneralLedgerParams)
  if (!accountCode) {
    const err = new Error('accountCode requis') as Error & { status?: number }
    err.status = 400
    throw err
  }

  const account = await ChartOfAccount.findOne({ code: String(accountCode) }).lean()
  if (!account) {
    const err = new Error(`Compte introuvable : ${accountCode}`) as Error & { status?: number }
    err.status = 404
    throw err
  }

  const fromDate = from ? (from instanceof Date ? from : new Date(from)) : null
  const toDate = to ? (to instanceof Date ? to : new Date(to)) : null

  // Solde d'ouverture : tout ce qui précède `from`.
  const openingBalance =
    includeOpening && fromDate
      ? await computeOpeningBalance({ accountCode, fiscalYear, before: fromDate })
      : 0

  // Mouvements sur la période demandée.
  const match: Record<string, unknown> = { accountCode: String(accountCode) }
  if (fromDate || toDate) {
    const dateFilter: Record<string, Date> = {}
    if (fromDate) dateFilter.$gte = fromDate
    if (toDate) dateFilter.$lte = toDate
    match.date = dateFilter
  }
  const fyId = toObjectId(fiscalYear)
  if (fyId) match.fiscalYear = fyId

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $lookup: {
        from: 'accountingentries',
        let: { entryId: '$entry' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$_id', '$$entryId'] },
                  { $in: ['$status', VALID_STATUSES] },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              entryNumber: 1,
              pieceRef: 1,
              status: 1,
              journalCode: 1,
            },
          },
        ],
        as: 'entryDoc',
      },
    },
    { $match: { 'entryDoc.0': { $exists: true } } },
    { $unwind: '$entryDoc' },
    { $sort: { date: 1, sortIndex: 1 } },
    {
      $project: {
        _id: 1,
        date: 1,
        journalCode: 1,
        label: 1,
        debit: 1,
        credit: 1,
        lettrage: 1,
        sortIndex: 1,
        entryNumber: '$entryDoc.entryNumber',
        pieceRef: '$entryDoc.pieceRef',
        entryStatus: '$entryDoc.status',
      },
    },
  ]

  const rawMovements = (await AccountingLine.aggregate(pipeline)) as unknown as RawMovement[]

  // Calcul du solde courant cumulé.
  let running = round2(openingBalance)
  let totalDebit = 0
  let totalCredit = 0
  const movements: LedgerMovement[] = rawMovements.map((m) => {
    const debit = round2(m.debit)
    const credit = round2(m.credit)
    running = round2(running + debit - credit)
    totalDebit = round2(totalDebit + debit)
    totalCredit = round2(totalCredit + credit)
    return {
      _id: m._id,
      date: m.date,
      journalCode: m.journalCode,
      entryNumber: m.entryNumber,
      pieceRef: m.pieceRef || '',
      label: m.label || '',
      debit,
      credit,
      runningBalance: running,
      lettrage: m.lettrage || '',
      entryStatus: m.entryStatus,
    }
  })

  const balance = round2(totalDebit - totalCredit)
  const closingBalance = round2(round2(openingBalance) + balance)

  return {
    account: {
      code: account.code,
      label: account.label,
      class: account.accountClass,
      type: account.type,
      isLettrable: Boolean(account.isLettrable),
    },
    openingBalance: round2(openingBalance),
    movements,
    totals: {
      debit: totalDebit,
      credit: totalCredit,
      balance,
      closingBalance,
    },
  }
}
