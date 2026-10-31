import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AccountingLayout from './AccountingLayout'
import { getGeneralLedger, listAccounts, listFiscalYears, downloadReportCsv } from '../../../services/accounting'
import type { IChartOfAccount, IFiscalYear, IGeneralLedgerData } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatDate as formatDateIntl, formatMoney } from '../../../i18n/format'

function formatEur(n: unknown): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  return formatMoney(value)
}

function formatDate(d: string | undefined | null): string {
  if (!d) return '—'
  return formatDateIntl(d) || '—'
}

interface GLFilters {
  accountCode: string
  from: string
  to: string
  fiscalYear: string
  includeOpening: boolean
}

const GeneralLedger = () => {
  const { t } = useI18n()
  const [accounts, setAccounts] = useState<IChartOfAccount[]>([])
  const [fiscalYears, setFiscalYears] = useState<IFiscalYear[]>([])
  const [data, setData] = useState<IGeneralLedgerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState<GLFilters>({
    accountCode: '',
    from: '',
    to: '',
    fiscalYear: '',
    includeOpening: true,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [a, f] = await Promise.all([listAccounts({ active: true }), listFiscalYears()])
        if (cancelled) return
        setAccounts(a || [])
        setFiscalYears(f || [])
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : translate('common.error'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function runQuery() {
    if (!filters.accountCode) {
      setError(t('accAccounts.ledger.selectAccountError'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await getGeneralLedger({
        accountCode: filters.accountCode,
        from: filters.from || undefined,
        to: filters.to || undefined,
        fiscalYear: filters.fiscalYear || undefined,
        includeOpening: filters.includeOpening,
      })
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleExport() {
    if (!filters.accountCode) {
      setError(t('accAccounts.ledger.selectAccountExport'))
      return
    }
    try {
      await downloadReportCsv('general-ledger', {
        accountCode: filters.accountCode,
        from: filters.from || undefined,
        to: filters.to || undefined,
        fiscalYear: filters.fiscalYear || undefined,
        includeOpening: filters.includeOpening,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    }
  }

  const account = data?.account
  const movements = data?.movements || []
  const totals = data?.totals
  const opening = data?.openingBalance

  return (
    <AccountingLayout
      title={t('accAccounts.nav.generalLedger')}
      subtitle={t('accAccounts.ledger.subtitle')}
      actions={
        <button className="portal-button secondary" onClick={handleExport} disabled={!filters.accountCode}>
          {t('accAccounts.common.exportCsv')}
        </button>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      <section className="accounting-card">
        <div className="accounting-toolbar">
          <select
            className="portal-input"
            value={filters.accountCode}
            onChange={(e) => setFilters({ ...filters, accountCode: e.target.value })}
            style={{ minWidth: 280 }}
          >
            <option value="">{t('accAccounts.ledger.chooseAccount')}</option>
            {accounts.map((a) => (
              <option key={a._id} value={a.code}>
                {a.code} — {a.label}
              </option>
            ))}
          </select>

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

          <label style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
            <input
              type="checkbox"
              checked={filters.includeOpening}
              onChange={(e) => setFilters({ ...filters, includeOpening: e.target.checked })}
            />{' '}
            {t('accAccounts.common.openingBalance')}
          </label>

          <button className="portal-button" onClick={runQuery}>
            {t('accAccounts.common.filter')}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accAccounts.common.loading')}</p>
        ) : !data ? (
          <div className="accounting-empty">
            {t('accAccounts.ledger.prompt')}
            <div className="hint">{t('accAccounts.ledger.promptHint')}</div>
          </div>
        ) : (
          <>
            <div className="accounting-kpi-grid" style={{ marginBottom: 20 }}>
              <div className="accounting-kpi">
                <div className="label">{t('accAccounts.col.account')}</div>
                <div className="value" style={{ fontSize: '1.1rem' }}>
                  <span className="code" style={{ color: 'rgba(14, 165, 233, 0.9)' }}>
                    {account?.code}
                  </span>
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'rgba(255,255,255,0.7)',
                      fontWeight: 500,
                      marginTop: 4,
                    }}
                  >
                    {account?.label}
                  </div>
                </div>
              </div>
              <div className="accounting-kpi">
                <div className="label">{t('accAccounts.ledger.classType')}</div>
                <div className="value" style={{ fontSize: '1.1rem' }}>
                  {t('accAccounts.accounts.classN', { n: account?.class ?? '' })}
                  <div
                    style={{
                      fontSize: '0.85rem',
                      color: 'rgba(255,255,255,0.7)',
                      fontWeight: 500,
                      marginTop: 4,
                    }}
                  >
                    {account?.type}
                  </div>
                </div>
              </div>
              <div className="accounting-kpi">
                <div className="label">{t('accAccounts.accounts.reconcilable')}</div>
                <div className="value">{account?.isLettrable ? t('common.yes') : t('common.no')}</div>
              </div>
              {filters.includeOpening && (
                <div className="accounting-kpi">
                  <div className="label">{t('accAccounts.common.openingBalance')}</div>
                  <div className="value">{formatEur(opening || 0)}</div>
                </div>
              )}
            </div>

            {movements.length === 0 ? (
              <div className="accounting-empty">{t('accAccounts.ledger.noMovements')}</div>
            ) : (
              <table className="accounting-table">
                <thead>
                  <tr>
                    <th>{t('accAccounts.col.date')}</th>
                    <th>{t('accAccounts.col.journal')}</th>
                    <th>{t('accAccounts.ledger.colEntryNumber')}</th>
                    <th>{t('accAccounts.col.piece')}</th>
                    <th>{t('accAccounts.col.label')}</th>
                    <th className="amount">{t('accAccounts.col.debit')}</th>
                    <th className="amount">{t('accAccounts.col.credit')}</th>
                    <th className="amount">{t('accAccounts.col.balance')}</th>
                    <th>{t('accAccounts.col.reconciliation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m._id}>
                      <td>{formatDate(m.date)}</td>
                      <td className="code">{m.journalCode}</td>
                      <td>
                        <Link to={`/admin/comptabilite/ecritures/${m._id}`} className="code">
                          {m.entryNumber}
                        </Link>
                      </td>
                      <td className="code">{m.pieceRef || '—'}</td>
                      <td>{m.label}</td>
                      <td className="amount">{Number(m.debit) > 0 ? formatEur(m.debit) : ''}</td>
                      <td className="amount">{Number(m.credit) > 0 ? formatEur(m.credit) : ''}</td>
                      <td className="amount" style={{ fontWeight: 600 }}>
                        {formatEur(m.runningBalance)}
                      </td>
                      <td className="code">{m.lettrage || '—'}</td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot>
                    <tr style={{ borderTop: '2px solid rgba(14, 165, 233, 0.4)' }}>
                      <td colSpan={5} style={{ textAlign: 'right', fontWeight: 600, padding: '14px' }}>
                        {t('accAccounts.entry.totals')}
                      </td>
                      <td className="amount" style={{ fontWeight: 700 }}>
                        {formatEur(totals.debit)}
                      </td>
                      <td className="amount" style={{ fontWeight: 700 }}>
                        {formatEur(totals.credit)}
                      </td>
                      <td className="amount" style={{ fontWeight: 700, color: '#4ade80' }}>
                        {formatEur(totals.closingBalance)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </>
        )}
      </section>
    </AccountingLayout>
  )
}

export default GeneralLedger
