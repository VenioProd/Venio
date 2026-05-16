import { computeAccountBalances, round2 } from './balanceCompute.js'

/**
 * Renvoie une balance générale (état des soldes par compte).
 *
 * @param {Object} params
 * @param {Date|string} [params.from]
 * @param {Date|string} [params.to]
 * @param {ObjectId|string} [params.fiscalYear]
 * @param {number} [params.accountClass]
 * @param {boolean} [params.includeZero=false]  Si false, masque les comptes à débit=0 ET crédit=0.
 */
export async function getTrialBalance({
  from,
  to,
  fiscalYear,
  accountClass,
  includeZero = false,
} = {}) {
  const balances = await computeAccountBalances({
    from,
    to,
    fiscalYear,
    accountClass,
  })

  const rows = (includeZero ? balances : balances.filter((b) => b.debit !== 0 || b.credit !== 0))
    .map((b) => ({
      accountCode: b.accountCode,
      accountLabel: b.accountLabel,
      accountClass: b.accountClass,
      type: b.type,
      debit: b.debit,
      credit: b.credit,
      balance: b.balance,
    }))

  let totalDebit = 0
  let totalCredit = 0
  for (const r of rows) {
    totalDebit = round2(totalDebit + r.debit)
    totalCredit = round2(totalCredit + r.credit)
  }

  return {
    rows,
    totals: {
      debit: totalDebit,
      credit: totalCredit,
    },
  }
}
