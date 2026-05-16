import mongoose from 'mongoose'
import FiscalYear from '../../../models/FiscalYear.js'
import { computeAccountBalances, round2 } from './balanceCompute.js'

function toObjectId(value) {
  if (!value) return null
  if (value instanceof mongoose.Types.ObjectId) return value
  if (typeof value === 'string' && mongoose.isValidObjectId(value)) {
    return new mongoose.Types.ObjectId(value)
  }
  if (value._id) return toObjectId(value._id)
  return null
}

// Libellés de sous-classes courantes du PCG (à 2 chiffres).
const GROUP_LABELS = {
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

function formatPeriodLabel(from, to) {
  if (!from && !to) return 'Période complète'
  const fmt = (d) => new Date(d).toISOString().slice(0, 10)
  if (from && to) return `${fmt(from)} → ${fmt(to)}`
  if (from) return `Depuis ${fmt(from)}`
  return `Jusqu’au ${fmt(to)}`
}

/**
 * Compte de résultat = produits (classe 7) - charges (classe 6).
 *
 * @param {Object} params
 * @param {ObjectId|string} [params.fiscalYear]
 * @param {Date|string} [params.from]
 * @param {Date|string} [params.to]
 */
export async function getIncomeStatement({ fiscalYear, from, to } = {}) {
  let fyDoc = null
  const fyId = toObjectId(fiscalYear)
  if (fyId) {
    fyDoc = await FiscalYear.findById(fyId).lean()
  }

  const fromDate = from ? (from instanceof Date ? from : new Date(from)) : (fyDoc ? fyDoc.startDate : null)
  const toDate = to ? (to instanceof Date ? to : new Date(to)) : (fyDoc ? fyDoc.endDate : null)

  const accounts = await computeAccountBalances({
    fiscalYear: fyDoc ? fyDoc._id : null,
    from: fromDate,
    to: toDate,
    accountCodePrefixes: ['6', '7'],
  })

  const charges = []
  const produits = []
  const chargesGroupMap = new Map()
  const produitsGroupMap = new Map()

  for (const a of accounts) {
    if (a.debit === 0 && a.credit === 0) continue
    const code = a.accountCode
    const group = code.slice(0, 2)

    if (a.accountClass === 6) {
      // Charge : montant normal = débit - crédit (positif).
      const amount = round2(a.debit - a.credit)
      charges.push({ code, label: a.accountLabel, accountClass: a.accountClass, amount })
      chargesGroupMap.set(group, round2((chargesGroupMap.get(group) || 0) + amount))
    } else if (a.accountClass === 7) {
      // Produit : montant normal = crédit - débit (positif).
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

  const chargesByGroup = Array.from(chargesGroupMap.entries())
    .map(([group, amount]) => ({
      group,
      label: GROUP_LABELS[Number(group)] || `Classe ${group}`,
      amount,
    }))
    .sort((a, b) => a.group.localeCompare(b.group))

  const produitsByGroup = Array.from(produitsGroupMap.entries())
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
