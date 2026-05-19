import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Hash,
  ListChecks,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  fetchDevProjectCockpit,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
  TYPE_COLOR,
  TYPE_LABEL,
  type DevCockpit,
  type DevCockpitActivityEvent,
  type DevCockpitIssueRef,
  type DevIssuePriority,
  type DevIssueStatus,
  type DevIssueType,
} from '../../../services/dev'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import './DevProjectCockpit.css'

const HEALTH_META: Record<DevCockpit['health'], { label: string; tone: 'ok' | 'warn' | 'fail'; icon: typeof Sparkles }> = {
  on_track: { label: 'On track', tone: 'ok', icon: Sparkles },
  at_risk: { label: 'At risk', tone: 'warn', icon: AlertTriangle },
  blocked: { label: 'Blocked', tone: 'fail', icon: ShieldAlert },
}

function formatRelative(date: string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  const diff = Date.now() - d.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return "à l'instant"
  if (diff < hour) return `il y a ${Math.floor(diff / minute)} min`
  if (diff < day) return `il y a ${Math.floor(diff / hour)} h`
  if (diff < 7 * day) return `il y a ${Math.floor(diff / day)} j`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function userInitial(u: { name?: string; email?: string } | null | undefined): string {
  if (!u) return '?'
  const name = u.name || u.email || ''
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?'
}

interface IssueRowProps {
  issue: DevCockpitIssueRef
  onOpen: (id: string) => void
}

const IssueRow = ({ issue, onOpen }: IssueRowProps) => (
  <button
    type="button"
    className="cockpit-issue-row"
    onClick={() => onOpen(issue._id)}
    style={{ ['--prio-color' as never]: PRIORITY_COLOR[issue.priority] }}
  >
    <span className="cockpit-issue-row-id">{issue.identifier}</span>
    <span className="cockpit-issue-row-title">{issue.title}</span>
    <span
      className="cockpit-issue-row-status"
      style={{ color: STATUS_COLOR[issue.status] }}
      title={STATUS_LABEL[issue.status]}
    >
      <span className="cockpit-status-dot" style={{ background: STATUS_COLOR[issue.status] }} />
      {STATUS_LABEL[issue.status]}
    </span>
    {issue.assignee && (
      <span className="cockpit-issue-row-assignee" title={issue.assignee.name || issue.assignee.email}>
        {userInitial(issue.assignee)}
      </span>
    )}
    {issue.dueDate && (
      <span className="cockpit-issue-row-due">
        <CalendarClock size={11} />
        {formatShortDate(issue.dueDate)}
      </span>
    )}
  </button>
)

interface ActivityRowProps {
  event: DevCockpitActivityEvent
  onOpen: (id: string) => void
}

const ACTIVITY_LABEL: Record<DevCockpitActivityEvent['type'], string> = {
  issue_created: 'a créé',
  issue_completed: 'a terminé',
  issue_updated: 'a mis à jour',
  comment: 'a commenté',
}

const ACTIVITY_ICON: Record<DevCockpitActivityEvent['type'], typeof Sparkles> = {
  issue_created: Plus,
  issue_completed: CheckCircle2,
  issue_updated: RefreshCw,
  comment: MessageSquare,
}

const ActivityRow = ({ event, onOpen }: ActivityRowProps) => {
  const Icon = ACTIVITY_ICON[event.type]
  return (
    <div className={`cockpit-activity-row tone-${event.type}`}>
      <span className="cockpit-activity-icon">
        <Icon size={12} />
      </span>
      <span className="cockpit-activity-actor">{event.actor?.name || event.actor?.email || 'Système'}</span>
      <span className="cockpit-activity-action">{ACTIVITY_LABEL[event.type]}</span>
      {event.issue && (
        <button
          type="button"
          className="cockpit-activity-issue"
          onClick={() => event.issue && onOpen(event.issue._id)}
        >
          {event.issue.identifier} <span className="cockpit-activity-issue-title">{event.issue.title}</span>
        </button>
      )}
      <span className="cockpit-activity-date">{formatRelative(event.at)}</span>
    </div>
  )
}

interface ChartTooltipPayload {
  payload?: { date?: string; completed?: number; created?: number }
  value?: number
  name?: string
  color?: string
}

const VelocityTooltip = ({ active, payload }: { active?: boolean; payload?: ChartTooltipPayload[] }) => {
  if (!active || !payload?.length) return null
  const point = payload[0]?.payload || {}
  return (
    <div className="cockpit-chart-tooltip">
      <strong>{point.date}</strong>
      <span><CheckCircle2 size={10} style={{ color: '#10b981' }} /> Terminées : {point.completed ?? 0}</span>
      <span><Plus size={10} style={{ color: '#7c5cff' }} /> Créées : {point.created ?? 0}</span>
    </div>
  )
}

const PieTooltip = ({ active, payload }: { active?: boolean; payload?: ChartTooltipPayload[] }) => {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return (
    <div className="cockpit-chart-tooltip">
      <strong>{p.name}</strong>
      <span>{p.value} issue(s)</span>
    </div>
  )
}

const BarTooltip = PieTooltip

const DevProjectCockpit = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_DEV)

  const [cockpit, setCockpit] = useState<DevCockpit | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDevProjectCockpit(projectId)
      setCockpit(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const openIssue = useCallback((id: string) => {
    navigate(`/admin/dev/issues/${id}`)
  }, [navigate])

  const statusData = useMemo(() => {
    if (!cockpit) return []
    return STATUS_ORDER.map((s) => ({
      key: s,
      name: STATUS_LABEL[s],
      value: cockpit.byStatus[s] || 0,
      color: STATUS_COLOR[s],
    })).filter((d) => d.value > 0)
  }, [cockpit])

  const priorityData = useMemo(() => {
    if (!cockpit) return []
    return (Object.entries(cockpit.byPriority) as [DevIssuePriority, number][])
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, name: PRIORITY_LABEL[k], value: v, color: PRIORITY_COLOR[k] }))
  }, [cockpit])

  const typeData = useMemo(() => {
    if (!cockpit) return []
    return (Object.entries(cockpit.byType) as [DevIssueType, number][])
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ key: k, name: TYPE_LABEL[k], value: v, color: TYPE_COLOR[k] }))
  }, [cockpit])

  const velocityData = useMemo(() => {
    if (!cockpit) return []
    return cockpit.velocity.days.map((d) => ({
      date: d.date.slice(5), // MM-DD
      completed: d.completed,
      created: d.created,
    }))
  }, [cockpit])

  if (!projectId) return <div className="cockpit-loading">Identifiant de projet manquant.</div>
  if (loading && !cockpit) return <div className="cockpit-loading">Chargement du cockpit…</div>
  if (error) return (
    <div className="cockpit-error">
      <AlertOctagon size={16} /> {error}
      <button className="cockpit-btn" onClick={load}>Réessayer</button>
    </div>
  )
  if (!cockpit) return <div className="cockpit-loading">Aucune donnée.</div>

  const { project, counts, progress, health, velocity } = cockpit
  const HealthIcon = HEALTH_META[health].icon

  return (
    <div className="cockpit-page" style={{ ['--accent' as never]: project.color }}>
      <header className="cockpit-header">
        <div className="cockpit-header-left">
          <button className="cockpit-back" onClick={() => navigate('/admin/dev')} title="Retour Dev Workspace">
            <ArrowLeft size={14} />
          </button>
          <div className="cockpit-header-id">
            <span className="cockpit-project-key">{project.key}</span>
            <span className="cockpit-project-status" data-tone={project.status === 'ACTIVE' ? 'ok' : project.status === 'PAUSED' ? 'warn' : 'neutral'}>
              {project.status}
            </span>
          </div>
          <h1 className="cockpit-title">{project.name}</h1>
        </div>
        <div className="cockpit-header-actions">
          <button className="cockpit-btn subtle" onClick={load} title="Rafraîchir">
            <RefreshCw size={12} /> Rafraîchir
          </button>
          <button className="cockpit-btn subtle" onClick={() => navigate(`/admin/dev/projects/${project._id}/issues`)} disabled>
            <ListChecks size={12} /> Voir les issues
          </button>
          <button
            className="cockpit-btn subtle"
            onClick={() => navigate(`/admin/dev?project=${project._id}`)}
            title="Ouvrir dans le workspace"
          >
            <ExternalLink size={12} /> Workspace
          </button>
          {canManage && (
            <button
              className="cockpit-btn primary"
              onClick={() => navigate('/admin/dev')}
              title="Créer une issue (workspace)"
            >
              <Plus size={12} /> Nouvelle issue
            </button>
          )}
        </div>
      </header>

      {/* KPI strip */}
      <section className="cockpit-kpis">
        <div className={`cockpit-kpi-card health tone-${HEALTH_META[health].tone}`}>
          <div className="cockpit-kpi-label">
            <HealthIcon size={12} /> Santé
          </div>
          <div className="cockpit-kpi-value">{HEALTH_META[health].label}</div>
          <div className="cockpit-kpi-sub">{progress}% complétion</div>
          <div className="cockpit-kpi-progress" aria-hidden>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="cockpit-kpi-card">
          <div className="cockpit-kpi-label"><Hash size={12} /> Issues</div>
          <div className="cockpit-kpi-value">{counts.total}</div>
          <div className="cockpit-kpi-sub">{counts.open} ouvertes · {counts.done} terminées</div>
        </div>
        <div className={`cockpit-kpi-card${counts.urgent ? ' tone-warn' : ''}`}>
          <div className="cockpit-kpi-label"><Flame size={12} /> Urgentes</div>
          <div className="cockpit-kpi-value">{counts.urgent}</div>
          <div className="cockpit-kpi-sub">{counts.blocked} bloquée(s)</div>
        </div>
        <div className={`cockpit-kpi-card${counts.overdue ? ' tone-fail' : ''}`}>
          <div className="cockpit-kpi-label"><Clock size={12} /> En retard</div>
          <div className="cockpit-kpi-value">{counts.overdue}</div>
          <div className="cockpit-kpi-sub">échéances dépassées</div>
        </div>
        <div className="cockpit-kpi-card">
          <div className="cockpit-kpi-label"><TrendingUp size={12} /> Vélocité</div>
          <div className="cockpit-kpi-value">{velocity.velocityPerDay14d.toFixed(1)}</div>
          <div className="cockpit-kpi-sub">issues / jour · 14 j</div>
        </div>
        <div className="cockpit-kpi-card">
          <div className="cockpit-kpi-label"><Target size={12} /> Récent</div>
          <div className="cockpit-kpi-value">{velocity.completed7d}</div>
          <div className="cockpit-kpi-sub">{velocity.completed14d} sur 14 j</div>
        </div>
      </section>

      {/* Project meta + état */}
      <section className="cockpit-row">
        <div className="cockpit-card cockpit-readme">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">Contexte projet</span>
            <span className="cockpit-card-meta">
              <Users size={11} /> {project.members.length} membre(s)
              {project.lead && <> · Lead : {project.lead.name || project.lead.email}</>}
            </span>
          </div>
          {project.description ? (
            <pre className="cockpit-readme-body">{project.description}</pre>
          ) : (
            <div className="cockpit-readme-empty">
              Aucune description. Renseignez-la dans le workspace pour donner du contexte au projet.
            </div>
          )}
        </div>

        <div className="cockpit-card cockpit-status">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">Où ça en est</span>
            <span className="cockpit-card-meta">
              dernière activité {formatRelative(cockpit.lastActivityAt)}
            </span>
          </div>
          <ul className="cockpit-status-list">
            <li>
              <strong>{counts.open}</strong> issue(s) ouverte(s) — {counts.done} terminée(s) / {counts.total}
            </li>
            {counts.urgent > 0 && (
              <li className="warn">
                <Flame size={11} /> <strong>{counts.urgent}</strong> urgentes à traiter
              </li>
            )}
            {counts.blocked > 0 && (
              <li className="fail">
                <ShieldAlert size={11} /> <strong>{counts.blocked}</strong> bloquée(s) — débloquer pour avancer
              </li>
            )}
            {counts.overdue > 0 && (
              <li className="fail">
                <Clock size={11} /> <strong>{counts.overdue}</strong> en retard sur échéance
              </li>
            )}
            {velocity.avgCompletionDays !== null && (
              <li>
                <Activity size={11} /> Temps moyen de résolution :
                {' '}<strong>{velocity.avgCompletionDays} j</strong>
              </li>
            )}
            {cockpit.nextDue[0] && (
              <li>
                <CalendarClock size={11} /> Prochaine échéance :{' '}
                <button className="cockpit-inline-link" onClick={() => openIssue(cockpit.nextDue[0]!._id)}>
                  {cockpit.nextDue[0].identifier} · {formatShortDate(cockpit.nextDue[0].dueDate!)}
                </button>
              </li>
            )}
            {counts.open === 0 && counts.total > 0 && (
              <li className="ok">
                <CheckCircle2 size={11} /> Backlog vidé : aucune issue ouverte.
              </li>
            )}
            {counts.total === 0 && (
              <li>Aucune issue pour ce projet. Créez-en une depuis le workspace.</li>
            )}
          </ul>
        </div>
      </section>

      {/* Charts row */}
      <section className="cockpit-row">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">Vélocité 14 jours</span>
            <span className="cockpit-card-meta">
              terminées vs créées par jour
            </span>
          </div>
          <div className="cockpit-chart" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={velocityData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<VelocityTooltip />} cursor={{ stroke: 'rgba(148,163,184,0.18)' }} />
                <Line type="monotone" dataKey="created" stroke="#7c5cff" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={1.8} dot={{ r: 2, fill: '#10b981' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">Statut</span>
            <span className="cockpit-card-meta">{counts.total} issue(s)</span>
          </div>
          {statusData.length === 0 ? (
            <div className="cockpit-empty">Aucune donnée</div>
          ) : (
            <div className="cockpit-chart-wrap">
              <div className="cockpit-chart" style={{ height: 180, flex: '0 0 180px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip content={<PieTooltip />} />
                    <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} stroke="none" paddingAngle={2}>
                      {statusData.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="cockpit-legend">
                {statusData.map((d) => (
                  <li key={d.key}>
                    <span className="cockpit-legend-dot" style={{ background: d.color }} />
                    <span className="cockpit-legend-label">{d.name}</span>
                    <span className="cockpit-legend-value">{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section className="cockpit-row">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">Priorité</span>
            <span className="cockpit-card-meta">répartition</span>
          </div>
          {priorityData.length === 0 ? (
            <div className="cockpit-empty">Aucune donnée</div>
          ) : (
            <div className="cockpit-chart" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={priorityData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {priorityData.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker">Type</span>
            <span className="cockpit-card-meta">feature · bug · …</span>
          </div>
          {typeData.length === 0 ? (
            <div className="cockpit-empty">Aucune donnée</div>
          ) : (
            <div className="cockpit-chart" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={typeData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} layout="vertical">
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false} width={70} />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {typeData.map((d) => (
                      <Cell key={d.key} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Lists row : risks/blockers/overdue */}
      <section className="cockpit-row triple">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><ShieldAlert size={11} /> Bloquées</span>
            <span className="cockpit-card-meta">{cockpit.blockers.length}</span>
          </div>
          {cockpit.blockers.length === 0 ? (
            <div className="cockpit-empty">Aucune issue bloquée. </div>
          ) : (
            cockpit.blockers.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>

        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><Flame size={11} /> Urgentes</span>
            <span className="cockpit-card-meta">{cockpit.urgent.length}</span>
          </div>
          {cockpit.urgent.length === 0 ? (
            <div className="cockpit-empty">Aucune issue urgente.</div>
          ) : (
            cockpit.urgent.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>

        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><Clock size={11} /> En retard</span>
            <span className="cockpit-card-meta">{cockpit.overdue.length}</span>
          </div>
          {cockpit.overdue.length === 0 ? (
            <div className="cockpit-empty">Aucune échéance dépassée.</div>
          ) : (
            cockpit.overdue.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>
      </section>

      {/* Next actions + recently done */}
      <section className="cockpit-row">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><CalendarClock size={11} /> Prochaines échéances</span>
            <span className="cockpit-card-meta">{cockpit.nextDue.length}</span>
          </div>
          {cockpit.nextDue.length === 0 ? (
            <div className="cockpit-empty">Aucune échéance à venir.</div>
          ) : (
            cockpit.nextDue.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>

        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><CheckCircle2 size={11} /> Récemment terminées</span>
            <span className="cockpit-card-meta">{cockpit.recentlyDone.length}</span>
          </div>
          {cockpit.recentlyDone.length === 0 ? (
            <div className="cockpit-empty">Aucune issue terminée.</div>
          ) : (
            cockpit.recentlyDone.map((i) => <IssueRow key={i._id} issue={i} onOpen={openIssue} />)
          )}
        </div>
      </section>

      {/* Workload + activity */}
      <section className="cockpit-row">
        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><Users size={11} /> Charge par assigné</span>
            <span className="cockpit-card-meta">{cockpit.assignees.length} entrée(s)</span>
          </div>
          {cockpit.assignees.length === 0 ? (
            <div className="cockpit-empty">Aucun assigné.</div>
          ) : (
            <table className="cockpit-assignees">
              <thead>
                <tr><th>Membre</th><th>Ouvertes</th><th>Urgent</th><th>Terminé</th></tr>
              </thead>
              <tbody>
                {cockpit.assignees.map((row, idx) => (
                  <tr key={row.user?._id || `unassigned-${idx}`}>
                    <td>
                      <span className="cockpit-avatar">{userInitial(row.user)}</span>
                      {row.user?.name || row.user?.email || 'Non assignée'}
                    </td>
                    <td>{row.open}</td>
                    <td className={row.urgent ? 'warn' : ''}>{row.urgent}</td>
                    <td>{row.done}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="cockpit-card">
          <div className="cockpit-card-header">
            <span className="cockpit-card-kicker"><Activity size={11} /> Activité récente</span>
            <span className="cockpit-card-meta">{cockpit.activity.length} événement(s)</span>
          </div>
          {cockpit.activity.length === 0 ? (
            <div className="cockpit-empty">Aucune activité.</div>
          ) : (
            <div className="cockpit-activity-list">
              {cockpit.activity.map((event, idx) => (
                <ActivityRow key={`${event.type}-${event.at}-${idx}`} event={event} onOpen={openIssue} />
              ))}
            </div>
          )}
        </div>
      </section>

    </div>
  )
}

export default DevProjectCockpit
