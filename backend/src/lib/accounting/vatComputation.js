import mongoose from 'mongoose'
import AccountingLine from '../../models/AccountingLine.js'

// Helpers de calcul TVA pour pré-remplir une déclaration CA3.
// IMPORTANT : toutes les agrégations excluent les écritures DRAFT — seules
// les écritures VALIDATED et LOCKED comptent.

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
 * Tente de déduire un taux à partir d'un code de compte de TVA quand
 * vatRateValue n'est pas renseigné sur la ligne. Permet d'avoir un fallback
 * basique sur les comptes standards du PCG.
 */
function inferRateFromAccountCode(accountCode) {
  const code = String(accountCode || '')
  // Comptes TVA "génériques" PCG agence : on suppose 20% par défaut.
  if (code.startsWith('44571') || code.startsWith('44566') || code.startsWith('44562')) {
    return 20
  }
  return null
}

/**
 * Agrège la TVA stockée sur les comptes 4457x (collectée) ou 4456x
 * (déductible). On regroupe par vatRateValue lorsqu'il est défini sur la
 * ligne ; sinon on bascule sur un mapping par préfixe de compte.
 *
 * @param {Object} params
 * @param {string} params.kind        'collected' | 'deductible'
 * @param {Date} params.periodStart
 * @param {Date} params.periodEnd
 * @param {ObjectId} [params.fiscalYear]
 * @returns {Promise<Map<number, { amount: number, accounts: string[] }>>}
 */
async function aggregateVatByRate({ kind, periodStart, periodEnd, fiscalYear }) {
  const prefix = kind === 'collected' ? '4457' : '4456'
  const sumField = kind === 'collected' ? '$credit' : '$debit'

  const match = {
    accountCode: { $regex: `^${prefix}` },
    date: { $gte: periodStart, $lte: periodEnd },
  }
  const fyId = toObjectId(fiscalYear)
  if (fyId) match.fiscalYear = fyId

  const pipeline = [
    { $match: match },
    // On joint l'écriture parente pour exclure les DRAFT.
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
        _id: { rate: '$vatRateValue', accountCode: '$accountCode' },
        amount: { $sum: sumField },
      },
    },
  ]

  const rows = await AccountingLine.aggregate(pipeline)
  const byRate = new Map()
  for (const row of rows) {
    let rate = row._id.rate
    if (rate == null) {
      rate = inferRateFromAccountCode(row._id.accountCode)
    }
    if (rate == null) continue
    const key = Number(rate)
    const current = byRate.get(key) || { amount: 0, accounts: new Set() }
    current.amount += row.amount || 0
    current.accounts.add(row._id.accountCode)
    byRate.set(key, current)
  }
  return byRate
}

/**
 * Agrège les bases HT (classes 6 ou 7) ratachées aux écritures qui contiennent
 * de la TVA du sens demandé (collectée ou déductible), regroupé par taux.
 *
 * Méthode : on cherche les lignes 6x (déductible) ou 7x (collectée) sur la
 * période, on remonte à l'écriture parente, puis on regarde le vatRateValue
 * porté soit par la ligne 6/7 elle-même, soit par les autres lignes de la
 * même écriture (lignes TVA 4456/4457).
 */
async function aggregateBaseByRate({ kind, periodStart, periodEnd, fiscalYear }) {
  const classPrefix = kind === 'collected' ? '7' : '6'
  const vatPrefix = kind === 'collected' ? '4457' : '4456'
  const sumField = kind === 'collected' ? '$credit' : '$debit'

  const match = {
    accountCode: { $regex: `^${classPrefix}` },
    date: { $gte: periodStart, $lte: periodEnd },
  }
  const fyId = toObjectId(fiscalYear)
  if (fyId) match.fiscalYear = fyId

  const pipeline = [
    { $match: match },
    // On exclut les DRAFT.
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
    // Pour chaque ligne 6/7, on récupère TOUTES les lignes de la même écriture
    // afin de pouvoir lire le vatRateValue porté par la ligne TVA associée.
    {
      $lookup: {
        from: 'accountinglines',
        let: { entryId: '$entry' },
        pipeline: [
          { $match: { $expr: { $eq: ['$entry', '$$entryId'] } } },
          { $project: { accountCode: 1, vatRateValue: 1 } },
        ],
        as: 'siblings',
      },
    },
    {
      $project: {
        accountCode: 1,
        debit: 1,
        credit: 1,
        vatRateValue: 1,
        siblings: 1,
      },
    },
  ]

  const rows = await AccountingLine.aggregate(pipeline)
  const byRate = new Map()

  for (const row of rows) {
    // Détermination du taux pour cette ligne HT :
    //  1. on prend vatRateValue de la ligne elle-même s'il est défini ;
    //  2. sinon, on cherche une ligne sœur sur un compte 4456/4457 qui porte
    //     un vatRateValue ;
    //  3. sinon on tombe sur l'inférence par compte 4457x/4456x ;
    //  4. sinon on ignore (vente HT sans TVA = pas dans la déclaration).
    let rate = row.vatRateValue
    if (rate == null) {
      const sibling = (row.siblings || []).find(
        (s) => String(s.accountCode || '').startsWith(vatPrefix) && s.vatRateValue != null
      )
      if (sibling) rate = sibling.vatRateValue
    }
    if (rate == null) {
      const sibling = (row.siblings || []).find((s) =>
        String(s.accountCode || '').startsWith(vatPrefix)
      )
      if (sibling) rate = inferRateFromAccountCode(sibling.accountCode)
    }
    if (rate == null) continue

    const amount = kind === 'collected' ? row.credit || 0 : row.debit || 0
    if (amount <= 0) continue
    const key = Number(rate)
    const current = byRate.get(key) || 0
    byRate.set(key, current + amount)
  }
  return byRate
}

