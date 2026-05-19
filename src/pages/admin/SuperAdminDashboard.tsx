import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  AlertTriangle,
  FolderKanban,
  Users,
  TrendingUp,
  Plus,
  ShieldCheck,
  Receipt,
  GitBranch,
} from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { SkeletonRow } from '../../components/Skeleton'
import { DashKpiCard, DashAlertBanner, DashSection, InboxStream, TwoColumnGrid, PeriodSelector, type Period } from '../../components/dashboard'
import type { AlertItem } from '../../components/dashboard'
import PulseStatus from '../../components/dashboard/PulseStatus'
import KpiGrid2x2 from '../../components/dashboard/KpiGrid2x2'
import FinancialChart from '../../components/dashboard/FinancialChart'
import type { PulseCheck } from '../../components/dashboard/types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

interface SuperDashboard {
  generatedAt: string
  alerts: {
    overdueTasks: number
    coldLeads: number
    overdueLeads: number
    staleProjects: number
    overdueBriefsP1: number
  }
  mine: {
    tasks: number
    briefs: number
    pendingMessages: number
  }
  messages: {
    unreadCount: number
    unreadConversations: Array<{
      _id: string
      type: 'CHANNEL' | 'DM' | 'GROUP'
      name: string
      lastMessageAt: string
    }>
  }
  decisions: {
    pendingCount: number
    pending: Array<{
      _id: string
      title: string
      description: string
      category: string
      priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
      deadline: string | null
      submittedByName: string
      submittedBy: { _id: string; name?: string; email?: string; avatarUrl?: string }
      createdAt: string
    }>
  }
  business: {
    monthlyInvoiced: number
    pipelineTotal: number
    hotLeads: number
    revenueTrend: Array<{ year: number; month: number; total: number }>
  }
  operations: {
    activeProjects: number
    archivedProjects: number
    projectsByStatus: Record<string, number>
    tasksByStatus: Record<string, number>
    briefsByPriority: Record<string, number>
  }
  team: {
    clients: number
    admins: number
    interns: number
    load: Array<{
      _id: string
      total: number
      overdue: number
      name: string
      email: string
      avatarUrl?: string
      role: string
    }>
  }
  // Phase 3 — new fields from Task 3.2
  pulseChecks: PulseCheck[]
  kpis: {
    ca: {
      value: number
      delta: { value: number; direction: 'up' | 'down' | 'flat' }
      objective: { current: number; target: number; label?: string }
    }
    pipeline: {
      value: number
      delta: { value: number; direction: 'up' | 'down' | 'flat' }
    }
    hotLeads: { value: number }
    activeProjects: { value: number }
  }
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  TERMINE: 'Terminé',
}

const STATUS_COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444', '#64748b']

