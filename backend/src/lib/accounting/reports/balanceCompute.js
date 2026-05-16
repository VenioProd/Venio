import mongoose from 'mongoose'
import AccountingLine from '../../../models/AccountingLine.js'

// Helper d'agrégation Mongo partagé pour calculer des soldes comptables.
// Toutes les fonctions ici excluent strictement les écritures DRAFT —
// seules VALIDATED et LOCKED sont prises en compte dans les rapports.

const VALID_STATUSES = ['VALIDATED', 'LOCKED']

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

function toObjectId(value) {
  if (!value) return null
  if (value instanceof mongoose.Types.ObjectId) return value
  if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value)
  }
  if (value._id) return toObjectId(value._id)
  return null
}

/**
 * Construit le bloc $match initial sur AccountingLine en fonction des filtres.
 */
function buildLineMatch(filter = {}) {
  const match = {}
  const { from, to, fiscalYear, accountCode, accountCodePrefixes } = filter
  if (from || to) {
    match.date = {}
    if (from) match.date.$gte = from instanceof Date ? from : new Date(from)
    if (to) match.date.$lte = to instanceof Date ? to : new Date(to)
  }
  const fyId = toObjectId(fiscalYear)
  if (fyId) match.fiscalYear = fyId
  if (accountCode) match.accountCode = String(accountCode)
  if (Array.isArray(accountCodePrefixes) && accountCodePrefixes.length > 0) {
    // Filtre par préfixes : un OR de regex ^prefix
    const escaped = accountCodePrefixes.map((p) => String(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    match.accountCode = { $regex: `^(${escaped.join('|')})` }
  }
  return match
}

/**
 * Calcule les soldes (cumul débit / crédit / solde) par compte, sur une période.
 * Filtre uniquement les écritures VALIDATED et LOCKED (jamais DRAFT).
 *
 * @param {Object} filter
 * @param {Date}   [filter.from]              Date inclusive
 * @param {Date}   [filter.to]                Date inclusive
 * @param {ObjectId|string} [filter.fiscalYear] Restreint à un exercice
 * @param {number} [filter.accountClass]      Filtre par classe (1..7)
 * @param {string} [filter.accountCode]       Filtre sur un compte précis (code)
 * @param {string[]} [filter.accountCodePrefixes] Filtre par préfixes (ex: ['6','7'])
 * @returns {Promise<Array<{accountCode, accountLabel, accountClass, type, debit, credit, balance}>>}
 *   balance = debit - credit (positif si débit, négatif si crédit)
 */
export async function computeAccountBalances(filter = {}) {
  const lineMatch = buildLineMatch(filter)

  const pipeline = [
    { $match: lineMatch },
    // On filtre les lignes dont l'écriture parent est VALIDATED ou LOCKED.
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
    // Jointure vers ChartOfAccount pour récupérer la classe et le type.
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

  let rows = await AccountingLine.aggregate(pipeline)

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

/**
 * Calcule le solde d'ouverture d'un compte avant une date donnée — utile pour le grand livre.
 * Si `before` n'est pas fourni, retourne 0.
 *
 * @param {Object} params
 * @param {string} params.accountCode
 * @param {ObjectId|string} [params.fiscalYear]
 * @param {Date} [params.before]   Date d'arrêt EXCLUSIVE
 * @returns {Promise<number>}      Solde = débit - crédit cumulé
 */
export async function computeOpeningBalance({ accountCode, fiscalYear, before } = {}) {
  if (!accountCode || !before) return 0

  const match = {
    accountCode: String(accountCode),
    date: { $lt: before instanceof Date ? before : new Date(before) },
  }
  const fyId = toObjectId(fiscalYear)
  if (fyId) match.fiscalYear = fyId

  const pipeline = [
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

  const result = await AccountingLine.aggregate(pipeline)
  if (!result.length) return 0
  return round2((result[0].debit || 0) - (result[0].credit || 0))
}

export { VALID_STATUSES, round2 }