/**
 * Construit les lignes CA3 simplifiées à partir des breakdowns par taux.
 * Mapping :
 *  - 01 : total HT collecté tous taux + total TVA collectée
 *  - 08 : HT @20% / TVA @20%
 *  - 09 : HT @10% / TVA @10%
 *  - 9B : HT @5,5%
 *  - 9C : HT @2,1%
 *  - 16 : total TVA brute due
 *  - 19 : TVA déductible immo (4452x)
 *  - 20 : TVA déductible autres biens et services (4456x hors 4452x)
 *  - 28 : crédit antérieur (paramètre)
 *  - 32 : TVA à payer (>0)
 */
function buildDeclarationLines({
  collectedByRate,
  deductibleByRate,
  totalCollected,
  deductibleImmo,
  deductibleAutres,
  previousCredit,
}) {
  const lines = []

  const totalCollectedBase = collectedByRate.reduce((s, r) => s + r.base, 0)
  if (totalCollectedBase > 0 || totalCollected > 0) {
    lines.push({
      code: '01',
      label: 'Ventes, prestations de services',
      base: round2(totalCollectedBase),
      amount: round2(totalCollected),
    })
  }

  const rateLineMap = [
    { rate: 20, code: '08', label: 'Opérations imposables au taux normal 20 %' },
    { rate: 10, code: '09', label: 'Opérations imposables au taux 10 %' },
    { rate: 5.5, code: '9B', label: 'Opérations imposables au taux 5,5 %' },
    { rate: 2.1, code: '9C', label: 'Opérations imposables au taux 2,1 %' },
  ]
  for (const { rate, code, label } of rateLineMap) {
    const bucket = collectedByRate.find((r) => Number(r.rate) === rate)
    if (!bucket) continue
    if (bucket.base <= 0 && bucket.amount <= 0) continue
    lines.push({
      code,
      label,
      base: round2(bucket.base),
      amount: round2(bucket.amount),
    })
  }

  if (totalCollected > 0) {
    lines.push({
      code: '16',
      label: 'TVA brute due',
      base: 0,
      amount: round2(totalCollected),
    })
  }

  if (deductibleImmo > 0) {
    lines.push({
      code: '19',
      label: 'Biens constituant des immobilisations',
      base: 0,
      amount: round2(deductibleImmo),
    })
  }

  if (deductibleAutres > 0) {
    lines.push({
      code: '20',
      label: 'Autres biens et services',
      base: 0,
      amount: round2(deductibleAutres),
    })
  }

  if (previousCredit > 0) {
    lines.push({
      code: '28',
      label: 'Crédit antérieur',
      base: 0,
      amount: round2(previousCredit),
    })
  }

  const totalDeductibleAll = round2(deductibleImmo + deductibleAutres)
  const due = round2(totalCollected - totalDeductibleAll - (previousCredit || 0))
  if (due > 0) {
    lines.push({
      code: '32',
      label: 'TVA à payer',
      base: 0,
      amount: due,
    })
  }

  return lines
}

