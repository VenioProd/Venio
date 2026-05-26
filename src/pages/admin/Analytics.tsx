import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'
import '../../styles/analytics.css'

interface AnalyticsData {
  projectsByStatus: Record<string, number>
  projectsByPriority: Record<string, number>
  tasksByStatus: Record<string, number>
  tasksByPriority: Record<string, number>
  totalRevenue: number
  monthlyRevenue: number
  lastMonthRevenue: number
  totalBudget: number
  clientCount: number
  activeClientCount: number
  projectsPerMonth: { _id: { year: number; month: number }; count: number }[]
  overdueTaskCount: number
  leadStats: { total: number; won: number; lost: number; active: number; pipelineValue: number }
}

const STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  TERMINE: 'Termine',
  A_FAIRE: 'A faire',
  EN_REVIEW: 'En review',
}

const PRIORITY_LABELS: Record<string, string> = {
  BASSE: 'Basse',
  NORMALE: 'Normale',
  HAUTE: 'Haute',
  URGENTE: 'Urgente',
}

const PRIORITY_COLORS: Record<string, string> = {
  BASSE: '#22c55e',
  NORMALE: '#0ea5e9',
  HAUTE: '#f59e0b',
  URGENTE: '#ef4444',
}

const STATUS_COLORS: Record<string, string> = {
  EN_COURS: '#6366f1',
  EN_ATTENTE: '#f59e0b',
  TERMINE: '#22c55e',
  A_FAIRE: '#94a3b8',
  EN_REVIEW: '#8b5cf6',
}

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']

