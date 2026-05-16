import mongoose, { type Types, type PipelineStage } from 'mongoose'
import AccountingLine from '../../models/AccountingLine.js'

// Helpers de calcul TVA pour pré-remplir une déclaration CA3.
// IMPORTANT : toutes les agrégations excluent les écritures DRAFT — seules
// les écritures VALIDATED et LOCKED comptent.

const VALID_STATUSES = ['VALIDATED', 'LOCKED'] as const

function round2(n: number | null | undefined): number {
  return Math.round(Number(n || 0) * 100) / 100
}

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

type VatKind = 'collected' | 'deductible'

/**
 * Tente de déduire un taux à partir d'un code de compte de TVA quand
 * vatRateValue n'est pas renseigné sur la ligne. Permet d'avoir un fallback
 * basique sur les comptes standards du PCG.
 */
function inferRateFromAccountCode(accountCode: string | null | undefined): number | null {
  const code = String(accountCode || '')
  // Comptes TVA "génériques" PCG agence : on suppose 20% par défaut.
  if (code.startsWith('44571') || code.startsWith('44566') || code.startsWith('44562')) {
    return 20
  }
  return null
}

interface VatAggregateParams {
  kind: VatKind
  periodStart: Date
  periodEnd: Date
  fiscalYear?: ObjectIdInput
}

interface VatRateBucket {
  amount: number
  accounts: Set<string>
}

interface AggregateVatRow {
  _id: { rate: number | null; accountCode: string }
  amount: number
}

/**
 * Agrège la TVA stockée sur les comptes 4457x (collectée) ou 4456x
 * (déductible). On regroupe par vatRateValue lorsqu'il est défini sur la
 * ligne ; sinon on bascule sur un mapping par préfixe de compte.
 */
