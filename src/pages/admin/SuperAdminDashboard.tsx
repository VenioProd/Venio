import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FolderKanban, Users, TrendingUp, Plus, ShieldCheck, Receipt, GitBranch } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { translate, type MessageKey } from '../../i18n'
import { formatDate, formatMoney, formatTime } from '../../i18n/format'
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

const PROJECT_STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  EN_COURS: 'adminOps.superDash.statusInProgress',
  EN_ATTENTE: 'adminOps.superDash.statusPending',
  TERMINE: 'adminOps.superDash.statusDone',
}

const formatEUR = (n: number) =>
  n >= 1000
    ? translate('adminOps.superDash.thousands', { value: (n / 1000).toFixed(1) })
    : formatMoney(n, 'EUR', { maximumFractionDigits: 0 })

const formatMonth = (y: number, m: number) => formatDate(new Date(y, m - 1, 1), { month: 'short' })

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
  const { t } = useI18n()
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
        label: t('adminOps.superDash.alertBriefsP1'),
        count: data.alerts.overdueBriefsP1,
        severity: 'critical',
        to: '/admin/gestion?view=briefs',
      },
      {
        label: t('adminOps.superDash.alertTasks'),
        count: data.alerts.overdueTasks,
        severity: 'serious',
        to: '/admin/gestion',
      },
      {
        label: t('adminOps.superDash.alertCrm'),
        count: data.alerts.overdueLeads,
        severity: 'serious',
        to: '/admin/crm',
      },
      {
        label: t('adminOps.superDash.alertColdLeads'),
        count: data.alerts.coldLeads,
        severity: 'warning',
        to: '/admin/crm',
      },
      {
        label: t('adminOps.superDash.alertStaleProjects'),
        count: data.alerts.staleProjects,
        severity: 'warning',
        to: '/admin/gestion',
      },
    ]
  }, [data, t])

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
      label: PROJECT_STATUS_LABEL_KEYS[status] ? t(PROJECT_STATUS_LABEL_KEYS[status]) : status,
      count,
      color: PROJECT_STATUS_COLORS[status] || STATUS.neutral,
    }))
  }, [data, t])

  // ─── Charge par admin : barres horizontales (magnitude = tâches ouvertes) ───
  const teamLoadItems = useMemo(() => {
    if (!data) return []
    return data.team.load.map((m) => ({
      key: m._id,
      label: m.name?.split(' ')[0] || m.email,
      value: m.total,
      hint: m.overdue > 0 ? t('adminOps.superDash.overdueHint', { count: m.overdue }) : undefined,
    }))
  }, [data, t])

  return (
    <div className="portal-container">
      <div className="admin-page-header">
        <div>
          <h1>{t('adminOps.superDash.title')}</h1>
          <p className="admin-page-subtitle">
            {t('adminOps.superDash.subtitle', {
              user: user?.name || user?.email || '',
              time: data ? formatTime(data.generatedAt) : '',
            })}
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
            {t('adminOps.superDash.refresh')}
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
              label={t('adminOps.superDash.kpiRevenueMonth')}
              value={formatEUR(data.kpis.ca.value)}
              accentColor={ACCENT}
              accentRgb={ACCENT_RGB}
              delta={data.kpis.ca.delta}
              objective={data.kpis.ca.objective}
              sparkline={caSparkline}
            />
            <DashKpiCard
              label={t('adminOps.superDash.kpiPipeline')}
              value={formatEUR(data.kpis.pipeline.value)}
              accentColor={ACCENT}
              accentRgb={ACCENT_RGB}
              delta={data.kpis.pipeline.delta}
              to="/admin/crm"
            />
            <DashKpiCard
              label={t('adminOps.superDash.kpiHotLeads')}
              value={data.kpis.hotLeads.value}
              accentColor={STATUS.warning}
              accentRgb={WARNING_RGB}
              to="/admin/crm"
            />
            <DashKpiCard
              label={t('adminOps.superDash.kpiActiveProjects')}
              value={data.kpis.activeProjects.value}
              accentColor={STATUS.good}
              accentRgb={GOOD_RGB}
            />
          </div>

          {/* ─── 2. Chiffre d'affaires ─── */}
          <DashSection title={t('adminOps.superDash.revenueTitle')} icon={<TrendingUp size={16} />}>
            {revenueTrendSeries.length > 0 ? (
              <FinancialChart
                data={revenueTrendSeries.map((t) => ({ ts: t.month, value: t.ca }))}
                label={t('adminOps.superDash.revenueChartLabel')}
                currentValue={formatEUR(data.kpis.ca.value)}
              />
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t('adminOps.superDash.noBillingData')}</p>
            )}
          </DashSection>

          {/* ─── 3. Attention requise ─── */}
          <DashSection title={t('adminOps.superDash.attentionTitle')} icon={<AlertTriangle size={16} />}>
            <AttentionPanel items={attentionItems} />
          </DashSection>

          {/* ─── Inbox + Pulse (2-colonnes) ─── */}
          <TwoColumnGrid
            left={<InboxStream />}
            right={
              <DashSection title={t('adminOps.superDash.pulseTitle')} icon={<TrendingUp size={16} />}>
                <PulseStatus checks={data.pulseChecks} />
              </DashSection>
            }
          />

          {/* ─── 4 & Opérations ─── */}
          <DashSection title={t('adminOps.superDash.operationsTitle')} icon={<FolderKanban size={16} />}>
            <div className="dash-twocol-grid">
              <div className="dash-subcard">
                <h3 className="dash-subcard__title">
                  {t('adminOps.superDash.projectsByStatus', { count: data.operations.activeProjects })}
                </h3>
                <StackedStatusBar segments={projectStatusSegments} />
              </div>
              <div className="dash-subcard">
                <h3 className="dash-subcard__title">{t('adminOps.superDash.briefsByPriority')}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(['P1', 'P2', 'P3'] as const).map((p) => {
                    const count = data.operations.briefsByPriority[p] || 0
                    const color = p === 'P1' ? 'var(--critical)' : p === 'P2' ? 'var(--warning)' : 'var(--text-muted)'
                    return (
                      <div key={p} className="dash-brief-row">
                        <span style={{ fontSize: 13 }}>
                          <strong style={{ color }}>{p}</strong> —{' '}
                          {p === 'P1'
                            ? t('adminOps.superDash.briefUrgent')
                            : p === 'P2'
                              ? t('adminOps.superDash.briefImportant')
                              : t('adminOps.superDash.briefNormal')}
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
          <DashSection title={t('adminOps.superDash.teamTitle')} icon={<Users size={16} />}>
            <div className="admin-stats-grid" style={{ marginBottom: 16 }}>
              <DashKpiCard
                label={t('adminOps.superDash.clients')}
                value={data.team.clients}
                accentColor={ACCENT}
                accentRgb={ACCENT_RGB}
                to="/admin/comptes-clients"
              />
              <DashKpiCard
                label={t('adminOps.superDash.admins')}
                value={data.team.admins}
                accentColor={ACCENT}
                accentRgb={ACCENT_RGB}
                to="/admin/comptes-admin"
                icon={<ShieldCheck size={14} />}
              />
              <DashKpiCard
                label={t('adminOps.superDash.interns')}
                value={data.team.interns}
                accentColor={STATUS.warning}
                accentRgb={WARNING_RGB}
                to="/admin/stagiaires"
              />
            </div>
            {teamLoadItems.length > 0 && (
              <div className="dash-subcard">
                <h3 className="dash-subcard__title">{t('adminOps.superDash.teamLoad')}</h3>
                <HorizontalBarList items={teamLoadItems} color={ACCENT} />
              </div>
            )}
          </DashSection>

          {/* ─── Raccourcis ─── */}
          <DashSection title={t('adminOps.superDash.shortcutsTitle')} icon={<Plus size={16} />}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Link to="/admin/comptes-clients/nouveau" className="portal-button">
                {t('adminOps.superDash.shortcutClient')}
              </Link>
              <Link to="/admin/projets/nouveau" className="portal-button secondary">
                {t('adminOps.superDash.shortcutProject')}
              </Link>
              <Link to="/admin/comptes-admin" className="portal-button secondary">
                {t('adminOps.superDash.shortcutAdmin')}
              </Link>
              <Link to="/admin/audit" className="portal-button secondary">
                {t('adminOps.superDash.shortcutAudit')}
              </Link>
              <Link to="/admin/dev" className="portal-button secondary">
                <GitBranch size={14} style={{ marginRight: 4 }} />
                {t('adminOps.superDash.shortcutDev')}
              </Link>
              <Link to="/admin/comptabilite" className="portal-button secondary">
                <Receipt size={14} style={{ marginRight: 4 }} />
                {t('adminOps.superDash.shortcutAccounting')}
              </Link>
            </div>
          </DashSection>
        </>
      ) : (
        <div style={{ marginTop: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <AlertTriangle size={32} style={{ opacity: 0.4 }} />
          <p>{t('adminOps.superDash.loadFailed')}</p>
        </div>
      )}
    </div>
  )
}

export default SuperAdminDashboard
