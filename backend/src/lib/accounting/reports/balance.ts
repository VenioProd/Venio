import type { Types } from 'mongoose'
import { computeAccountBalances, round2 } from './balanceCompute.js'
import type { AccountType } from '../../../types/enums.js'

type ObjectIdInput = string | Types.ObjectId | { _id: Types.ObjectId | string } | null | undefined

export interface TrialBalanceParams {
  from?: Date | string | null
  to?: Date | string | null
  fiscalYear?: ObjectIdInput
  accountClass?: number | null
  includeZero?: boolean
}

export interface TrialBalanceRow {
  accountCode: string
  accountLabel: string
  accountClass: number | null
  type: AccountType | null
  debit: number
  credit: number
  balance: number
}

export interface TrialBalanceResult {
  rows: TrialBalanceRow[]
  totals: {
    debit: number
    credit: number
  }
}

/**
 * Renvoie une balance générale (état des soldes par compte).
 * Si `includeZero` est false (défaut), masque les comptes débit=0 ET crédit=0.
 */
export async function getTrialBalance(params: TrialBalanceParams = {}): Promise<TrialBalanceResult> {
  const { from, to, fiscalYear, accountClass, includeZero = false } = params

  const balances = await computeAccountBalances({
    from,
    to,
    fiscalYear,
    accountClass: accountClass ?? null,
  })

  const rows: TrialBalanceRow[] = (includeZero
    ? balances
    : balances.filter((b) => b.debit !== 0 || b.credit !== 0)
  ).map((b) => ({
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
