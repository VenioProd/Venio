import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer,
  LineChart,
  Line,
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
  Wallet,
  FolderKanban,
  Users,
  MessageSquare,
  CheckSquare,
  Zap,
  TrendingUp,
  Plus,
  ShieldCheck,
  Receipt,
  GitBranch,
} from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { SkeletonRow } from '../../components/Skeleton'
import { DashKpiCard, DashAlertBanner, DashSection } from '../../components/dashboard'
import type { AlertItem } from '../../components/dashboard'
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
}

const PRIORITY_COLORS: Record<string, string> = {
  BASSE: '#64748b',
  NORMALE: '#0ea5e9',
  HAUTE: '#f59e0b',
  URGENTE: '#ef4444',
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
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch<SuperDashboard>('/api/admin/dashboard/super')
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
  }, [refresh])

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

  const handleDecision = async (id: string, action: 'approve' | 'reject') => {
    const comment = action === 'reject' ? window.prompt('Motif du rejet (optionnel) :') || '' : ''
    setDecidingId(id)
    try {
      await apiFetch(`/api/admin/decisions/${id}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ comment }),
      })
      setRefresh((r) => r + 1)
    } catch (err) {
      window.alert((err as Error).message || 'Erreur')
    } finally {
      setDecidingId(null)
    }
  }

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

          {/* ─── Mon activité (compact) ─── */}
          <DashSection title="Mon activité" icon={<Zap size={16} />} action={{ label: 'Mon espace', to: '/admin/mon-espace' }}>
            <div className="dash-mine-row">
              <Link to="/admin/gestion?assignee=me" className="admin-stat-card dash-mine-row__item">
                <div className="admin-stat-label">Mes tâches</div>
                <div className="admin-stat-value">{data.mine.tasks}</div>
              </Link>
              <Link to="/admin/gestion?view=briefs" className="admin-stat-card dash-mine-row__item">
                <div className="admin-stat-label">Mes briefs</div>
                <div className="admin-stat-value">{data.mine.briefs}</div>
              </Link>
              <Link to="/admin/messages" className="admin-stat-card dash-mine-row__item">
                <div className="admin-stat-label">Messages non lus</div>
                <div className="admin-stat-value">{data.mine.pendingMessages}</div>
              </Link>
            </div>
          </DashSection>

          {/* ─── Décisions à valider ─── */}
          <DashSection
            title="Décisions à valider"
            icon={<CheckSquare size={16} />}
            subtitle={data.decisions.pendingCount > 0 ? `${data.decisions.pendingCount} en attente` : 'aucune'}
          >
            {data.decisions.pending.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                Aucune décision en attente. Les membres peuvent soumettre une décision via leur espace.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.decisions.pending.map((d) => (
                  <div key={d._id} className="dash-decision-card">
                    <span
                      className="dash-decision-card__priority"
                      style={{ background: PRIORITY_COLORS[d.priority] || '#64748b' }}
                    />
                    <div className="dash-decision-card__body">
                      <div className="dash-decision-card__head">
                        <strong style={{ fontSize: 14 }}>{d.title}</strong>
                        <span className="admin-badge">{d.category}</span>
                      </div>
                      <p className="dash-decision-card__desc">
                        {d.description.length > 200 ? d.description.slice(0, 200) + '…' : d.description}
                      </p>
                      <div className="dash-decision-card__meta">
                        <span>Soumis par <strong>{d.submittedByName}</strong></span>
                        <span>{new Date(d.createdAt).toLocaleDateString('fr-FR')}</span>
                        {d.deadline && (
                          <span style={{ color: new Date(d.deadline) < new Date() ? '#ef4444' : undefined }}>
                            Échéance : {new Date(d.deadline).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="dash-decision-card__actions">
                      <button
                        type="button"
                        className="portal-button"
                        style={{ background: '#10b981', borderColor: '#10b981', padding: '6px 12px', fontSize: 12 }}
                        disabled={decidingId === d._id}
                        onClick={() => handleDecision(d._id, 'approve')}
                      >
                        Valider
                      </button>
                      <button
                        type="button"
                        className="portal-button secondary"
                        style={{ padding: '6px 12px', fontSize: 12, color: '#ef4444', borderColor: '#ef4444' }}
                        disabled={decidingId === d._id}
                        onClick={() => handleDecision(d._id, 'reject')}
                      >
                        Rejeter
                      </button>
                    </div>
                  </div>
                ))}
                {data.decisions.pendingCount > data.decisions.pending.length && (
                  <Link to="/admin/decisions" style={{ color: '#0ea5e9', fontSize: 13, alignSelf: 'flex-end' }}>
                    Voir toutes ({data.decisions.pendingCount}) →
                  </Link>
                )}
              </div>
            )}
          </DashSection>

          {/* ─── Messages en attente ─── */}
          {data.messages.unreadCount > 0 && (
            <DashSection
              title="Messages en attente"
              icon={<MessageSquare size={16} />}
              subtitle={`${data.messages.unreadCount} conversation${data.messages.unreadCount > 1 ? 's' : ''} non lue${data.messages.unreadCount > 1 ? 's' : ''}`}
              action={{ label: 'Ouvrir messagerie', to: '/admin/messages' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.messages.unreadConversations.map((c) => (
                  <Link
                    key={c._id}
                    to="/admin/messages"
                    className="dash-task-item"
                    style={{ textDecoration: 'none' }}
                  >
                    <span
                      className="dash-task-priority"
                      style={{ background: c.type === 'DM' ? '#8b5cf6' : c.type === 'CHANNEL' ? '#0ea5e9' : '#10b981' }}
                    />
                    <div className="dash-task-info">
                      <span className="dash-task-title">{c.name || (c.type === 'DM' ? 'Message direct' : 'Conversation')}</span>
                      <span className="dash-task-project">{c.type}</span>
                    </div>
                    <span className="dash-task-due">
                      {new Date(c.lastMessageAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </Link>
                ))}
              </div>
            </DashSection>
          )}

          {/* ─── Business ─── */}
          <DashSection title="Business" icon={<Wallet size={16} />}>
            <div className="admin-stats-grid">
              <DashKpiCard
                label="CA facturé (mois)"
                value={formatEUR(data.business.monthlyInvoiced)}
                accentColor="#ff0080"
                accentRgb="255, 0, 128"
              />
              <DashKpiCard
                label="Pipeline CRM"
                value={formatEUR(data.business.pipelineTotal)}
                accentColor="#8b5cf6"
                accentRgb="139, 92, 246"
                hint="Tous leads ouverts"
                to="/admin/crm"
              />
              <DashKpiCard
                label="Leads chauds"
                value={data.business.hotLeads}
                accentColor="#f59e0b"
                accentRgb="245, 158, 11"
                icon={<TrendingUp size={14} />}
                to="/admin/crm"
              />
              <DashKpiCard
                label="Comptabilité"
                value="→"
                accentColor="#22c55e"
                accentRgb="34, 197, 94"
                icon={<Receipt size={14} />}
                to="/admin/comptabilite"
              />
            </div>
            {trendData.length > 0 && (
              <div className="dash-chart-legacy">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => formatEUR(v as number)} />
                    <Tooltip
                      contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6 }}
                      formatter={(v) => formatEUR(Number(v) || 0)}
                    />
                    <Line type="monotone" dataKey="ca" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} name="CA facturé" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </DashSection>

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