async function aggregateVatByRate(
  params: VatAggregateParams
): Promise<Map<number, VatRateBucket>> {
  const { kind, periodStart, periodEnd, fiscalYear } = params
  const prefix = kind === 'collected' ? '4457' : '4456'
  const sumField = kind === 'collected' ? '$credit' : '$debit'

  const match: Record<string, unknown> = {
    accountCode: { $regex: `^${prefix}` },
    date: { $gte: periodStart, $lte: periodEnd },
  }
  const fyId = toObjectId(fiscalYear)
  if (fyId) match.fiscalYear = fyId

  const pipeline: PipelineStage[] = [
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

  const rows = (await AccountingLine.aggregate(pipeline)) as unknown as AggregateVatRow[]
  const byRate = new Map<number, VatRateBucket>()
  for (const row of rows) {
    let rate: number | null = row._id.rate
    if (rate == null) {
      rate = inferRateFromAccountCode(row._id.accountCode)
    }
    if (rate == null) continue
    const key = Number(rate)
    const current = byRate.get(key) || { amount: 0, accounts: new Set<string>() }
    current.amount += row.amount || 0
    current.accounts.add(row._id.accountCode)
    byRate.set(key, current)
  }
  return byRate
}

interface AggregateBaseRow {
  accountCode: string
  debit: number
  credit: number
  vatRateValue: number | null
  siblings: Array<{ accountCode: string; vatRateValue: number | null }>
}

/**
 * Agrège les bases HT (classes 6 ou 7) rattachées aux écritures qui contiennent
 * de la TVA du sens demandé (collectée ou déductible), regroupé par taux.
 */
async function aggregateBaseByRate(params: VatAggregateParams): Promise<Map<number, number>> {
  const { kind, periodStart, periodEnd, fiscalYear } = params
  const classPrefix = kind === 'collected' ? '7' : '6'
  const vatPrefix = kind === 'collected' ? '4457' : '4456'

  const match: Record<string, unknown> = {
    accountCode: { $regex: `^${classPrefix}` },
    date: { $gte: periodStart, $lte: periodEnd },
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

  const rows = (await AccountingLine.aggregate(pipeline)) as unknown as AggregateBaseRow[]
  const byRate = new Map<number, number>()

  for (const row of rows) {
    // Détermination du taux pour cette ligne HT :
    //  1. on prend vatRateValue de la ligne elle-même s'il est défini ;
    //  2. sinon, on cherche une ligne sœur sur 4456/4457 qui porte un vatRateValue ;
    //  3. sinon on tombe sur l'inférence par compte 4457x/4456x ;
    //  4. sinon on ignore (vente HT sans TVA = pas dans la déclaration).
    let rate: number | null = row.vatRateValue
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

export interface VatRateBreakdown {
  rate: number
  base: number
  amount: number
}

export interface VatDeclarationLine {
  code: string
  label: string
  base: number
  amount: number
}

interface BuildDeclarationLinesInput {
  collectedByRate: VatRateBreakdown[]
  deductibleByRate: VatRateBreakdown[]
  totalCollected: number
  deductibleImmo: number
  deductibleAutres: number
  previousCredit: number
}

/**
 * Construit les lignes CA3 simplifiées à partir des breakdowns par taux.
 */
function buildDeclarationLines(input: BuildDeclarationLinesInput): VatDeclarationLine[] {
  const {
    collectedByRate,
    totalCollected,
    deductibleImmo,
    deductibleAutres,
    previousCredit,
  } = input
  const lines: VatDeclarationLine[] = []

  const totalCollectedBase = collectedByRate.reduce((s, r) => s + r.base, 0)
  if (totalCollectedBase > 0 || totalCollected > 0) {
    lines.push({
      code: '01',
      label: 'Ventes, prestations de services',
      base: round2(totalCollectedBase),
      amount: round2(totalCollected),
    })
  }

  const rateLineMap: Array<{ rate: number; code: string; label: string }> = [
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

export interface ComputeVatParams {
  periodStart: Date
  periodEnd: Date
  fiscalYear?: ObjectIdInput
  previousCredit?: number
}

export interface ComputeVatResult {
  periodStart: Date
  periodEnd: Date
  collectedByRate: VatRateBreakdown[]
  deductibleByRate: VatRateBreakdown[]
  totalCollected: number
  totalDeductible: number
  totalDue: number
  declarationLines: VatDeclarationLine[]
}

/**
 * Calcule la TVA collectée et déductible sur une période donnée.
 */
export async function computeVatForPeriod(params: ComputeVatParams): Promise<ComputeVatResult> {
  const { periodStart, periodEnd, fiscalYear, previousCredit = 0 } = params || ({} as ComputeVatParams)

  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date)) {
    const err = new Error('periodStart et periodEnd doivent être des Date') as Error & {
      status?: number
    }
    err.status = 400
    throw err
  }
  if (periodStart > periodEnd) {
    const err = new Error('periodStart doit être <= periodEnd') as Error & { status?: number }
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
  const collectedRates = new Set<number>([
    ...collectedTvaByRate.keys(),
    ...collectedBaseByRate.keys(),
  ])
  const collectedByRate: VatRateBreakdown[] = Array.from(collectedRates)
    .sort((a, b) => b - a)
    .map((rate) => ({
      rate,
      base: round2(collectedBaseByRate.get(rate) || 0),
      amount: round2((collectedTvaByRate.get(rate) || { amount: 0 }).amount || 0),
    }))

  const deductibleRates = new Set<number>([
    ...deductibleTvaByRate.keys(),
    ...deductibleBaseByRate.keys(),
  ])
  const deductibleByRate: VatRateBreakdown[] = Array.from(deductibleRates)
    .sort((a, b) => b - a)
    .map((rate) => ({
      rate,
      base: round2(deductibleBaseByRate.get(rate) || 0),
      amount: round2((deductibleTvaByRate.get(rate) || { amount: 0 }).amount || 0),
    }))

  // 4. Split déductible immo (préfixe 44562x) vs autres biens et services.
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

interface SplitDeductibleParams {
  periodStart: Date
  periodEnd: Date
  fiscalYear?: ObjectIdInput
}

interface SplitDeductibleRow {
  _id: string
  amount: number
}

/**
 * Répartit la TVA déductible entre immobilisations (préfixe 44562) et
 * autres biens et services (autres 4456x).
 */
async function splitDeductibleByImmoOrAutres(
  params: SplitDeductibleParams
): Promise<{ immo: number; autres: number }> {
  const { periodStart, periodEnd, fiscalYear } = params
  const match: Record<string, unknown> = {
    accountCode: { $regex: '^4456' },
    date: { $gte: periodStart, $lte: periodEnd },
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
        _id: '$accountCode',
        amount: { $sum: '$debit' },
      },
    },
  ]

  const rows = (await AccountingLine.aggregate(pipeline)) as unknown as SplitDeductibleRow[]
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
