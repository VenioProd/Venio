import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FolderKanban,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../lib/permissions'
import { SkeletonRow } from '../../components/Skeleton'
import type { Project } from '../../types/project.types'
import type { Task } from '../../types/task.types'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

interface HotLead {
  _id: string
  company: string
  contactName: string
  status: string
  leadTemperature: string
  budget: number | null
}

interface DashBrief {
  _id: string
  intitule: string
  briefPriority: 'P1' | 'P2' | 'P3'
  statut: string
  deadline: string
  entity: string
  contexte?: string
  livrablesAttendus?: string
  project?: { _id: string; name: string }
}

interface InternalProjectSummary {
  _id: string
  name: string
  entity: string
  status: string
  poles: string[]
}

interface MissionSummary {
  _id: string
  title: string
  description: string
  status: string
  dueDate: string | null
  steps: { _id: string; title: string; done: boolean }[]
  internalProject: { _id: string; name: string; entity: string }
}

interface DashboardData {
  myTasks: (Task & { project?: { _id: string; name: string } })[]
  myBriefs: DashBrief[]
  overdueTasks: (Task & { project?: { _id: string; name: string } })[]
  tasksByStatus: Record<string, number>
  activeProjectCount: number
  totalRevenue: number
  pipelineValue: number
  pendingDecisionCount: number
  staleProjectCount: number
  hotLeads: HotLead[]
  recentProjects: (Project & { client?: { _id: string; name: string } })[]
  generatedAt: string
}

const TASK_STATUS_LABELS: Record<string, string> = {
  A_FAIRE: 'A faire',
  EN_COURS: 'En cours',
  EN_REVIEW: 'En review',
  TERMINE: 'Termine',
}

const PROJECT_STATUS_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  EN_ATTENTE: 'En attente',
  TERMINE: 'Termine',
}

const PRIORITY_COLORS: Record<string, string> = {
  BASSE: '#64748b',
  NORMALE: '#38bdf8',
  HAUTE: '#f59e0b',
  URGENTE: '#ef4444',
}

const BRIEF_PRIORITY_COLORS: Record<string, string> = {
  P1: '#ef4444',
  P2: '#f59e0b',
  P3: '#64748b',
}

const DASHBOARD_PREFS_KEY = 'venio-admin-command-dashboard-prefs-v1'

interface DashboardPrefs {
  density: 'comfortable' | 'compact'
  showContext: boolean
  showShortcuts: boolean
}

function readDashboardPrefs(): DashboardPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(DASHBOARD_PREFS_KEY) || '{}') as Partial<DashboardPrefs>
    return {
      density: stored.density === 'compact' ? 'compact' : 'comfortable',
      showContext: stored.showContext !== false,
      showShortcuts: stored.showShortcuts !== false,
    }
  } catch {
    return { density: 'comfortable', showContext: true, showShortcuts: true }
  }
}

function formatDate(d: string | null | undefined) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function formatMoney(value: number) {
  return `${Math.round(value || 0).toLocaleString('fr-FR')} EUR`
}

function isPast(date: string | null | undefined) {
  return Boolean(date && new Date(date) < new Date())
}

