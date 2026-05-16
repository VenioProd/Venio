import mongoose, { type Types } from 'mongoose'
import FiscalYear from '../../../models/FiscalYear.js'
import { computeAccountBalances, round2 } from './balanceCompute.js'
import type { IFiscalYear } from '../../../types/models/index.js'

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

// Libellés de sous-classes courantes du PCG (à 2 chiffres).
const GROUP_LABELS: Record<number, string> = {
  60: 'Achats',
  61: 'Services extérieurs',
  62: 'Autres services extérieurs',
  63: 'Impôts et taxes',
  64: 'Charges de personnel',
  65: 'Autres charges de gestion courante',
  66: 'Charges financières',
  67: 'Charges exceptionnelles',
  68: 'Dotations aux amortissements',
  69: 'Participation, impôts sur les bénéfices',
  70: 'Ventes de produits / prestations',
  71: 'Production stockée',
  72: 'Production immobilisée',
  74: 'Subventions d’exploitation',
  75: 'Autres produits de gestion courante',
  76: 'Produits financiers',
  77: 'Produits exceptionnels',
  78: 'Reprises sur amortissements',
  79: 'Transferts de charges',
}

function formatPeriodLabel(from: Date | null, to: Date | null): string {
  if (!from && !to) return 'Période complète'
  const fmt = (d: Date | string) => new Date(d).toISOString().slice(0, 10)
  if (from && to) return `${fmt(from)} → ${fmt(to)}`
  if (from) return `Depuis ${fmt(from)}`
  return `Jusqu’au ${fmt(to!)}`
}

export interface IncomeStatementParams {
  fiscalYear?: ObjectIdInput
  from?: Date | string | null
  to?: Date | string | null
}

export interface IncomeStatementRow {
  code: string
  label: string
  accountClass: number | null
  amount: number
}

export interface IncomeStatementGroup {
  group: string
  label: string
  amount: number
}

export interface IncomeStatementResult {
  periodLabel: string
  charges: IncomeStatementRow[]
  produits: IncomeStatementRow[]
  totalCharges: number
  totalProduits: number
  result: number
  chargesByGroup: IncomeStatementGroup[]
  produitsByGroup: IncomeStatementGroup[]
}

type FiscalYearLean = Pick<IFiscalYear, 'code' | 'label' | 'startDate' | 'endDate'> & {
  _id: Types.ObjectId
}

/**
 * Compte de résultat = produits (classe 7) - charges (classe 6).
 */
export async function getIncomeStatement(
  params: IncomeStatementParams = {}
): Promise<IncomeStatementResult> {
  const { fiscalYear, from, to } = params
  let fyDoc: FiscalYearLean | null = null
  const fyId = toObjectId(fiscalYear)
  if (fyId) {
    fyDoc = (await FiscalYear.findById(fyId).lean()) as FiscalYearLean | null
  }

  const fromDate = from
    ? from instanceof Date
      ? from
      : new Date(from)
    : fyDoc
    ? fyDoc.startDate
    : null
  const toDate = to
    ? to instanceof Date
      ? to
      : new Date(to)
    : fyDoc
    ? fyDoc.endDate
    : null

  const accounts = await computeAccountBalances({
    fiscalYear: fyDoc ? fyDoc._id : null,
    from: fromDate,
    to: toDate,
    accountCodePrefixes: ['6', '7'],
  })

  const charges: IncomeStatementRow[] = []
  const produits: IncomeStatementRow[] = []
  const chargesGroupMap = new Map<string, number>()
  const produitsGroupMap = new Map<string, number>()

  for (const a of accounts) {
    if (a.debit === 0 && a.credit === 0) continue
    const code = a.accountCode
    const group = code.slice(0, 2)

    if (a.accountClass === 6) {
      const amount = round2(a.debit - a.credit)
      charges.push({ code, label: a.accountLabel, accountClass: a.accountClass, amount })
      chargesGroupMap.set(group, round2((chargesGroupMap.get(group) || 0) + amount))
    } else if (a.accountClass === 7) {
      const amount = round2(a.credit - a.debit)
      produits.push({ code, label: a.accountLabel, accountClass: a.accountClass, amount })
      produitsGroupMap.set(group, round2((produitsGroupMap.get(group) || 0) + amount))
    }
  }

  charges.sort((a, b) => a.code.localeCompare(b.code))
  produits.sort((a, b) => a.code.localeCompare(b.code))

  const totalCharges = round2(charges.reduce((s, r) => s + r.amount, 0))
  const totalProduits = round2(produits.reduce((s, r) => s + r.amount, 0))
  const result = round2(totalProduits - totalCharges)

  const chargesByGroup: IncomeStatementGroup[] = Array.from(chargesGroupMap.entries())
    .map(([group, amount]) => ({
      group,
      label: GROUP_LABELS[Number(group)] || `Classe ${group}`,
      amount,
    }))
    .sort((a, b) => a.group.localeCompare(b.group))

  const produitsByGroup: IncomeStatementGroup[] = Array.from(produitsGroupMap.entries())
    .map(([group, amount]) => ({
      group,
      label: GROUP_LABELS[Number(group)] || `Classe ${group}`,
      amount,
    }))
    .sort((a, b) => a.group.localeCompare(b.group))

  return {
    periodLabel: formatPeriodLabel(fromDate, toDate),
    charges,
    produits,
    totalCharges,
    totalProduits,
    result,
    chargesByGroup,
    produitsByGroup,
  }
}
