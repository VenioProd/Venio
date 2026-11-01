import { useEffect, useMemo, useState } from 'react'
import AccountingLayout from './AccountingLayout'
import { getTrialBalance, listFiscalYears, downloadReportCsv } from '../../../services/accounting'
import type { AccountType, IFiscalYear, ITrialBalanceData, ITrialBalanceRow } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatMoney } from '../../../i18n/format'

function formatEur(n: unknown): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  return formatMoney(value)
}

function balanceColor(type: AccountType | undefined, balance: unknown): string {
  const b = Number(balance) || 0
  if (b === 0) return 'var(--text-primary)'
  const debitNormal = type === 'ACTIF' || type === 'CHARGE'
  const creditNormal = type === 'PASSIF' || type === 'PRODUIT' || type === 'CAPITAUX'
  if (debitNormal) return b > 0 ? 'var(--good)' : 'var(--critical)'
  if (creditNormal) return b < 0 ? 'var(--good)' : 'var(--critical)'
  return 'var(--text-primary)'
}

interface TrialBalanceFilters {
  from: string
  to: string
  fiscalYear: string
  accountClass: string
  includeZero: boolean
}

type SeparatorRow = { __separator: true; classNum: number; key: string }
type DisplayRow = ITrialBalanceRow | SeparatorRow

function isSeparator(r: DisplayRow): r is SeparatorRow {
  return (r as SeparatorRow).__separator === true
}

const TrialBalance = () => {
  const { t } = useI18n()
  const [fiscalYears, setFiscalYears] = useState<IFiscalYear[]>([])
  const [data, setData] = useState<ITrialBalanceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState<TrialBalanceFilters>({
    from: '',
    to: '',
    fiscalYear: '',
    accountClass: '',
    includeZero: false,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const f = await listFiscalYears()
        if (!cancelled) setFiscalYears(f || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : translate('common.error'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function runQuery() {
    setLoading(true)
    setError('')
    try {
      const result = await getTrialBalance({
        from: filters.from || undefined,
        to: filters.to || undefined,
        fiscalYear: filters.fiscalYear || undefined,
        accountClass: filters.accountClass || undefined,
        includeZero: filters.includeZero,
      })
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runQuery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleExport() {
    try {
      await downloadReportCsv('balance', {
        from: filters.from || undefined,
        to: filters.to || undefined,
        fiscalYear: filters.fiscalYear || undefined,
        accountClass: filters.accountClass || undefined,
        includeZero: filters.includeZero,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    }
  }

  const rows = data?.rows || []
  const totals = data?.totals
  const balanced = useMemo(() => {
    if (!totals) return false
    return Math.abs(Number(totals.debit) - Number(totals.credit)) < 0.01
  }, [totals])

  const rowsWithSeparators: DisplayRow[] = useMemo(() => {
    const out: DisplayRow[] = []
    let lastClass: number | null = null
    for (const r of rows) {
      if (r.accountClass !== lastClass) {
        out.push({ __separator: true, classNum: r.accountClass, key: `sep-${r.accountClass}` })
        lastClass = r.accountClass
      }
      out.push(r)
    }
    return out
  }, [rows])

  return (
    <AccountingLayout
      title={t('accAccounts.trial.title')}
      subtitle={t('accAccounts.trial.subtitle')}
      actions={
        <button className="portal-button secondary" onClick={handleExport}>
          {t('accAccounts.common.exportCsv')}
        </button>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <input
            type="date"
            className="portal-input"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            title={t('accAccounts.common.startDate')}
          />
          <input
            type="date"
            className="portal-input"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            title={t('accAccounts.common.endDate')}
          />
          <select
            className="portal-input"
            value={filters.fiscalYear}
            onChange={(e) => setFilters({ ...filters, fiscalYear: e.target.value })}
          >
            <option value="">{t('accAccounts.common.allFiscalYears')}</option>
            {fiscalYears.map((fy) => (
              <option key={fy._id} value={fy._id}>
                {fy.code || fy.label}
              </option>
            ))}
          </select>
          <select
            className="portal-input"
            value={filters.accountClass}
            onChange={(e) => setFilters({ ...filters, accountClass: e.target.value })}
          >
            <option value="">{t('accAccounts.trial.allClasses')}</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => (
              <option key={c} value={c}>
                {t('accAccounts.accounts.classN', { n: c })}
              </option>
            ))}
          </select>
          <label style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={filters.includeZero}
              onChange={(e) => setFilters({ ...filters, includeZero: e.target.checked })}
            />{' '}
            {t('accAccounts.trial.includeZero')}
          </label>
          <button className="portal-button" onClick={runQuery}>
            {t('accAccounts.common.filter')}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('accAccounts.common.loading')}</p>
        ) : !data || rows.length === 0 ? (
          <div className="accounting-empty">
            {t('accAccounts.trial.empty')}
            <div className="hint">{t('accAccounts.trial.emptyHint')}</div>
          </div>
        ) : (
          <div className="accounting-table-scroll">
            <table className="accounting-table">
              <thead>
                <tr>
                  <th>{t('accAccounts.col.code')}</th>
                  <th>{t('accAccounts.col.label')}</th>
                  <th>{t('accAccounts.accounts.class')}</th>
                  <th className="amount">{t('accAccounts.col.debit')}</th>
                  <th className="amount">{t('accAccounts.col.credit')}</th>
                  <th className="amount">{t('accAccounts.col.balance')}</th>
                </tr>
              </thead>
              <tbody>
                {rowsWithSeparators.map((r) =>
                  isSeparator(r) ? (
                    <tr
                      key={r.key}
                      style={{
                        background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                      }}
                    >
                      <td
                        colSpan={6}
                        style={{
                          padding: '8px 14px',
                          fontSize: '0.78rem',
                          textTransform: 'none',
                          letterSpacing: 'normal',
                          color: 'color-mix(in srgb, var(--primary) 85%, transparent)',
                          fontWeight: 600,
                        }}
                      >
                        {t('accAccounts.accounts.classN', { n: r.classNum })}
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.accountCode}>
                      <td className="code">{r.accountCode}</td>
                      <td>{r.accountLabel}</td>
                      <td>{r.accountClass}</td>
                      <td className="amount">{formatEur(r.debit)}</td>
                      <td className="amount">{formatEur(r.credit)}</td>
                      <td
                        className="amount"
                        style={{
                          color: balanceColor(r.type, r.balance),
                          fontWeight: 600,
                        }}
                      >
                        {formatEur(r.balance)}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
              {totals && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid color-mix(in srgb, var(--primary) 40%, transparent)' }}>
                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 700, padding: '14px' }}>
                      {t('accAccounts.entry.totals')}
                    </td>
                    <td className="amount" style={{ fontWeight: 700 }}>
                      {formatEur(totals.debit)}
                    </td>
                    <td className="amount" style={{ fontWeight: 700 }}>
                      {formatEur(totals.credit)}
                    </td>
                    <td className="amount" style={{ fontWeight: 700 }}>
                      {balanced ? (
                        <span style={{ color: 'var(--good)' }}>{t('accAccounts.trial.balanced')}</span>
                      ) : (
                        <span style={{ color: 'var(--critical)' }}>
                          {t('accAccounts.trial.difference', {
                            amount: formatEur(Number(totals.debit) - Number(totals.credit)),
                          })}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>
    </AccountingLayout>
  )
}

export default TrialBalance
