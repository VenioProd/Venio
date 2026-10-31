import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import AccountingLayout from './AccountingLayout'
import { getAccountingDashboard, getAccountingSettings, listEntries } from '../../../services/accounting'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { formatDate, formatMoney } from '../../../i18n/format'
import type { IAccountingDashboard, IAccountingEntry, ICompanySettings, IDashboardKpi } from '../../../types/accounting'

// ---- Formatters ----
function formatEur(n: number | undefined | null): string {
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return formatMoney(num, 'EUR', { maximumFractionDigits: 0 })
}

function formatEurDetail(n: number | undefined | null): string {
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return formatMoney(num, 'EUR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ---- Theme constants — graphes en accent data-viz cyan (distinct de l'UI lime) ----
const COLOR_REVENUE = '#22d3ee'
const COLOR_EXPENSE = '#f87171'
const COLOR_MARGIN = '#0ea5e9'
const COLOR_GREEN = '#4ade80'
const COLOR_ORANGE = '#fbbf24'
const COLOR_RED = '#f87171'

const EMPTY_KPI: IDashboardKpi = {
  revenueMonth: 0,
  revenueYTD: 0,
  expensesMonth: 0,
  expensesYTD: 0,
  receivables: 0,
  payables: 0,
  vatToPay: 0,
  bankBalance: 0,
  draftEntriesCount: 0,
}

// ---- Recharts custom tooltip (EUR) ----
const ChartTooltip = (props: TooltipContentProps) => {
  const { active, payload, label } = props
  if (!active || !payload || payload.length === 0) return null
  return (
    <div
      style={{
        background: 'rgba(15, 15, 20, 0.95)',
        border: '1px solid rgba(14, 165, 233, 0.4)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: '0.82rem',
        color: 'rgba(255,255,255,0.92)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, color: 'rgba(255,255,255,0.95)' }}>{label}</div>
      {payload.map((p) => (
        <div
          key={String(p.dataKey)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            color: p.color,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{formatEurDetail(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

interface ChartPoint {
  label: string
  revenue: number
  expense: number
  margin: number
}

const AccountingDashboard = () => {
  const { t } = useI18n()
  const [settings, setSettings] = useState<ICompanySettings | null>(null)
  const [dashboard, setDashboard] = useState<IAccountingDashboard | null>(null)
  const [recent, setRecent] = useState<IAccountingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dashboardError, setDashboardError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [s, d, recentEntries] = await Promise.all([
          getAccountingSettings().catch(() => null),
          getAccountingDashboard().catch((err: Error) => {
            if (!cancelled) {
              setDashboardError(err?.message || translate('accAccounts.dashboard.kpiLoadFailed'))
            }
            return null
          }),
          listEntries({ limit: 8 }).catch(() => ({
            entries: [] as IAccountingEntry[],
            total: 0,
            page: 1,
            limit: 8,
          })),
        ])
        if (cancelled) return
        setSettings(s)
        setDashboard(d)
        setRecent(recentEntries.entries || [])
      } catch (err) {
        const msg = err instanceof Error ? err.message : translate('accAccounts.dashboard.loadFailed')
        if (!cancelled) setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const isConfigured = settings?.isConfigured
  const kpi: IDashboardKpi = dashboard?.kpi || EMPTY_KPI
  const fiscalYear = dashboard?.fiscalYear || null
  const monthlyRevenue = dashboard?.monthlyRevenue || []
  const topRevenueAccounts = dashboard?.topRevenueAccounts || []

  const chartData: ChartPoint[] = useMemo(() => {
    return monthlyRevenue.map((m) => ({
      label: m.label,
      revenue: Number(m.revenue) || 0,
      expense: Number(m.expense) || 0,
      margin: (Number(m.revenue) || 0) - (Number(m.expense) || 0),
    }))
  }, [monthlyRevenue])

  return (
    <AccountingLayout title={t('accAccounts.layout.title')} subtitle={t('accAccounts.dashboard.subtitle')}>
      {error && <div className="accounting-message error">{error}</div>}
      {dashboardError && (
        <div className="accounting-message error">
          {t('accAccounts.dashboard.kpiUnavailable', { message: dashboardError })}
        </div>
      )}

      {!loading && !isConfigured && (
        <div className="accounting-message info">
          {t('accAccounts.dashboard.notConfiguredIntro')}{' '}
          <Link to="/admin/comptabilite/parametres" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
            {t('accAccounts.dashboard.notConfiguredLink')}
          </Link>{' '}
          {t('accAccounts.dashboard.notConfiguredOutro')}
        </div>
      )}

      {/* ---- 1. Bandeau exercice ---- */}
      <section
        className="accounting-card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.74rem',
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: 4,
            }}
          >
            {t('accAccounts.dashboard.currentFiscalYear')}
          </div>
          <div
            style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.95)',
            }}
          >
            {loading ? '…' : fiscalYear?.label || t('accAccounts.dashboard.noFiscalYear')}
          </div>
          {fiscalYear && (
            <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
              {t('accAccounts.dashboard.fiscalYearRange', {
                start: formatDate(fiscalYear.startDate),
                end: formatDate(fiscalYear.endDate),
              })}
              {fiscalYear.code && (
                <span style={{ marginLeft: 10, fontFamily: 'SF Mono, Menlo, Consolas, monospace' }}>
                  · {fiscalYear.code}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label
            htmlFor="fiscal-year-select"
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'rgba(255,255,255,0.5)',
            }}
          >
            {t('accAccounts.dashboard.fiscalYearLabel')}
          </label>
          <select
            id="fiscal-year-select"
            disabled
            value={fiscalYear?._id || ''}
            style={{
              background: 'rgba(15,15,20,0.7)',
              border: '1px solid rgba(14, 165, 233, 0.25)',
              borderRadius: 8,
              color: 'rgba(255,255,255,0.85)',
              padding: '8px 12px',
              fontSize: '0.88rem',
              opacity: 0.8,
              cursor: 'not-allowed',
            }}
            onChange={() => undefined}
          >
            <option value={fiscalYear?._id || ''}>{fiscalYear?.label || t('accAccounts.dashboard.noneOption')}</option>
          </select>
        </div>
      </section>

      {/* ---- 2. KPI Grid ---- */}
      <div className="accounting-kpi-grid">
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.dashboard.kpiRevenueMonth')}</div>
          <div className="value" style={{ color: COLOR_GREEN }}>
            {loading ? '…' : formatEur(kpi.revenueMonth)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {t('accAccounts.dashboard.kpiThisMonth')}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.dashboard.kpiRevenueYtd')}</div>
          <div className="value" style={{ color: COLOR_GREEN }}>
            {loading ? '…' : formatEur(kpi.revenueYTD)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {t('accAccounts.dashboard.kpiSinceYearStart')}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.dashboard.kpiExpensesMonth')}</div>
          <div className="value" style={{ color: COLOR_RED }}>
            {loading ? '…' : formatEur(kpi.expensesMonth)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {t('accAccounts.dashboard.kpiThisMonth')}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.dashboard.kpiExpensesYtd')}</div>
          <div className="value">{loading ? '…' : formatEur(kpi.expensesYTD)}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {t('accAccounts.dashboard.kpiSinceYearStart')}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.dashboard.kpiReceivables')}</div>
          <div className="value" style={{ color: Number(kpi.receivables) > 0 ? COLOR_ORANGE : undefined }}>
            {loading ? '…' : formatEur(kpi.receivables)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {t('accAccounts.dashboard.kpiAwaitingPayment')}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.dashboard.kpiPayables')}</div>
          <div className="value">{loading ? '…' : formatEur(kpi.payables)}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {t('accAccounts.dashboard.kpiToPay')}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.dashboard.kpiVat')}</div>
          <div className="value" style={{ color: Number(kpi.vatToPay) > 0 ? COLOR_RED : undefined }}>
            {loading ? '…' : formatEur(kpi.vatToPay)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {t('accAccounts.dashboard.kpiVatBalance')}
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">{t('accAccounts.dashboard.kpiBank')}</div>
          <div className="value" style={{ color: COLOR_GREEN }}>
            {loading ? '…' : formatEur(kpi.bankBalance)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            {t('accAccounts.dashboard.kpiBankAccounts')}
          </div>
        </div>
      </div>

      {!loading && Number(kpi.draftEntriesCount) > 0 && (
        <div className="accounting-message info">
          <Link
            to="/admin/comptabilite/ecritures?status=DRAFT"
            style={{ color: 'var(--primary)', textDecoration: 'underline' }}
          >
            {t('accAccounts.dashboard.draftsToValidate', { count: Number(kpi.draftEntriesCount) })}
          </Link>
        </div>
      )}

      {/* ---- 3. Évolution mensuelle ---- */}
      <section className="accounting-card">
        <h2>{t('accAccounts.dashboard.monthlyTrend')}</h2>
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accAccounts.dashboard.loading')}</p>
        ) : chartData.length === 0 ? (
          <div className="accounting-empty">
            {t('accAccounts.dashboard.noChartData')}
            <div className="hint">{t('accAccounts.dashboard.noChartDataHint')}</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                stroke="rgba(255,255,255,0.45)"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
              />
              <YAxis
                stroke="rgba(255,255,255,0.45)"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.15)' }}
                tickFormatter={(v: number) => formatEur(v)}
                width={80}
              />
              <Tooltip content={(props) => <ChartTooltip {...props} />} cursor={{ fill: 'rgba(14, 165, 233, 0.06)' }} />
              <Legend
                verticalAlign="bottom"
                wrapperStyle={{
                  paddingTop: 16,
                  fontSize: '0.85rem',
                  color: 'rgba(255,255,255,0.7)',
                }}
              />
              <Bar
                dataKey="revenue"
                name={t('accAccounts.dashboard.seriesRevenue')}
                fill={COLOR_REVENUE}
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                dataKey="expense"
                name={t('accAccounts.dashboard.seriesExpenses')}
                fill={COLOR_EXPENSE}
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              />
              <Line
                type="monotone"
                dataKey="margin"
                name={t('accAccounts.dashboard.seriesMargin')}
                stroke={COLOR_MARGIN}
                strokeWidth={2.5}
                dot={{ r: 4, strokeWidth: 0, fill: COLOR_MARGIN }}
                activeDot={{ r: 6 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* ---- 4. Top comptes de produits ---- */}
      <section className="accounting-card">
        <h2>{t('accAccounts.dashboard.topRevenueAccounts')}</h2>
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accAccounts.dashboard.loading')}</p>
        ) : topRevenueAccounts.length === 0 ? (
          <div className="accounting-empty">{t('accAccounts.dashboard.noRevenue')}</div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>{t('accAccounts.col.code')}</th>
                <th>{t('accAccounts.col.label')}</th>
                <th className="amount">{t('accAccounts.col.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {topRevenueAccounts.map((acc) => (
                <tr key={acc.code}>
                  <td>
                    <Link
                      to={`/admin/comptabilite/grand-livre?accountCode=${encodeURIComponent(acc.code)}`}
                      className="code"
                    >
                      {acc.code}
                    </Link>
                  </td>
                  <td>{acc.label}</td>
                  <td className="amount">{formatEurDetail(acc.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---- 5. Dernières écritures ---- */}
      <section className="accounting-card">
        <h2>{t('accAccounts.dashboard.recentEntries')}</h2>
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accAccounts.dashboard.loading')}</p>
        ) : recent.length === 0 ? (
          <div className="accounting-empty">
            {t('accAccounts.dashboard.noEntries')}
            <div className="hint">
              <Link to="/admin/comptabilite/ecritures/nouvelle" style={{ color: 'var(--primary)' }}>
                {t('accAccounts.dashboard.createFirstEntry')}
              </Link>
            </div>
          </div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>{t('accAccounts.col.number')}</th>
                <th>{t('accAccounts.col.date')}</th>
                <th>{t('accAccounts.col.journal')}</th>
                <th>{t('accAccounts.col.label')}</th>
                <th className="amount">{t('accAccounts.col.debit')}</th>
                <th className="amount">{t('accAccounts.col.credit')}</th>
                <th>{t('accAccounts.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e._id}>
                  <td>
                    <Link to={`/admin/comptabilite/ecritures/${e._id}`} className="code">
                      {e.entryNumber}
                    </Link>
                  </td>
                  <td>{formatDate(e.date)}</td>
                  <td className="code">{e.journalCode}</td>
                  <td>{e.label}</td>
                  <td className="amount">{formatEurDetail(e.totalDebit)}</td>
                  <td className="amount">{formatEurDetail(e.totalCredit)}</td>
                  <td>
                    <span className={`accounting-badge ${e.status.toLowerCase()}`}>{e.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* ---- 6. Accès rapide ---- */}
      <section className="accounting-card">
        <h2>{t('accAccounts.dashboard.quickAccess')}</h2>
        <div className="accounting-toolbar">
          <Link to="/admin/comptabilite/ecritures/nouvelle" className="portal-button">
            {t('accAccounts.dashboard.newEntry')}
          </Link>
          <Link to="/admin/comptabilite/plan-comptable" className="portal-button secondary">
            {t('accAccounts.nav.chartOfAccounts')}
          </Link>
          <Link to="/admin/comptabilite/journaux" className="portal-button secondary">
            {t('accAccounts.nav.journals')}
          </Link>
          <Link to="/admin/comptabilite/parametres" className="portal-button secondary">
            {t('accAccounts.dashboard.companySettings')}
          </Link>
        </div>
      </section>
    </AccountingLayout>
  )
}

export default AccountingDashboard
