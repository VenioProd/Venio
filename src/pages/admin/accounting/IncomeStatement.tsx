import { Fragment, useEffect, useMemo, useState } from 'react'
import AccountingLayout from './AccountingLayout'
import { getIncomeStatement, listFiscalYears, downloadReportCsv } from '../../../services/accounting'
import type { IFiscalYear, IIncomeGroup, IIncomeLine, IIncomeStatementData } from '../../../types/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatMoney } from '../../../i18n/format'

function formatEur(n: unknown): string {
  const value = Number(n)
  if (!Number.isFinite(value)) return '—'
  return formatMoney(value)
}

function detailsByGroup(items: IIncomeLine[] | undefined): Map<string, IIncomeLine[]> {
  const map = new Map<string, IIncomeLine[]>()
  for (const it of items || []) {
    const code = String(it.code || '')
    const prefix = code.slice(0, 2)
    if (!map.has(prefix)) map.set(prefix, [])
    map.get(prefix)!.push(it)
  }
  return map
}

interface GroupSectionProps {
  title: string
  totalLabel: string
  groups?: IIncomeGroup[]
  total: number
  details: Map<string, IIncomeLine[]>
  color: string
}

const GroupSection = ({ title, totalLabel, groups, total, details, color }: GroupSectionProps) => {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  function toggle(g: string) {
    setExpanded((prev) => ({ ...prev, [g]: !prev[g] }))
  }

  return (
    <div>
      <h2
        style={{
          margin: '0 0 12px 0',
          fontSize: '1rem',
          textTransform: 'none',
          letterSpacing: 'normal',
          color,
        }}
      >
        {title}
      </h2>
      {!groups || groups.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('accAccounts.income.noLines')}</p>
      ) : (
        <div className="accounting-table-scroll">
          <table className="accounting-table">
            <tbody>
              {groups.map((g) => {
                const isOpen = !!expanded[g.group]
                const lines = details.get(g.group) || []
                const hasLines = lines.length > 0
                return (
                  <Fragment key={`grp-${g.group}`}>
                    <tr
                      style={{
                        background: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
                        cursor: hasLines ? 'pointer' : 'default',
                      }}
                      onClick={hasLines ? () => toggle(g.group) : undefined}
                    >
                      <td
                        style={{
                          padding: '8px 14px',
                          fontSize: '0.78rem',
                          textTransform: 'none',
                          letterSpacing: 'normal',
                          color: 'color-mix(in srgb, var(--primary) 85%, transparent)',
                          fontWeight: 600,
                        }}
                      >
                        {hasLines && (
                          <span style={{ marginRight: 6, display: 'inline-block', width: 12 }}>
                            {isOpen ? '▾' : '▸'}
                          </span>
                        )}
                        {g.group} — {g.label}
                      </td>
                      <td
                        className="amount"
                        style={{
                          padding: '8px 14px',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                        }}
                      >
                        {formatEur(g.amount)}
                      </td>
                    </tr>
                    {isOpen &&
                      lines.map((l) => (
                        <tr key={`l-${l.code}`}>
                          <td style={{ paddingLeft: 32 }}>
                            <span className="code" style={{ marginRight: 8 }}>
                              {l.code}
                            </span>
                            {l.label}
                          </td>
                          <td className="amount">{formatEur(l.amount)}</td>
                        </tr>
                      ))}
                  </Fragment>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid color-mix(in srgb, var(--primary) 40%, transparent)' }}>
                <td style={{ fontWeight: 700, padding: '14px' }}>{totalLabel}</td>
                <td className="amount" style={{ fontWeight: 700, color }}>
                  {formatEur(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

interface IncomeFilters {
  fiscalYear: string
  from: string
  to: string
}

const IncomeStatement = () => {
  const { t } = useI18n()
  const [fiscalYears, setFiscalYears] = useState<IFiscalYear[]>([])
  const [data, setData] = useState<IIncomeStatementData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [filters, setFilters] = useState<IncomeFilters>({
    fiscalYear: '',
    from: '',
    to: '',
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
      const result = await getIncomeStatement({
        fiscalYear: filters.fiscalYear || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
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
      await downloadReportCsv('income-statement', {
        fiscalYear: filters.fiscalYear || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : translate('common.error'))
    }
  }

  const chargesDetails = useMemo(() => detailsByGroup(data?.charges), [data])
  const produitsDetails = useMemo(() => detailsByGroup(data?.produits), [data])
  const result = Number(data?.result || 0)
  const isProfit = result >= 0

  return (
    <AccountingLayout
      title={t('accAccounts.income.title')}
      subtitle={t('accAccounts.income.subtitle')}
      actions={
        <button className="portal-button secondary" onClick={handleExport}>
          {t('accAccounts.common.exportCsv')}
        </button>
      }
    >
      {error && <div className="accounting-message error">{error}</div>}

      <section className="accounting-card">
        <div className="accounting-toolbar">
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
          <button className="portal-button" onClick={runQuery}>
            {t('accAccounts.common.filter')}
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t('accAccounts.common.loading')}</p>
        ) : !data ? (
          <div className="accounting-empty">{t('accAccounts.income.prompt')}</div>
        ) : (
          <>
            <div className="accounting-message info" style={{ marginBottom: 16 }}>
              {t('accAccounts.income.period')} <strong>{data.periodLabel || '—'}</strong>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
              }}
            >
              <GroupSection
                title={t('accAccounts.income.expenses')}
                totalLabel={t('accAccounts.income.totalExpenses')}
                groups={data.chargesByGroup}
                total={data.totalCharges}
                details={chargesDetails}
                color="var(--critical)"
              />
              <GroupSection
                title={t('accAccounts.income.revenue')}
                totalLabel={t('accAccounts.income.totalRevenue')}
                groups={data.produitsByGroup}
                total={data.totalProduits}
                details={produitsDetails}
                color="var(--good)"
              />
            </div>

            <div
              style={{
                marginTop: 24,
                padding: '24px',
                borderRadius: 'var(--r-lg)',
                background: isProfit
                  ? 'linear-gradient(135deg, color-mix(in srgb, var(--good) 12%, transparent) 0%, color-mix(in srgb, var(--good) 6%, transparent) 100%)'
                  : 'linear-gradient(135deg, color-mix(in srgb, var(--critical) 12%, transparent) 0%, color-mix(in srgb, var(--critical) 6%, transparent) 100%)',
                border: `1px solid ${isProfit ? 'color-mix(in srgb, var(--good) 40%, transparent)' : 'color-mix(in srgb, var(--critical) 40%, transparent)'}`,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  textTransform: 'none',
                  letterSpacing: 'normal',
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                {t('accAccounts.balanceSheet.fiscalResult')}
              </div>
              <div
                style={{
                  fontSize: '2.2rem',
                  fontWeight: 800,
                  color: isProfit ? 'var(--good)' : 'var(--critical)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {isProfit ? t('accAccounts.income.netProfit') : t('accAccounts.income.netLoss')}
                {isProfit ? '+' : ''}
                {formatEur(result)}
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: '0.9rem',
                  color: 'var(--text-secondary)',
                }}
              >
                {t('accAccounts.income.formula', {
                  revenue: formatEur(data.totalProduits),
                  expenses: formatEur(data.totalCharges),
                })}
              </div>
            </div>
          </>
        )}
      </section>
    </AccountingLayout>
  )
}

export default IncomeStatement