const formatEUR = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k €` : `${n.toLocaleString('fr-FR')} €`

const formatMonth = (y: number, m: number) =>
  new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' })

const SuperAdminDashboard = () => {
  const { user } = useAuth()
  const [data, setData] = useState<SuperDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [period, setPeriod] = useState<Period>(() => {
    try { return (localStorage.getItem('venio-admin-dashboard-period') as Period) || '30d' } catch { return '30d' }
  })
  useEffect(() => {
    try { localStorage.setItem('venio-admin-dashboard-period', period) } catch {}
  }, [period])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch<SuperDashboard>(`/api/admin/dashboard/super?period=${period}`)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refresh, period])

  const alerts: AlertItem[] = useMemo(() => {
    if (!data) return []
    return [
      { label: 'Tâches en retard', count: data.alerts.overdueTasks, to: '/admin/gestion' },
      { label: 'Briefs P1 dépassés', count: data.alerts.overdueBriefsP1, to: '/admin/gestion?view=briefs' },
      { label: 'Actions CRM en retard', count: data.alerts.overdueLeads, to: '/admin/crm' },
      { label: 'Leads froids', count: data.alerts.coldLeads, to: '/admin/crm', tone: 'warning' },
      { label: 'Projets sans activité 14j+', count: data.alerts.staleProjects, to: '/admin/gestion', tone: 'warning' },
    ]
  }, [data])

  const trendData = useMemo(() => {
    if (!data) return []
    return data.business.revenueTrend.map((r) => ({
      month: formatMonth(r.year, r.month),
      ca: r.total,
    }))
  }, [data])

  const projectsPie = useMemo(() => {
    if (!data) return []
    return Object.entries(data.operations.projectsByStatus).map(([status, count]) => ({
      name: PROJECT_STATUS_LABELS[status] || status,
      value: count,
    }))
  }, [data])

  const teamLoadData = useMemo(() => {
    if (!data) return []
    return data.team.load.map((m) => ({
      name: m.name?.split(' ')[0] || m.email,
      Tâches: m.total - m.overdue,
      Retard: m.overdue,
    }))
  }, [data])

  return (
    <div className="portal-container">
      <div className="admin-page-header">
        <div>
          <h1>Pilotage Venio</h1>
          <p className="admin-page-subtitle">
            Vue super admin · {user?.name || user?.email} ·{' '}
            {data && new Date(data.generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="admin-quick-actions">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button
            type="button"
            className="portal-button secondary"
            onClick={() => setRefresh((r) => r + 1)}
            disabled={loading}
          >
            ↻ Rafraîchir
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : data ? (
        <>
          {/* ─── Alertes ─── */}
          <DashAlertBanner alerts={alerts} />

          {/* ─── Inbox + Analytics (2-column) ─── */}
          <TwoColumnGrid
            left={<InboxStream />}
            right={
              <DashSection title="Analytics" icon={<TrendingUp size={16} />}>
                <PulseStatus checks={data.pulseChecks} />
                <div style={{ marginTop: 12 }}>
                  <KpiGrid2x2 kpis={[
                    {
                      label: 'CA · mois',
                      value: formatEUR(data.kpis.ca.value),
                      accentColor: '#ff0080',
                      accentRgb: '255, 0, 128',
                      delta: data.kpis.ca.delta,
                      objective: data.kpis.ca.objective,
                    },
                    {
                      label: 'Pipeline',
                      value: formatEUR(data.kpis.pipeline.value),
                      accentColor: '#8b5cf6',
                      accentRgb: '139, 92, 246',
                      delta: data.kpis.pipeline.delta,
                      to: '/admin/crm',
                    },
                    {
                      label: 'Leads chauds',
                      value: data.kpis.hotLeads.value,
                      accentColor: '#f59e0b',
                      accentRgb: '245, 158, 11',
                      to: '/admin/crm',
                    },
                    {
                      label: 'Projets actifs',
                      value: data.kpis.activeProjects.value,
                      accentColor: '#22c55e',
                      accentRgb: '34, 197, 94',
                    },
                  ]} />
                </div>
                {trendData.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <FinancialChart
                      data={trendData.map((t) => ({ ts: t.month, value: t.ca }))}
                      label="CA + Volume · 6 mois"
                      currentValue={formatEUR(data.kpis.ca.value)}
                    />
                  </div>
                )}
              </DashSection>
            }
          />

          {/* ─── Opérations ─── */}
          <DashSection title="Opérations" icon={<FolderKanban size={16} />}>
            <div className="dash-twocol-grid">
              <div className="dash-subcard">
                <h3 className="dash-subcard__title">
                  Projets par statut ({data.operations.activeProjects} actifs)
                </h3>
                {projectsPie.length > 0 ? (
                  <div style={{ height: 200 }}>
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={projectsPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                          {projectsPie.map((_, i) => (
                            <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucun projet actif</p>
                )}
              </div>
              <div className="dash-subcard">
                <h3 className="dash-subcard__title">Briefs par priorité</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(['P1', 'P2', 'P3'] as const).map((p) => {
                    const count = data.operations.briefsByPriority[p] || 0
                    const color = p === 'P1' ? '#ef4444' : p === 'P2' ? '#f59e0b' : '#64748b'
                    return (
                      <div key={p} className="dash-brief-row">
                        <span style={{ fontSize: 13 }}>
                          <strong style={{ color }}>{p}</strong> — {p === 'P1' ? 'Urgent' : p === 'P2' ? 'Important' : 'Normal'}
                        </span>
                        <strong style={{ color, fontSize: 16 }}>{count}</strong>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </DashSection>

          {/* ─── Équipe ─── */}
          <DashSection title="Équipe" icon={<Users size={16} />}>
            <div className="admin-stats-grid" style={{ marginBottom: 16 }}>
              <DashKpiCard label="Clients" value={data.team.clients} accentColor="#ff0080" accentRgb="255, 0, 128" to="/admin/comptes-clients" />
              <DashKpiCard label="Admins" value={data.team.admins} accentColor="#8b5cf6" accentRgb="139, 92, 246" to="/admin/comptes-admin" icon={<ShieldCheck size={14} />} />
              <DashKpiCard label="Stagiaires" value={data.team.interns} accentColor="#f59e0b" accentRgb="245, 158, 11" to="/admin/stagiaires" />
            </div>
            {teamLoadData.length > 0 && (
              <div className="dash-subcard">
                <h3 className="dash-subcard__title">
                  Charge par admin (tâches ouvertes)
                </h3>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart data={teamLoadData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                      <YAxis stroke="#94a3b8" fontSize={11} />
                      <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)' }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Tâches" stackId="a" fill="#0ea5e9" />
                      <Bar dataKey="Retard" stackId="a" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </DashSection>

          {/* ─── Raccourcis ─── */}
          <DashSection title="Raccourcis" icon={<Plus size={16} />}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Link to="/admin/comptes-clients/nouveau" className="portal-button">+ Client</Link>
              <Link to="/admin/projets/nouveau" className="portal-button secondary">+ Projet</Link>
              <Link to="/admin/comptes-admin" className="portal-button secondary">+ Admin</Link>
              <Link to="/admin/audit" className="portal-button secondary">Audit</Link>
              <Link to="/admin/dev" className="portal-button secondary"><GitBranch size={14} style={{ marginRight: 4 }} />Dev workspace</Link>
              <Link to="/admin/comptabilite" className="portal-button secondary"><Receipt size={14} style={{ marginRight: 4 }} />Comptabilité</Link>
            </div>
          </DashSection>
        </>
      ) : (
        <div style={{ marginTop: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <AlertTriangle size={32} style={{ opacity: 0.4 }} />
          <p>Impossible de charger le dashboard.</p>
        </div>
      )}
    </div>
  )
}

export default SuperAdminDashboard
