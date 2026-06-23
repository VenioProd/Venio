import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TooltipContentProps } from 'recharts'
import AccountingLayout from './AccountingLayout'
import { getAccountingDashboard, getAccountingSettings, listEntries } from '../../../services/accounting'
import type { IAccountingDashboard, IAccountingEntry, ICompanySettings, IDashboardKpi } from '../../../types/accounting'

// ---- Formatters ----
const EUR_COMPACT = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const EUR_DETAIL = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function formatEur(n: number | undefined | null): string {
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return EUR_COMPACT.format(num)
}

function formatEurDetail(n: number | undefined | null): string {
  const num = Number(n)
  if (!Number.isFinite(num)) return '—'
  return EUR_DETAIL.format(num)
}

function formatDateFr(iso: string | undefined | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR')
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
              setDashboardError(err?.message || 'Impossible de charger les indicateurs')
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
        const msg = err instanceof Error ? err.message : 'Erreur de chargement'
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
    <AccountingLayout title="Comptabilité" subtitle="Tableau de bord — indicateurs, écritures, accès rapide">
      {error && <div className="accounting-message error">{error}</div>}
      {dashboardError && <div className="accounting-message error">Indicateurs indisponibles : {dashboardError}</div>}

      {!loading && !isConfigured && (
        <div className="accounting-message info">
          Le module n'est pas encore paramétré. Commencez par{' '}
          <Link to="/admin/comptabilite/parametres" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
            renseigner les informations de la société
          </Link>{' '}
          et par initialiser le plan comptable.
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
            Exercice en cours
          </div>
          <div
            style={{
              fontSize: '1.1rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.95)',
            }}
          >
            {loading ? '…' : fiscalYear?.label || 'Aucun exercice défini'}
          </div>
          {fiscalYear && (
            <div style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
              du {formatDateFr(fiscalYear.startDate)} au {formatDateFr(fiscalYear.endDate)}
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
            Exercice
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
            <option value={fiscalYear?._id || ''}>{fiscalYear?.label || '— aucun —'}</option>
          </select>
        </div>
      </section>

      {/* ---- 2. KPI Grid ---- */}
      <div className="accounting-kpi-grid">
        <div className="accounting-kpi">
          <div className="label">CA du mois</div>
          <div className="value" style={{ color: COLOR_GREEN }}>
            {loading ? '…' : formatEur(kpi.revenueMonth)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>ce mois</div>
        </div>
        <div className="accounting-kpi">
          <div className="label">CA cumul exercice</div>
          <div className="value" style={{ color: COLOR_GREEN }}>
            {loading ? '…' : formatEur(kpi.revenueYTD)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            depuis le début d'exercice
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Charges du mois</div>
          <div className="value" style={{ color: COLOR_RED }}>
            {loading ? '…' : formatEur(kpi.expensesMonth)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>ce mois</div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Charges cumul</div>
          <div className="value">{loading ? '…' : formatEur(kpi.expensesYTD)}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            depuis le début d'exercice
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Créances clients</div>
          <div className="value" style={{ color: Number(kpi.receivables) > 0 ? COLOR_ORANGE : undefined }}>
            {loading ? '…' : formatEur(kpi.receivables)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
            en attente d'encaissement
          </div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Dettes fournisseurs</div>
          <div className="value">{loading ? '…' : formatEur(kpi.payables)}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>à régler</div>
        </div>
        <div className="accounting-kpi">
          <div className="label">TVA à payer</div>
          <div className="value" style={{ color: Number(kpi.vatToPay) > 0 ? COLOR_RED : undefined }}>
            {loading ? '…' : formatEur(kpi.vatToPay)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>solde de TVA</div>
        </div>
        <div className="accounting-kpi">
          <div className="label">Solde banque</div>
          <div className="value" style={{ color: COLOR_GREEN }}>
            {loading ? '…' : formatEur(kpi.bankBalance)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>comptes 512</div>
        </div>
      </div>

      {!loading && Number(kpi.draftEntriesCount) > 0 && (
        <div className="accounting-message info">
          <Link
            to="/admin/comptabilite/ecritures?status=DRAFT"
            style={{ color: 'var(--primary)', textDecoration: 'underline' }}
          >
            Vous avez {kpi.draftEntriesCount} écriture
            {kpi.draftEntriesCount > 1 ? 's' : ''} en brouillon à valider →
          </Link>
        </div>
      )}

      {/* ---- 3. Évolution mensuelle ---- */}
      <section className="accounting-card">
        <h2>Évolution mensuelle</h2>
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : chartData.length === 0 ? (
          <div className="accounting-empty">
            Aucune donnée à afficher pour le moment.
            <div className="hint">Les écritures validées alimenteront ce graphique.</div>
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
              <Bar dataKey="revenue" name="Produits" fill={COLOR_REVENUE} radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="expense" name="Charges" fill={COLOR_EXPENSE} radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Line
                type="monotone"
                dataKey="margin"
                name="Marge nette"
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
        <h2>Top comptes de produits</h2>
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : topRevenueAccounts.length === 0 ? (
          <div className="accounting-empty">Aucun produit comptabilisé sur l'exercice.</div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Libellé</th>
                <th className="amount">Montant</th>
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
        <h2>Dernières écritures</h2>
        {loading ? (
          <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
        ) : recent.length === 0 ? (
          <div className="accounting-empty">
            Aucune écriture pour le moment.
            <div className="hint">
              <Link to="/admin/comptabilite/ecritures/nouvelle" style={{ color: 'var(--primary)' }}>
                Créer une première écriture →
              </Link>
            </div>
          </div>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Date</th>
                <th>Journal</th>
                <th>Libellé</th>
                <th className="amount">Débit</th>
                <th className="amount">Crédit</th>
                <th>Statut</th>
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
                  <td>{formatDateFr(e.date)}</td>
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
        <h2>Accès rapide</h2>
        <div className="accounting-toolbar">
          <Link to="/admin/comptabilite/ecritures/nouvelle" className="portal-button">
            ✚ Nouvelle écriture
          </Link>
          <Link to="/admin/comptabilite/plan-comptable" className="portal-button secondary">
            Plan comptable
          </Link>
          <Link to="/admin/comptabilite/journaux" className="portal-button secondary">
            Journaux
          </Link>
          <Link to="/admin/comptabilite/parametres" className="portal-button secondary">
            Paramètres société
          </Link>
        </div>
      </section>
    </AccountingLayout>
  )
}

export default AccountingDashboard
