import AccountingEntry from '../../../models/AccountingEntry.js'
import FiscalYear from '../../../models/FiscalYear.js'
import { computeAccountBalances, round2 } from './balanceCompute.js'

const MONTH_LABELS_FR = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
]

function startOfMonth(date) {
  const d = new Date(date)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function endOfMonth(date) {
  const d = new Date(date)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}

function monthKey(date) {
  const d = new Date(date)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(date) {
  const d = new Date(date)
  return `${MONTH_LABELS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * Somme les soldes d'un ensemble de comptes filtrés par préfixe(s).
 * - sign='credit' => crédit - débit (utile pour comptes 7, 401, 44571…)
 * - sign='debit'  => débit - crédit (utile pour comptes 6, 411, 512…)
 */
function sumByPrefix(balances, prefixes, sign = 'debit') {
  let total = 0
  for (const b of balances) {
    if (!prefixes.some((p) => b.accountCode.startsWith(p))) continue
    const v = sign === 'credit' ? b.credit - b.debit : b.debit - b.credit
    total = round2(total + v)
  }
  return total
}

/**
 * Tableau de bord comptable : KPI clés + courbe mensuelle CA/charges + top comptes CA.
 *
 * @param {Object} [params]
 * @param {Date} [params.now]
 */
export async function getAccountingDashboard({ now = new Date() } = {}) {
  // Exercice courant.
  let fyDoc = await FiscalYear.findContaining(now)
  if (fyDoc && typeof fyDoc.toObject === 'function') fyDoc = fyDoc.toObject()

  // Si pas d'exercice ouvert, on retombe sur le plus récent par endDate.
  if (!fyDoc) {
    fyDoc = await FiscalYear.findOne().sort({ endDate: -1 }).lean()
  }

  const monthStart = startOfMonth(now)
  const monthEnd = now

  // --- KPIs sur le mois courant (toutes classes) ---
  const monthBalances = await computeAccountBalances({
    from: monthStart,
    to: monthEnd,
    fiscalYear: fyDoc ? fyDoc._id : null,
  })

  // --- KPIs YTD (depuis le début de l'exercice) ---
  const ytdBalances = await computeAccountBalances({
    from: fyDoc ? fyDoc.startDate : undefined,
    to: monthEnd,
    fiscalYear: fyDoc ? fyDoc._id : null,
  })

  const revenueMonth = sumByPrefix(monthBalances, ['7'], 'credit')
  const revenueYTD = sumByPrefix(ytdBalances, ['7'], 'credit')
  const expensesMonth = sumByPrefix(monthBalances, ['6'], 'debit')
  const expensesYTD = sumByPrefix(ytdBalances, ['6'], 'debit')

  // Soldes "à date" pour créances/dettes/banque/TVA (cumul depuis toujours, plafonné à `now`).
  const cumulativeBalances = await computeAccountBalances({
    to: monthEnd,
    fiscalYear: fyDoc ? fyDoc._id : null,
  })

  const receivables = sumByPrefix(cumulativeBalances, ['411'], 'debit')
  const payables = sumByPrefix(cumulativeBalances, ['401'], 'credit')
  const vatCollected = sumByPrefix(cumulativeBalances, ['44571'], 'credit')
  const vatDeductible = sumByPrefix(cumulativeBalances, ['44566'], 'debit')
  const vatToPay = round2(vatCollected - vatDeductible)
  const bankBalance = sumByPrefix(cumulativeBalances, ['512', '514', '517'], 'debit')

  // Nombre d'écritures DRAFT — non filtré par exercice pour remonter toutes les pendantes.
  const draftEntriesCount = await AccountingEntry.countDocuments({ status: 'DRAFT' })

  // --- Courbe mensuelle CA / charges sur 13 mois (12 derniers + courant) ---
  const monthlyRevenue = []
  for (let i = 12; i >= 0; i -= 1) {
    const ref = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const mStart = startOfMonth(ref)
    const mEnd = endOfMonth(ref)
    // eslint-disable-next-line no-await-in-loop
    const monthBal = await computeAccountBalances({
      from: mStart,
      to: mEnd,
    })
    const revenue = sumByPrefix(monthBal, ['7'], 'credit')
    const expense = sumByPrefix(monthBal, ['6'], 'debit')
    monthlyRevenue.push({
      month: monthKey(ref),
      label: monthLabel(ref),
      revenue,
      expense,
    })
  }

  // --- Top 5 comptes de vente (706*/707*/708*) sur YTD ---
  const salesAccounts = ytdBalances
    .filter((b) => ['706', '707', '708'].some((p) => b.accountCode.startsWith(p)))
    .map((b) => ({
      code: b.accountCode,
      label: b.accountLabel,
      amount: round2(b.credit - b.debit),
    }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)

  return {
    currency: 'EUR',
    asOf: now,
    fiscalYear: fyDoc
      ? {
          _id: fyDoc._id,
          code: fyDoc.code,
          label: fyDoc.label || '',
          startDate: fyDoc.startDate,
          endDate: fyDoc.endDate,
        }
      : null,
    kpi: {
      revenueMonth,
      revenueYTD,
      expensesMonth,
      expensesYTD,
      receivables,
      payables,
      vatToPay,
      bankBalance,
      draftEntriesCount,
    },
    monthlyRevenue,
    topRevenueAccounts: salesAccounts,
  }
}