/**
 * Calcule la TVA collectée et déductible sur une période donnée.
 *
 * Méthodologie :
 *  - TVA collectée  : crédits sur les comptes 4457x (taux pris dans
 *    vatRateValue, sinon déduit du compte 4457x).
 *  - TVA déductible : débits sur les comptes 4456x (idem mapping).
 *  - Bases HT collectée  : crédits sur les comptes 7x, groupés par taux via
 *    le vatRateValue de la ligne ou de sa ligne sœur 4457x.
 *  - Bases HT déductible : débits sur les comptes 6x, idem via 4456x.
 *
 * @param {Object} params
 * @param {Date} params.periodStart
 * @param {Date} params.periodEnd
 * @param {ObjectId} [params.fiscalYear]
 * @param {number} [params.previousCredit] crédit reporté (par défaut 0)
 */
export async function computeVatForPeriod({
  periodStart,
  periodEnd,
  fiscalYear,
  previousCredit = 0,
} = {}) {
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date)) {
    const err = new Error('periodStart et periodEnd doivent être des Date')
    err.status = 400
    throw err
  }
  if (periodStart > periodEnd) {
    const err = new Error('periodStart doit être <= periodEnd')
    err.status = 400
    throw err
  }

  // 1. TVA par taux (collectée + déductible)
  const collectedTvaByRate = await aggregateVatByRate({
    kind: 'collected',
    periodStart,
    periodEnd,
    fiscalYear,
  })
  const deductibleTvaByRate = await aggregateVatByRate({
    kind: 'deductible',
    periodStart,
    periodEnd,
    fiscalYear,
  })

  // 2. Bases HT par taux
  const collectedBaseByRate = await aggregateBaseByRate({
    kind: 'collected',
    periodStart,
    periodEnd,
    fiscalYear,
  })
  const deductibleBaseByRate = await aggregateBaseByRate({
    kind: 'deductible',
    periodStart,
    periodEnd,
    fiscalYear,
  })

  // 3. Fusion par taux pour le breakdown final, trié rate desc.
  const collectedRates = new Set([
    ...collectedTvaByRate.keys(),
    ...collectedBaseByRate.keys(),
  ])
  const collectedByRate = Array.from(collectedRates)
    .sort((a, b) => b - a)
    .map((rate) => ({
      rate,
      base: round2(collectedBaseByRate.get(rate) || 0),
      amount: round2((collectedTvaByRate.get(rate) || {}).amount || 0),
    }))

  const deductibleRates = new Set([
    ...deductibleTvaByRate.keys(),
    ...deductibleBaseByRate.keys(),
  ])
  const deductibleByRate = Array.from(deductibleRates)
    .sort((a, b) => b - a)
    .map((rate) => ({
      rate,
      base: round2(deductibleBaseByRate.get(rate) || 0),
      amount: round2((deductibleTvaByRate.get(rate) || {}).amount || 0),
    }))

  // 4. Split déductible immo (préfixe 44562x) vs autres biens et services
  // (autres 4456x). Calculé via une agrégation séparée par préfixe de compte.
  const immoSplit = await splitDeductibleByImmoOrAutres({
    periodStart,
    periodEnd,
    fiscalYear,
  })
  const deductibleImmo = immoSplit.immo
  const deductibleAutres = immoSplit.autres

  // 5. Totaux
  const totalCollected = round2(collectedByRate.reduce((s, r) => s + r.amount, 0))
  const totalDeductible = round2(deductibleByRate.reduce((s, r) => s + r.amount, 0))
  const totalDue = round2(totalCollected - totalDeductible - (previousCredit || 0))

  // 6. Lignes CA3 prêtes à afficher
  const declarationLines = buildDeclarationLines({
    collectedByRate,
    deductibleByRate,
    totalCollected,
    deductibleImmo,
    deductibleAutres,
    previousCredit: previousCredit || 0,
  })

  return {
    periodStart,
    periodEnd,
    collectedByRate,
    deductibleByRate,
    totalCollected,
    totalDeductible,
    totalDue,
    declarationLines,
  }
}

/**
 * Répartit la TVA déductible entre immobilisations (préfixe 4452) et
 * autres biens et services (autres 4456x).
 */
async function splitDeductibleByImmoOrAutres({ periodStart, periodEnd, fiscalYear }) {
  const match = {
    accountCode: { $regex: '^4456' },
    date: { $gte: periodStart, $lte: periodEnd },
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
        _id: '$accountCode',
        amount: { $sum: '$debit' },
      },
    },
  ]

  const rows = await AccountingLine.aggregate(pipeline)
  let immo = 0
  let autres = 0
  for (const row of rows) {
    const code = String(row._id || '')
    // 44562x = TVA déductible sur immobilisations
    if (code.startsWith('44562')) {
      immo += row.amount || 0
    } else {
      autres += row.amount || 0
    }
  }
  return { immo: round2(immo), autres: round2(autres) }
}