function formatEur(n: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function BarChart({ data, labels, colors }: { data: Record<string, number>; labels: Record<string, string>; colors: Record<string, string> }) {
  const entries = Object.entries(data)
  const max = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div className="analytics-bar-chart">
      {entries.map(([key, val]) => (
        <div key={key} className="analytics-bar-row">
          <span className="analytics-bar-label">{labels[key] || key}</span>
          <div className="analytics-bar-track">
            <div
              className="analytics-bar-fill"
              style={{ width: `${(val / max) * 100}%`, background: colors[key] || '#6366f1' }}
            />
          </div>
          <span className="analytics-bar-value">{val}</span>
        </div>
      ))}
    </div>
  )
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch<AnalyticsData>('/api/admin/analytics')
        setData(res)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="portal-container">
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)' }}>Chargement des statistiques...</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="portal-container">
        <div className="admin-error">Erreur chargement des statistiques</div>
      </div>
    )
  }

  const totalProjects = Object.values(data.projectsByStatus).reduce((a, b) => a + b, 0)
  const totalTasks = Object.values(data.tasksByStatus).reduce((a, b) => a + b, 0)
  const revenueChange = data.lastMonthRevenue > 0 ? Math.round(((data.monthlyRevenue - data.lastMonthRevenue) / data.lastMonthRevenue) * 100) : 0
  const conversionRate = data.leadStats.total > 0 ? Math.round((data.leadStats.won / data.leadStats.total) * 100) : 0

  return (
    <div className="portal-container">
      <div className="portal-card">
        <div className="admin-breadcrumb">
          <Link to="/admin">Admin</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>Statistiques</span>
        </div>
        <div className="admin-header">
          <h1>Statistiques & Reporting</h1>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="analytics-kpis">
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">Projets</span>
          <span className="analytics-kpi-value">{totalProjects}</span>
          <span className="analytics-kpi-sub">{data.projectsByStatus['EN_COURS'] || 0} en cours</span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">Taches</span>
          <span className="analytics-kpi-value">{totalTasks}</span>
          <span className="analytics-kpi-sub" style={data.overdueTaskCount > 0 ? { color: '#ef4444' } : {}}>
            {data.overdueTaskCount} en retard
          </span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">CA Total</span>
          <span className="analytics-kpi-value">{formatEur(data.totalRevenue)}</span>
          <span className="analytics-kpi-sub">
            Ce mois: {formatEur(data.monthlyRevenue)}
            {revenueChange !== 0 && (
              <span style={{ color: revenueChange > 0 ? '#22c55e' : '#ef4444', marginLeft: 6 }}>
                {revenueChange > 0 ? '+' : ''}{revenueChange}%
              </span>
            )}
          </span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">Clients</span>
          <span className="analytics-kpi-value">{data.clientCount}</span>
          <span className="analytics-kpi-sub">{data.activeClientCount} actifs</span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">Leads</span>
          <span className="analytics-kpi-value">{data.leadStats.total}</span>
          <span className="analytics-kpi-sub">
            {data.leadStats.active} actifs | {conversionRate}% conversion
          </span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">Pipeline</span>
          <span className="analytics-kpi-value">{formatEur(data.leadStats.pipelineValue)}</span>
          <span className="analytics-kpi-sub">Budget total: {formatEur(data.totalBudget)}</span>
        </div>
      </div>

      {/* Charts */}
      <div className="analytics-charts">
        <div className="analytics-chart-card">
          <h3>Projets par statut</h3>
          <BarChart data={data.projectsByStatus} labels={STATUS_LABELS} colors={STATUS_COLORS} />
        </div>
        <div className="analytics-chart-card">
          <h3>Projets par priorite</h3>
          <BarChart data={data.projectsByPriority} labels={PRIORITY_LABELS} colors={PRIORITY_COLORS} />
        </div>
        <div className="analytics-chart-card">
          <h3>Taches par statut</h3>
          <BarChart data={data.tasksByStatus} labels={STATUS_LABELS} colors={STATUS_COLORS} />
        </div>
        <div className="analytics-chart-card">
          <h3>Taches par priorite</h3>
          <BarChart data={data.tasksByPriority} labels={PRIORITY_LABELS} colors={PRIORITY_COLORS} />
        </div>
      </div>

      {/* Projects per month */}
      {data.projectsPerMonth.length > 0 && (
        <div className="analytics-chart-card" style={{ marginTop: 24 }}>
          <h3>Projets crees par mois (6 derniers mois)</h3>
          <div className="analytics-month-chart">
            {data.projectsPerMonth.map((m) => {
              const max = Math.max(...data.projectsPerMonth.map((p) => p.count), 1)
              return (
                <div key={`${m._id.year}-${m._id.month}`} className="analytics-month-bar">
                  <div className="analytics-month-bar-inner" style={{ height: `${(m.count / max) * 100}%` }} />
                  <span className="analytics-month-label">{MONTH_LABELS[m._id.month - 1]}</span>
                  <span className="analytics-month-count">{m.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Lead funnel */}
      {data.leadStats.total > 0 && (
        <div className="analytics-chart-card" style={{ marginTop: 24 }}>
          <h3>Entonnoir CRM</h3>
          <div className="analytics-funnel">
            <div className="analytics-funnel-item">
              <span className="analytics-funnel-label">Total leads</span>
              <div className="analytics-funnel-bar" style={{ width: '100%', background: 'rgba(99, 102, 241, 0.2)' }}>
                <span>{data.leadStats.total}</span>
              </div>
            </div>
            <div className="analytics-funnel-item">
              <span className="analytics-funnel-label">Actifs</span>
              <div
                className="analytics-funnel-bar"
                style={{ width: `${(data.leadStats.active / data.leadStats.total) * 100}%`, background: 'rgba(14, 165, 233, 0.2)' }}
              >
                <span>{data.leadStats.active}</span>
              </div>
            </div>
            <div className="analytics-funnel-item">
              <span className="analytics-funnel-label">Gagnes</span>
              <div
                className="analytics-funnel-bar"
                style={{ width: `${(data.leadStats.won / data.leadStats.total) * 100}%`, background: 'rgba(34, 197, 94, 0.2)' }}
              >
                <span>{data.leadStats.won}</span>
              </div>
            </div>
            <div className="analytics-funnel-item">
              <span className="analytics-funnel-label">Perdus</span>
              <div
                className="analytics-funnel-bar"
                style={{ width: `${(data.leadStats.lost / data.leadStats.total) * 100}%`, background: 'rgba(239, 68, 68, 0.2)' }}
              >
                <span>{data.leadStats.lost}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
