import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FolderKanban, Users, TrendingUp, Plus, ShieldCheck, Receipt, GitBranch } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { SkeletonRow } from '../../components/Skeleton'
import {
  DashKpiCard,
  DashSection,
  InboxStream,
  TwoColumnGrid,
  PeriodSelector,
  AttentionPanel,
  StackedStatusBar,
  HorizontalBarList,
  type Period,
  type AttentionItem,
} from '../../components/dashboard'
import PulseStatus from '../../components/dashboard/PulseStatus'
import FinancialChart from '../../components/dashboard/FinancialChart'
import type { PulseCheck } from '../../components/dashboard/types'
import { ACCENT, STATUS, PROJECT_STATUS_COLORS } from '../../lib/chartColors'
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

const formatEUR = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k €` : `${n.toLocaleString('fr-FR')} €`)

const formatMonth = (y: number, m: number) => new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' })

/** hex (#rrggbb) → "r, g, b" — pour les variables CSS --dash-kpi-accent-rgb. */
const hexToRgbTriplet = (hex: string): string => {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

const ACCENT_RGB = hexToRgbTriplet(ACCENT)
const WARNING_RGB = hexToRgbTriplet(STATUS.warning)
const GOOD_RGB = hexToRgbTriplet(STATUS.good)

const SuperAdminDashboard = () => {
  const { user } = useAuth()
  const [data, setData] = useState<SuperDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [period, setPeriod] = useState<Period>(() => {
    try {
      return (localStorage.getItem('venio-admin-dashboard-period') as Period) || '30d'
    } catch {
      return '30d'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('venio-admin-dashboard-period', period)
    } catch {}
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

  // ─── Attention requise : alertes mappées vers un niveau de gravité ───
  const attentionItems: AttentionItem[] = useMemo(() => {
    if (!data) return []
    return [
      {
        label: 'Briefs P1 dépassés',
        count: data.alerts.overdueBriefsP1,
        severity: 'critical',
        to: '/admin/gestion?view=briefs',
      },
      { label: 'Tâches en retard', count: data.alerts.overdueTasks, severity: 'serious', to: '/admin/gestion' },
      { label: 'Actions CRM en retard', count: data.alerts.overdueLeads, severity: 'serious', to: '/admin/crm' },
      { label: 'Leads froids', count: data.alerts.coldLeads, severity: 'warning', to: '/admin/crm' },
      {
        label: 'Projets sans activité 14j+',
        count: data.alerts.staleProjects,
        severity: 'warning',
        to: '/admin/gestion',
      },
    ]
  }, [data])

  const revenueTrendSeries = useMemo(() => {
    if (!data) return []
    return data.business.revenueTrend.map((r) => ({
      month: formatMonth(r.year, r.month),
      ca: r.total,
    }))
  }, [data])

  const caSparkline = useMemo(() => data?.business.revenueTrend.map((r) => r.total) ?? [], [data])

  // ─── Projets par statut : segments de la barre empilée ───
  const projectStatusSegments = useMemo(() => {
    if (!data) return []
    return Object.entries(data.operations.projectsByStatus).map(([status, count]) => ({
      key: status,
      label: PROJECT_STATUS_LABELS[status] || status,
      count,
      color: PROJECT_STATUS_COLORS[status] || STATUS.neutral,
    }))
  }, [data])

  // ─── Charge par admin : barres horizontales (magnitude = tâches ouvertes) ───
  const teamLoadItems = useMemo(() => {
    if (!data) return []
    return data.team.load.map((m) => ({
      key: m._id,
      label: m.name?.split(' ')[0] || m.email,
      value: m.total,
      hint: m.overdue > 0 ? `${m.overdue} retard` : undefined,
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
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : data ? (
        <>
          {/* ─── 1. Rangée de KPI ─── */}
          <div className="dash-kpi-row" style={{ marginTop: 20 }}>
            <DashKpiCard
              label="CA · mois"
              value={formatEUR(data.kpis.ca.value)}
              accentColor={ACCENT}
              accentRgb={ACCENT_RGB}
              delta={data.kpis.ca.delta}
              objective={data.kpis.ca.objective}
              sparkline={caSparkline}
            />
            <DashKpiCard
              label="Pipeline"
              value={formatEUR(data.kpis.pipeline.value)}
              accentColor={ACCENT}
              accentRgb={ACCENT_RGB}
              delta={data.kpis.pipeline.delta}
              to="/admin/crm"
            />
            <DashKpiCard
              label="Leads chauds"
              value={data.kpis.hotLeads.value}
              accentColor={STATUS.warning}
              accentRgb={WARNING_RGB}
              to="/admin/crm"
            />
            <DashKpiCard
              label="Projets actifs"
              value={data.kpis.activeProjects.value}
              accentColor={STATUS.good}
              accentRgb={GOOD_RGB}
            />
          </div>

          {/* ─── 2. Chiffre d'affaires ─── */}
          <DashSection title="Chiffre d'affaires" icon={<TrendingUp size={16} />}>
            {revenueTrendSeries.length > 0 ? (
              <FinancialChart
                data={revenueTrendSeries.map((t) => ({ ts: t.month, value: t.ca }))}
                label="CA facturé · 6 mois"
                currentValue={formatEUR(data.kpis.ca.value)}
              />
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Aucune donnée de facturation</p>
            )}
          </DashSection>

          {/* ─── 3. Attention requise ─── */}
          <DashSection title="Attention requise" icon={<AlertTriangle size={16} />}>
            <AttentionPanel items={attentionItems} />
          </DashSection>

          {/* ─── Inbox + Pulse (2-colonnes) ─── */}
          <TwoColumnGrid
            left={<InboxStream />}
            right={
              <DashSection title="Pulse" icon={<TrendingUp size={16} />}>
                <PulseStatus checks={data.pulseChecks} />
              </DashSection>
            }
          />

          {/* ─── 4 & Opérations ─── */}
          <DashSection title="Opérations" icon={<FolderKanban size={16} />}>
            <div className="dash-twocol-grid">
              <div className="dash-subcard">
                <h3 className="dash-subcard__title">Projets par statut ({data.operations.activeProjects} actifs)</h3>
                <StackedStatusBar segments={projectStatusSegments} />
              </div>
              <div className="dash-subcard">
                <h3 className="dash-subcard__title">Briefs par priorité</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(['P1', 'P2', 'P3'] as const).map((p) => {
                    const count = data.operations.briefsByPriority[p] || 0
                    const color = p === 'P1' ? 'var(--critical)' : p === 'P2' ? 'var(--warning)' : 'var(--text-muted)'
                    return (
                      <div key={p} className="dash-brief-row">
                        <span style={{ fontSize: 13 }}>
                          <strong style={{ color }}>{p}</strong> —{' '}
                          {p === 'P1' ? 'Urgent' : p === 'P2' ? 'Important' : 'Normal'}
                        </span>
                        <strong style={{ color, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{count}</strong>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </DashSection>

          {/* ─── 5. Équipe / Charge par admin ─── */}
          <DashSection title="Équipe" icon={<Users size={16} />}>
            <div className="admin-stats-grid" style={{ marginBottom: 16 }}>
              <DashKpiCard
                label="Clients"
                value={data.team.clients}
                accentColor={ACCENT}
                accentRgb={ACCENT_RGB}
                to="/admin/comptes-clients"
              />
              <DashKpiCard
                label="Admins"
                value={data.team.admins}
                accentColor={ACCENT}
                accentRgb={ACCENT_RGB}
                to="/admin/comptes-admin"
                icon={<ShieldCheck size={14} />}
              />
              <DashKpiCard
                label="Stagiaires"
                value={data.team.interns}
                accentColor={STATUS.warning}
                accentRgb={WARNING_RGB}
                to="/admin/stagiaires"
              />
            </div>
            {teamLoadItems.length > 0 && (
              <div className="dash-subcard">
                <h3 className="dash-subcard__title">Charge par admin (tâches ouvertes)</h3>
                <HorizontalBarList items={teamLoadItems} color={ACCENT} />
              </div>
            )}
          </DashSection>

          {/* ─── Raccourcis ─── */}
          <DashSection title="Raccourcis" icon={<Plus size={16} />}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Link to="/admin/comptes-clients/nouveau" className="portal-button">
                + Client
              </Link>
              <Link to="/admin/projets/nouveau" className="portal-button secondary">
                + Projet
              </Link>
              <Link to="/admin/comptes-admin" className="portal-button secondary">
                + Admin
              </Link>
              <Link to="/admin/audit" className="portal-button secondary">
                Audit
              </Link>
              <Link to="/admin/dev" className="portal-button secondary">
                <GitBranch size={14} style={{ marginRight: 4 }} />
                Dev workspace
              </Link>
              <Link to="/admin/comptabilite" className="portal-button secondary">
                <Receipt size={14} style={{ marginRight: 4 }} />
                Comptabilité
              </Link>
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
