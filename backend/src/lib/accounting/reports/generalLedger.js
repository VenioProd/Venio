import mongoose from 'mongoose'
import AccountingLine from '../../../models/AccountingLine.js'
import ChartOfAccount from '../../../models/ChartOfAccount.js'
import { computeOpeningBalance, VALID_STATUSES, round2 } from './balanceCompute.js'

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
 * Renvoie le grand livre d'un compte : entête compte, solde d'ouverture,
 * mouvements détaillés avec solde courant cumulé, et totaux.
 *
 * Inclut uniquement les écritures VALIDATED et LOCKED (jamais DRAFT).
 *
 * @param {Object} params
 * @param {string} params.accountCode
 * @param {Date|string} [params.from]
 * @param {Date|string} [params.to]
 * @param {ObjectId|string} [params.fiscalYear]
 * @param {boolean} [params.includeOpening=true]
 */
export async function getGeneralLedger({
  accountCode,
  from,
  to,
  fiscalYear,
  includeOpening = true,
} = {}) {
  if (!accountCode) {
    const err = new Error('accountCode requis')
    err.status = 400
    throw err
  }

  const account = await ChartOfAccount.findOne({ code: String(accountCode) }).lean()
  if (!account) {
    const err = new Error(`Compte introuvable : ${accountCode}`)
    err.status = 404
    throw err
  }

  const fromDate = from ? (from instanceof Date ? from : new Date(from)) : null
  const toDate = to ? (to instanceof Date ? to : new Date(to)) : null

  // Solde d'ouverture : tout ce qui précède `from`.
  const openingBalance = includeOpening && fromDate
    ? await computeOpeningBalance({ accountCode, fiscalYear, before: fromDate })
    : 0

  // Mouvements sur la période demandée.
  const match = { accountCode: String(accountCode) }
  if (fromDate || toDate) {
    match.date = {}
    if (fromDate) match.date.$gte = fromDate
    if (toDate) match.date.$lte = toDate
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

  const rawMovements = await AccountingLine.aggregate(pipeline)

  // Calcul du solde courant cumulé.
  let running = round2(openingBalance)
  let totalDebit = 0
  let totalCredit = 0
  const movements = rawMovements.map((m) => {
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
