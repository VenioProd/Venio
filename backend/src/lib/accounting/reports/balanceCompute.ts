import mongoose, { type Types, type PipelineStage } from 'mongoose'
import AccountingLine from '../../../models/AccountingLine.js'
import type { AccountType } from '../../../types/enums.js'

// Helper d'agrégation Mongo partagé pour calculer des soldes comptables.
// Toutes les fonctions ici excluent strictement les écritures DRAFT —
// seules VALIDATED et LOCKED sont prises en compte dans les rapports.

export const VALID_STATUSES = ['VALIDATED', 'LOCKED'] as const

export function round2(n: number | null | undefined): number {
  return Math.round(Number(n || 0) * 100) / 100
}

// Référence acceptée pour un ObjectId (string, ObjectId, ou doc avec ._id).
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

export interface BalanceFilter {
  from?: Date | string | null
  to?: Date | string | null
  fiscalYear?: ObjectIdInput
  accountClass?: number | null
  accountCode?: string | null
  accountCodePrefixes?: string[] | null
}

// Bloc $match initial sur AccountingLine en fonction des filtres.
function buildLineMatch(filter: BalanceFilter): Record<string, unknown> {
  const match: Record<string, unknown> = {}
  const { from, to, fiscalYear, accountCode, accountCodePrefixes } = filter
  if (from || to) {
    const dateFilter: Record<string, Date> = {}
    if (from) dateFilter.$gte = from instanceof Date ? from : new Date(from)
    if (to) dateFilter.$lte = to instanceof Date ? to : new Date(to)
    match.date = dateFilter
  }
  const fyId = toObjectId(fiscalYear)
  if (fyId) match.fiscalYear = fyId
  if (accountCode) match.accountCode = String(accountCode)
  if (Array.isArray(accountCodePrefixes) && accountCodePrefixes.length > 0) {
    // Filtre par préfixes : un OR de regex ^prefix
    const escaped = accountCodePrefixes.map((p) =>
      String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    match.accountCode = { $regex: `^(${escaped.join('|')})` }
  }
  return match
}

export interface AccountBalance {
  accountCode: string
  accountLabel: string
  accountClass: number | null
  type: AccountType | null
  isLettrable: boolean
  debit: number
  credit: number
  balance: number
}

// Forme brute remontée par l'agrégation avant arrondi/typage final.
interface RawBalanceRow {
  accountCode: string
  accountLabel: string | null
  accountClass: number | null
  type: AccountType | null
  isLettrable: boolean
  debit: number
  credit: number
}

/**
 * Calcule les soldes (cumul débit / crédit / solde) par compte sur une période.
 * Filtre uniquement les écritures VALIDATED et LOCKED (jamais DRAFT).
 * balance = debit - credit (positif si débit, négatif si crédit)
 */
export async function computeAccountBalances(filter: BalanceFilter = {}): Promise<AccountBalance[]> {
  const lineMatch = buildLineMatch(filter)

  const pipeline: PipelineStage[] = [
    { $match: lineMatch },
    // On filtre les lignes dont l'écriture parente est VALIDATED ou LOCKED.
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
          { $project: { _id: 1, status: 1 } },
        ],
        as: 'entryDoc',
      },
    },
    { $match: { 'entryDoc.0': { $exists: true } } },
    {
      $group: {
        _id: '$accountCode',
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
        accountLabel: { $first: '$accountLabel' },
      },
    },
    // Jointure ChartOfAccount pour récupérer la classe et le type.
    {
      $lookup: {
        from: 'chartofaccounts',
        localField: '_id',
        foreignField: 'code',
        as: 'coa',
      },
    },
    { $unwind: { path: '$coa', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        accountCode: '$_id',
        accountLabel: { $ifNull: ['$coa.label', '$accountLabel'] },
        accountClass: { $ifNull: ['$coa.accountClass', null] },
        type: { $ifNull: ['$coa.type', null] },
        isLettrable: { $ifNull: ['$coa.isLettrable', false] },
        debit: 1,
        credit: 1,
      },
    },
    { $sort: { accountCode: 1 } },
  ]

  let rows = (await AccountingLine.aggregate(pipeline)) as unknown as RawBalanceRow[]

  // Filtre éventuel par classe (post-aggregation pour pouvoir s'appuyer sur la jointure COA).
  if (filter.accountClass != null) {
    const cls = Number(filter.accountClass)
    rows = rows.filter((r) => r.accountClass === cls)
  }

  return rows.map((r) => {
    const debit = round2(r.debit)
    const credit = round2(r.credit)
    return {
      accountCode: r.accountCode,
      accountLabel: r.accountLabel || '',
      accountClass: r.accountClass,
      type: r.type,
      isLettrable: Boolean(r.isLettrable),
      debit,
      credit,
      balance: round2(debit - credit),
    }
  })
}

export interface OpeningBalanceParams {
  accountCode?: string | null
  fiscalYear?: ObjectIdInput
  before?: Date | string | null
}

/**
 * Solde d'ouverture d'un compte avant une date donnée — utile pour le grand livre.
 * Si `before` n'est pas fourni, retourne 0.
 */
export async function computeOpeningBalance(params: OpeningBalanceParams = {}): Promise<number> {
  const { accountCode, fiscalYear, before } = params
  if (!accountCode || !before) return 0

  const match: Record<string, unknown> = {
    accountCode: String(accountCode),
    date: { $lt: before instanceof Date ? before : new Date(before) },
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
          { $project: { _id: 1 } },
        ],
        as: 'entryDoc',
      },
    },
    { $match: { 'entryDoc.0': { $exists: true } } },
    {
      $group: {
        _id: null,
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
      },
    },
  ]

  const result = (await AccountingLine.aggregate(pipeline)) as unknown as Array<{
    debit: number
    credit: number
  }>
  if (!result.length) return 0
  return round2((result[0]!.debit || 0) - (result[0]!.credit || 0))
}