function Section({
  title,
  icon,
  action,
  children,
}: {
  title: string
  icon: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="admin-command-section">
      <div className="admin-command-section__header">
        <h2>
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Signal({
  label,
  count,
  to,
  tone = 'neutral',
}: {
  label: string
  count: number
  to: string
  tone?: 'danger' | 'warning' | 'neutral'
}) {
  return (
    <Link to={to} className={`admin-attention-signal ${tone}`}>
      <span>{label}</span>
      <strong>{count}</strong>
    </Link>
  )
}

function Kpi({
  label,
  value,
  to,
  tone = 'blue',
}: {
  label: string
  value: string | number
  to?: string
  tone?: 'blue' | 'green' | 'orange' | 'pink'
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
    </>
  )
  return to ? (
    <Link to={to} className={`admin-exec-kpi ${tone}`}>
      {content}
    </Link>
  ) : (
    <div className={`admin-exec-kpi ${tone}`}>{content}</div>
  )
}

function TaskLine({ task }: { task: Task & { project?: { _id: string; name: string } } }) {
  const color = PRIORITY_COLORS[task.priority] || '#38bdf8'
  return (
    <Link to={`/admin/projets/${task.project?._id || task.project}?tab=tasks`} className="admin-command-line">
      <span className="admin-command-dot" style={{ background: color }} />
      <span className="admin-command-line__main">
        <strong>{task.title}</strong>
        <small>{task.project?.name || 'Projet non renseigne'}</small>
      </span>
      <span className="admin-command-pill">{TASK_STATUS_LABELS[task.status] || task.status}</span>
      {task.dueDate && <time className={isPast(task.dueDate) ? 'danger' : ''}>{formatDate(task.dueDate)}</time>}
    </Link>
  )
}

function BriefLine({ brief }: { brief: DashBrief }) {
  const color = BRIEF_PRIORITY_COLORS[brief.briefPriority] || '#64748b'
  return (
    <Link to="/admin/gestion?view=briefs" className="admin-command-line">
      <span className="admin-command-dot" style={{ background: color }} />
      <span className="admin-command-line__main">
        <strong>{brief.intitule}</strong>
        <small>
          {brief.project?.name || brief.entity}
          {brief.entity !== 'VENIO' ? ` - ${brief.entity}` : ''}
        </small>
      </span>
      <span className="admin-command-pill">{brief.briefPriority}</span>
      <time className={isPast(brief.deadline) ? 'danger' : ''}>{formatDate(brief.deadline)}</time>
    </Link>
  )
}

function ProjectLine({ project }: { project: Project & { client?: { _id: string; name: string } } }) {
  const color = PRIORITY_COLORS[project.priority || 'NORMALE'] || '#38bdf8'
  return (
    <Link to={`/admin/projets/${project._id}`} className="admin-command-line">
      <span className="admin-command-dot" style={{ background: color }} />
      <span className="admin-command-line__main">
        <strong>{project.name}</strong>
        <small>{project.client?.name || project.responsible || 'Venio'}</small>
      </span>
      <span className="admin-command-pill">{PROJECT_STATUS_LABELS[project.status] || project.status}</span>
    </Link>
  )
}

function InternalProjectLine({ project }: { project: InternalProjectSummary }) {
  const tone = project.status === 'EN_COURS' ? '#22c55e' : project.status === 'EN_ATTENTE' ? '#f59e0b' : '#64748b'
  return (
    <Link to={`/admin/projets-internes/${project._id}`} className="admin-command-line">
      <span className="admin-command-dot" style={{ background: tone }} />
      <span className="admin-command-line__main">
        <strong>{project.name}</strong>
        <small>
          {project.entity}
          {project.poles.length > 0 ? ` - ${project.poles.join(', ')}` : ''}
        </small>
      </span>
      <span className="admin-command-pill">{PROJECT_STATUS_LABELS[project.status] || project.status}</span>
    </Link>
  )
}

function MissionLine({ mission }: { mission: MissionSummary }) {
  const done = mission.steps?.filter((step) => step.done).length || 0
  const total = mission.steps?.length || 0
  return (
    <Link to="/admin/gestion?view=missions" className="admin-command-line">
      <span className="admin-command-dot" style={{ background: mission.status === 'EN_COURS' ? '#38bdf8' : '#f59e0b' }} />
      <span className="admin-command-line__main">
        <strong>{mission.title}</strong>
        <small>
          {mission.internalProject?.name || 'Mission'}
          {total > 0 ? ` - ${done}/${total} etapes` : ''}
        </small>
      </span>
      {mission.dueDate && <time className={isPast(mission.dueDate) ? 'danger' : ''}>{formatDate(mission.dueDate)}</time>}
    </Link>
  )
}

export default function AdminDashboard() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)
  const [myInternalProjects, setMyInternalProjects] = useState<InternalProjectSummary[]>([])
  const [myMissions, setMyMissions] = useState<MissionSummary[]>([])
  const [customizeOpen, setCustomizeOpen] = useState(false)
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => readDashboardPrefs())

  const canManageClients = hasPermission(user, PERMISSIONS.MANAGE_CLIENTS)
  const canViewProjects = hasPermission(user, PERMISSIONS.VIEW_PROJECTS)
  const canEditProjects = hasPermission(user, PERMISSIONS.EDIT_PROJECTS)
  const canViewMessaging = hasPermission(user, PERMISSIONS.VIEW_MESSAGING)
  const isSuperAdmin = user?.role === 'SUPER_ADMIN'

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch<DashboardData>('/api/admin/dashboard')
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refresh])

  useEffect(() => {
    const userId = user?._id || ''
    apiFetch<{
      projects: (InternalProjectSummary & { members?: ({ _id: string } | string)[] })[]
    }>('/api/admin/internal-projects')
      .then((d) => {
        const mine = (d.projects || []).filter((p) =>
          p.members?.some((m) => (typeof m === 'string' ? m : m._id) === userId),
        )
        setMyInternalProjects(mine)
      })
      .catch(() => {})
    apiFetch<{ missions: MissionSummary[] }>('/api/admin/internal-projects/missions')
      .then((d) => setMyMissions(d.missions || []))
      .catch(() => {})
  }, [user?._id, refresh])

  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* ignore quota/private mode */
    }
  }, [prefs])

  const attention = useMemo(() => {
    if (!data) return null
    const p1Briefs = data.myBriefs.filter((brief) => brief.briefPriority === 'P1').length
    const total =
      data.overdueTasks.length + p1Briefs + data.pendingDecisionCount + data.hotLeads.length + data.staleProjectCount
    return { p1Briefs, total }
  }, [data])

  const nextMilestones = useMemo(() => {
    const tasks = data?.myTasks.filter((task) => task.dueDate).slice(0, 3) || []
    const missions = myMissions.filter((mission) => mission.dueDate && mission.status !== 'TERMINE').slice(0, 2)
    return { tasks, missions }
  }, [data?.myTasks, myMissions])

  return (
    <div className={`portal-container admin-command-dashboard ${prefs.density === 'compact' ? 'compact' : ''}`}>
      <div className="admin-command-header">
        <div>
          <span className="admin-command-eyebrow">Bureau Venio</span>
          <h1>Pilotage Venio</h1>
          <p>
            {user?.name || user?.email || 'Admin'} · donnees{' '}
            {data?.generatedAt
              ? new Date(data.generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
              : 'en cours'}
          </p>
        </div>
        <div className="admin-command-actions">
          <button className="portal-button secondary" onClick={() => setRefresh((r) => r + 1)} disabled={loading}>
            <RefreshCw size={14} />
            Rafraichir
          </button>
          <button className="portal-button secondary" onClick={() => setCustomizeOpen(true)}>
            <Settings2 size={14} />
            Personnaliser
          </button>
          {canEditProjects && (
            <Link className="portal-button" to="/admin/projets/nouveau">
              <Plus size={14} />
              Projet
            </Link>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="admin-command-loading">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : data ? (
        <>
          <div className={`admin-attention ${attention?.total ? 'active' : 'calm'}`}>
            <div>
              <span className="admin-attention__label">{attention?.total ? 'Attention requise' : 'Mode calme'}</span>
              <strong>
                {attention?.total
                  ? `${attention.total} signal${attention.total > 1 ? 's' : ''} a traiter`
                  : 'Aucun signal critique'}
              </strong>
            </div>
            <div className="admin-attention__signals">
              <Signal label="Taches en retard" count={data.overdueTasks.length} to="/admin/gestion" tone="danger" />
              <Signal label="Briefs P1" count={attention?.p1Briefs || 0} to="/admin/gestion?view=briefs" tone="danger" />
              <Signal label="Decisions" count={data.pendingDecisionCount} to="/admin/decisions" tone="warning" />
              <Signal label="Relances CRM" count={data.hotLeads.length} to="/admin/crm" tone="warning" />
              <Signal label="Projets dormants" count={data.staleProjectCount} to="/admin/projets" />
            </div>
          </div>

          <div className="admin-exec-grid">
            {isSuperAdmin && <Kpi label="CA facture" value={formatMoney(data.totalRevenue)} to="/admin/comptabilite" tone="green" />}
            <Kpi label="Pipeline" value={formatMoney(data.pipelineValue)} to="/admin/crm" tone="orange" />
            {canViewProjects && <Kpi label="Projets actifs" value={data.activeProjectCount} to="/admin/projets" tone="blue" />}
            <Kpi label="Taches ouvertes" value={data.myTasks.length} to="/admin/gestion" tone="pink" />
          </div>

          <div className="admin-command-layout">
            <div className="admin-command-main">
              <Section title="Actions personnelles" icon={<CheckCircle2 size={16} />}>
                <div className="admin-command-stack">
                  {data.myTasks.slice(0, 6).map((task) => (
                    <TaskLine key={task._id} task={task} />
                  ))}
                  {data.myBriefs.slice(0, 4).map((brief) => (
                    <BriefLine key={brief._id} brief={brief} />
                  ))}
                  {myMissions
                    .filter((mission) => mission.status !== 'TERMINE')
                    .slice(0, 4)
                    .map((mission) => (
                      <MissionLine key={mission._id} mission={mission} />
                    ))}
                  {data.myTasks.length === 0 && data.myBriefs.length === 0 && myMissions.length === 0 && (
                    <p className="admin-command-empty">Rien d'assigne pour le moment.</p>
                  )}
                </div>
              </Section>

              <Section
                title="Portefeuille Venio"
                icon={<FolderKanban size={16} />}
                action={<Link to="/admin/projets" className="admin-command-link">Tous les projets</Link>}
              >
                <div className="admin-command-stack">
                  {myInternalProjects.slice(0, 5).map((project) => (
                    <InternalProjectLine key={project._id} project={project} />
                  ))}
                  {data.recentProjects.slice(0, 5).map((project) => (
                    <ProjectLine key={project._id} project={project} />
                  ))}
                  {myInternalProjects.length === 0 && data.recentProjects.length === 0 && (
                    <p className="admin-command-empty">Aucun projet recent.</p>
                  )}
                </div>
              </Section>
            </div>

            {(prefs.showContext || prefs.showShortcuts) && (
              <aside className="admin-command-context">
                {prefs.showContext && (
                  <Section title="Contexte du jour" icon={<Clock3 size={16} />}>
                    <div className="admin-day-card">
                      <strong>
                        {new Date().toLocaleDateString('fr-FR', {
                          weekday: 'long',
                          day: '2-digit',
                          month: 'long',
                        })}
                      </strong>
                      <span>{new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="admin-command-mini-list">
                      {nextMilestones.tasks.map((task) => (
                        <TaskLine key={task._id} task={task} />
                      ))}
                      {nextMilestones.missions.map((mission) => (
                        <MissionLine key={mission._id} mission={mission} />
                      ))}
                      {nextMilestones.tasks.length === 0 && nextMilestones.missions.length === 0 && (
                        <p className="admin-command-empty">Aucun jalon imminent.</p>
                      )}
                    </div>
                  </Section>
                )}

                {prefs.showShortcuts && (
                  <Section title="Raccourcis" icon={<Sparkles size={16} />}>
                    <div className="admin-shortcut-grid">
                      {canManageClients && <Link to="/admin/comptes-clients/nouveau"><BriefcaseBusiness size={15} />Client</Link>}
                      {canViewMessaging && <Link to="/admin/messages"><MessageSquare size={15} />Messages</Link>}
                      <Link to="/admin/crm"><CircleDollarSign size={15} />CRM</Link>
                      <Link to="/admin/dev"><AlertTriangle size={15} />Dev</Link>
                    </div>
                  </Section>
                )}
              </aside>
            )}
          </div>

          {customizeOpen && (
            <div className="admin-customize-overlay" onClick={() => setCustomizeOpen(false)}>
              <aside className="admin-customize-panel" onClick={(e) => e.stopPropagation()}>
                <div className="admin-customize-panel__header">
                  <div>
                    <span className="admin-command-eyebrow">Dashboard</span>
                    <h2>Personnalisation</h2>
                  </div>
                  <button onClick={() => setCustomizeOpen(false)} aria-label="Fermer">
                    <X size={16} />
                  </button>
                </div>
                <div className="admin-customize-group">
                  <span className="admin-customize-label">Densite</span>
                  <div className="admin-segmented-control">
                    <button
                      className={prefs.density === 'comfortable' ? 'active' : ''}
                      onClick={() => setPrefs((p) => ({ ...p, density: 'comfortable' }))}
                    >
                      Confort
                    </button>
                    <button
                      className={prefs.density === 'compact' ? 'active' : ''}
                      onClick={() => setPrefs((p) => ({ ...p, density: 'compact' }))}
                    >
                      Compact
                    </button>
                  </div>
                </div>
                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.showContext}
                    onChange={(e) => setPrefs((p) => ({ ...p, showContext: e.target.checked }))}
                  />
                  <span>Contexte du jour</span>
                </label>
                <label className="admin-toggle-row">
                  <input
                    type="checkbox"
                    checked={prefs.showShortcuts}
                    onChange={(e) => setPrefs((p) => ({ ...p, showShortcuts: e.target.checked }))}
                  />
                  <span>Raccourcis</span>
                </label>
              </aside>
            </div>
          )}
        </>
      ) : (
        <div className="admin-command-error">
          <AlertTriangle size={32} />
          <p>Impossible de charger le dashboard.</p>
        </div>
      )}
    </div>
  )
}
