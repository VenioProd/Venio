import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import {
  Activity,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  GitBranch,
  GitPullRequest,
  Layers3,
  Plus,
  RefreshCw,
  Target,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import { useConfirm } from '../../../hooks/useConfirm'
import {
  listDevProjects,
  listDevIssues,
  fetchDevStats,
  fetchDevOverview,
  createDevIssue,
  updateDevIssue,
  deleteDevIssue,
  createDevProject,
  addDevIssueComment,
  getDevIssue,
  deleteDevIssueComment,
  STATUS_LABEL,
  STATUS_COLOR,
  STATUS_ORDER,
  PRIORITY_LABEL,
  PRIORITY_COLOR,
  PRIORITY_ORDER,
  TYPE_LABEL,
  TYPE_COLOR,
  computeWeightedProgress,
  type DevProject,
  type DevIssue,
  type DevIssueComment,
  type DevIssueStatus,
  type DevIssuePriority,
  type DevIssueType,
  type DevStats,
  type DevOverview,
  type DevIssueGithubLink,
  type DevCiStatus,
  type IssueFilters,
} from '../../../services/dev'
import { PRIORITY_ICON, formatRelative, userInitial, ciStatusTone, type DeepLinkParams } from './helpers'
import GithubLinkPanel from './GithubLinkPanel'
import ProjectCreateModal from './ProjectCreateModal'
import IssueDetailPanel from './IssueDetailPanel'
import { ReviewQueue } from './ReviewQueue'
import CommandPalette from './CommandPalette'
import './DevWorkspace.css'

// Persistance des filtres & préférences d'affichage (A4).
const FILTERS_KEY = 'dev-workspace-prefs-v1'

const QUICK_VIEW_VALUES = ['today', 'all', 'mine', 'urgent', 'blocked', 'review', 'backlog'] as const
type QuickView = (typeof QUICK_VIEW_VALUES)[number]

// Tri client des issues (A7).
const SORT_VALUES = ['activity', 'created', 'priority', 'due'] as const
type SortBy = (typeof SORT_VALUES)[number]

type DevWorkspacePrefs = {
  filters?: IssueFilters
  groupBy?: 'status' | 'priority' | 'none'
  viewMode?: 'list' | 'kanban'
  quickView?: QuickView
  sortBy?: SortBy
}

function readPrefs(): DevWorkspacePrefs {
  try {
    return JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}') as DevWorkspacePrefs
  } catch {
    return {}
  }
}

const DevWorkspace = () => {
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_DEV)
  const { confirm, ConfirmDialog } = useConfirm()
  const params = useParams<DeepLinkParams>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const deepIssueId = params.issueId
  const queryProjectId = searchParams.get('project') || undefined
  const deepProjectId = params.projectId || queryProjectId

  const [projects, setProjects] = useState<DevProject[]>([])
  const [issues, setIssues] = useState<DevIssue[]>([])
  const [overview, setOverview] = useState<DevOverview | null>(null)
  const [stats, setStats] = useState<DevStats | null>(null)

  const [loading, setLoading] = useState(true)
  // Init paresseuse depuis localStorage ; le deep link ?project= garde la priorité.
  const [filters, setFilters] = useState<IssueFilters>(() => {
    try {
      const stored = readPrefs()
      return { status: 'open', ...stored.filters, project: deepProjectId ?? stored.filters?.project }
    } catch {
      return { status: 'open', project: deepProjectId }
    }
  })
  const [selectedIssue, setSelectedIssue] = useState<DevIssue | null>(null)
  const [comments, setComments] = useState<DevIssueComment[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [groupBy, setGroupBy] = useState<'status' | 'priority' | 'none'>(() => {
    const g = readPrefs().groupBy
    return g === 'priority' || g === 'none' ? g : 'status'
  })
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>(() =>
    readPrefs().viewMode === 'kanban' ? 'kanban' : 'list',
  )
  const [quickView, setQuickView] = useState<QuickView>(() => {
    const q = readPrefs().quickView
    return q && QUICK_VIEW_VALUES.includes(q) ? q : 'all'
  })
  // Tri des issues (A7), persisté avec les autres préférences.
  const [sortBy, setSortBy] = useState<SortBy>(() => {
    const s = readPrefs().sortBy
    return s && SORT_VALUES.includes(s) ? s : 'activity'
  })
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [showReviewQueue, setShowReviewQueue] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [dragOverCol, setDragOverCol] = useState<DevIssueStatus | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  // Sélection multiple + bulk actions (A2).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  const [bulkStatus, setBulkStatus] = useState<'' | DevIssueStatus>('')
  const [bulkPriority, setBulkPriority] = useState<'' | DevIssuePriority>('')
  const [bulkLabel, setBulkLabel] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const [showProjectModal, setShowProjectModal] = useState(false)
  const [projectForm, setProjectForm] = useState({ key: '', name: '', description: '', color: '#7c5cff' })
  const [projectError, setProjectError] = useState<string | null>(null)
  const [savingProject, setSavingProject] = useState(false)

  const [showQuickCreate, setShowQuickCreate] = useState(false)
  const [quickCreate, setQuickCreate] = useState<{
    title: string
    project: string
    type: DevIssueType
    priority: DevIssuePriority
    status: DevIssueStatus
  }>({ title: '', project: '', type: 'TASK', priority: 'NO_PRIORITY', status: 'TODO' })
  const [creating, setCreating] = useState(false)

  const loadProjects = useCallback(async () => {
    try {
      const data = await listDevProjects()
      setProjects(data.projects)
      if (data.projects.length && !quickCreate.project) {
        setQuickCreate((q) => ({ ...q, project: data.projects[0]!._id }))
      }
    } catch (e) {
      console.error(e)
    }
  }, [quickCreate.project])

  const loadIssues = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listDevIssues(filters)
      setIssues(data.issues)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filters])

  const loadStats = useCallback(async () => {
    try {
      const s = await fetchDevStats(filters.project)
      setStats(s)
    } catch (e) {
      console.error(e)
    }
  }, [filters.project])

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchDevOverview()
      setOverview(data)
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])
  useEffect(() => {
    loadIssues()
  }, [loadIssues])
  useEffect(() => {
    loadStats()
  }, [loadStats])
  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  const loadIssueDetail = useCallback(
    async (id: string) => {
      try {
        const data = await getDevIssue(id)
        setSelectedIssue(data.issue)
        setComments(data.comments)
      } catch (e) {
        console.error(e)
        // Deep link to an issue that no longer exists: bounce back to workspace root.
        if (location.pathname.startsWith('/admin/dev/issues/')) navigate('/admin/dev', { replace: true })
      }
    },
    [location.pathname, navigate],
  )

  const handleSelectIssue = (issue: DevIssue) => {
    setSelectedIssue(issue)
    setComments([])
    setCommentDraft('')
    loadIssueDetail(issue._id)
    if (deepIssueId !== issue._id) {
      navigate(`/admin/dev/issues/${issue._id}`, { replace: false })
    }
  }

  const handleCloseDetail = () => {
    setSelectedIssue(null)
    setComments([])
    if (location.pathname.startsWith('/admin/dev/issues/')) {
      navigate('/admin/dev', { replace: false })
    }
  }

  // Deep link: open the issue when /admin/dev/issues/:id is navigated to.
  useEffect(() => {
    if (deepIssueId && selectedIssue?._id !== deepIssueId) {
      setSelectedIssue(null)
      setComments([])
      setCommentDraft('')
      loadIssueDetail(deepIssueId)
    }
    if (!deepIssueId && selectedIssue && location.pathname === '/admin/dev') {
      setSelectedIssue(null)
      setComments([])
    }
  }, [deepIssueId, loadIssueDetail, selectedIssue, location.pathname])

  // Deep link: scope filters to the project when /admin/dev/projects/:id is navigated to.
  useEffect(() => {
    if (deepProjectId && filters.project !== deepProjectId) {
      setFilters((f) => ({ ...f, project: deepProjectId }))
    }
  }, [deepProjectId, filters.project])

  // Persistance des filtres + préférences d'affichage.
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ filters, groupBy, viewMode, quickView, sortBy }))
    } catch {
      /* quota */
    }
  }, [filters, groupBy, viewMode, quickView, sortBy])

  // La sélection multiple ne survit pas à un changement de filtres.
  useEffect(() => {
    setSelectedIds(new Set())
    setLastClickedId(null)
  }, [filters])

  // Raccourcis clavier globaux (A6) : ⌘K palette, c créer, / recherche, v vue.
  useEffect(() => {
    const overlayOpen = showReviewQueue || showProjectModal
    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K : toggle palette (sauf si un autre overlay est déjà ouvert).
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (overlayOpen) return
        e.preventDefault()
        setShowPalette((v) => !v)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Ignorés si focus dans un champ ou si un overlay est ouvert (palette comprise).
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      if (overlayOpen || showPalette) return
      if (e.key === 'c') {
        if (canManage && projects.length > 0) {
          e.preventDefault()
          setShowQuickCreate(true)
        }
      } else if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'v') {
        e.preventDefault()
        setViewMode((v) => (v === 'list' ? 'kanban' : 'list'))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showPalette, showReviewQueue, showProjectModal, canManage, projects.length])

  const applyQuickView = (view: typeof quickView) => {
    setQuickView(view)
    setFilters((f) => {
      const base: IssueFilters = { ...f }
      // Reset quick-view-managed fields each time.
      base.assignee = undefined
      base.priority = undefined
      base.label = undefined
      base.status = 'open'
      switch (view) {
        case 'mine':
          base.assignee = 'me'
          break
        case 'urgent':
          base.priority = 'URGENT'
          break
        case 'blocked':
          base.label = 'blocked'
          break
        case 'review':
          base.status = 'IN_REVIEW'
          break
        case 'backlog':
          base.status = 'BACKLOG'
          break
        default:
          base.status = 'open'
      }
      return base
    })
  }

  // Mutations
  const handleQuickCreate = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!quickCreate.title.trim() || !quickCreate.project) return
    setCreating(true)
    try {
      await createDevIssue({
        title: quickCreate.title.trim(),
        project: quickCreate.project,
        type: quickCreate.type,
        priority: quickCreate.priority,
        status: quickCreate.status,
      })
      setQuickCreate((q) => ({ ...q, title: '' }))
      await Promise.all([loadIssues(), loadStats(), loadOverview()])
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  const handlePatchIssue = async (id: string, patch: Partial<DevIssue> & { assignee?: string | null }) => {
    try {
      const updated = await updateDevIssue(id, patch)
      setIssues((prev) => prev.map((i) => (i._id === id ? { ...i, ...updated } : i)))
      if (selectedIssue?._id === id) setSelectedIssue((prev) => (prev ? { ...prev, ...updated } : prev))
      Promise.all([loadStats(), loadOverview()])
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteIssue = async (id: string) => {
    if (!(await confirm({ message: 'Supprimer définitivement cette issue ?', title: 'Suppression' }))) return
    try {
      await deleteDevIssue(id)
      setIssues((prev) => prev.filter((i) => i._id !== id))
      if (selectedIssue?._id === id) handleCloseDetail()
      Promise.all([loadStats(), loadOverview()])
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddComment = async () => {
    if (!commentDraft.trim() || !selectedIssue) return
    try {
      const c = await addDevIssueComment(selectedIssue._id, commentDraft.trim())
      setComments((prev) => [...prev, c])
      setCommentDraft('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    if (!selectedIssue) return
    if (!(await confirm({ message: 'Supprimer ce commentaire ?', title: 'Suppression' }))) return
    try {
      await deleteDevIssueComment(selectedIssue._id, commentId)
      setComments((prev) => prev.filter((c) => c._id !== commentId))
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    setProjectError(null)
    if (!projectForm.key.trim() || !projectForm.name.trim()) {
      setProjectError('Clé et nom requis')
      return
    }
    setSavingProject(true)
    try {
      const created = await createDevProject({
        key: projectForm.key.trim(),
        name: projectForm.name.trim(),
        description: projectForm.description.trim(),
        color: projectForm.color,
      })
      setShowProjectModal(false)
      setProjectForm({ key: '', name: '', description: '', color: '#7c5cff' })
      await loadProjects()
      setFilters((f) => ({ ...f, project: created._id }))
      setQuickCreate((q) => ({ ...q, project: created._id }))
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setSavingProject(false)
    }
  }

  // Tri client (A7) — appliqué aux groupes de la vue liste et aux colonnes kanban.
  const sortIssues = useCallback(
    (list: DevIssue[]) => {
      const ts = (d: string) => new Date(d).getTime()
      return [...list].sort((a, b) => {
        switch (sortBy) {
          case 'created':
            return ts(b.createdAt) - ts(a.createdAt)
          case 'priority':
            return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
          case 'due': {
            // Échéance croissante, issues sans échéance en dernier.
            const da = a.dueDate ? ts(a.dueDate) : Infinity
            const db = b.dueDate ? ts(b.dueDate) : Infinity
            return da - db
          }
          default:
            return ts(b.updatedAt) - ts(a.updatedAt)
        }
      })
    },
    [sortBy],
  )

  // Group issues for display
  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'Toutes', issues: sortIssues(issues), count: issues.length }]
    if (groupBy === 'priority') {
      return PRIORITY_ORDER.map((p) => {
        const list = sortIssues(issues.filter((i) => i.priority === p))
        return { key: PRIORITY_LABEL[p], color: PRIORITY_COLOR[p], issues: list, count: list.length }
      }).filter((g) => g.count > 0)
    }
    return STATUS_ORDER.map((s) => {
      const list = sortIssues(issues.filter((i) => i.status === s))
      return { key: STATUS_LABEL[s], color: STATUS_COLOR[s], issues: list, count: list.length }
    }).filter((g) => g.count > 0)
  }, [issues, groupBy, sortIssues])

  // Vue « Ma journée » (A5) : 3 groupes calculés client, ordre fixe, vides masqués.
  // Une issue n'apparaît que dans son premier groupe éligible.
  const todayGroups = useMemo(() => {
    if (quickView !== 'today') return []
    // eslint-disable-next-line react-hooks/purity -- les retards se jugent à l'instant du calcul (recalculé à chaque refetch)
    const now = Date.now()
    const ts = (d: string) => new Date(d).getTime()
    const used = new Set<string>()
    const claim = (list: DevIssue[]) => {
      list.forEach((i) => used.add(i._id))
      return list
    }
    const review = claim(
      issues.filter((i) => i.status === 'IN_REVIEW').sort((a, b) => ts(a.updatedAt) - ts(b.updatedAt)),
    )
    const urgent = claim(
      issues
        .filter(
          (i) =>
            !used.has(i._id) &&
            i.status !== 'DONE' &&
            i.status !== 'CANCELLED' &&
            (i.priority === 'URGENT' || (i.dueDate !== null && ts(i.dueDate) < now)),
        )
        .sort((a, b) => {
          // Échéance la plus proche d'abord (sans échéance en dernier), puis priorité.
          const da = a.dueDate ? ts(a.dueDate) : Infinity
          const db = b.dueDate ? ts(b.dueDate) : Infinity
          if (da !== db) return da - db
          return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
        }),
    )
    const inProgress = issues
      .filter((i) => !used.has(i._id) && i.status === 'IN_PROGRESS')
      .sort((a, b) => ts(b.updatedAt) - ts(a.updatedAt))
    return [
      { key: 'À valider', color: '#8b5cf6', issues: review, count: review.length, reviewShortcut: true },
      { key: 'Urgentes & en retard', color: '#ef4444', issues: urgent, count: urgent.length, reviewShortcut: false },
      { key: 'En cours', color: '#eab308', issues: inProgress, count: inProgress.length, reviewShortcut: false },
    ].filter((g) => g.count > 0)
  }, [issues, quickView])

  // Ordre plat des issues visibles (pour la sélection par plage avec Shift).
  const visibleFlat = useMemo(
    () => (quickView === 'today' ? todayGroups.flatMap((g) => g.issues) : grouped.flatMap((g) => g.issues)),
    [grouped, todayGroups, quickView],
  )

  const toggleSelect = (id: string, shift: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (shift && lastClickedId) {
        const ids = visibleFlat.map((i) => i._id)
        const a = ids.indexOf(lastClickedId)
        const b = ids.indexOf(id)
        if (a !== -1 && b !== -1) {
          const [from, to] = a < b ? [a, b] : [b, a]
          for (let i = from; i <= to; i++) next.add(ids[i]!)
          return next
        }
      }
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setLastClickedId(id)
  }

  const applyBulk = async () => {
    const label = bulkLabel.trim()
    if ((!bulkStatus && !bulkPriority && !label) || selectedIds.size === 0 || bulkApplying) return
    setBulkApplying(true)
    setBulkError(null)
    const patchFor = (id: string) => {
      const issue = issues.find((i) => i._id === id)
      const patch: Partial<Pick<DevIssue, 'status' | 'priority' | 'labels'>> = {}
      if (bulkStatus) patch.status = bulkStatus
      if (bulkPriority) patch.priority = bulkPriority
      if (label && issue) patch.labels = Array.from(new Set([...issue.labels, label]))
      return patch
    }
    try {
      const results = await Promise.allSettled([...selectedIds].map((id) => updateDevIssue(id, patchFor(id))))
      const failed = results.filter((r) => r.status === 'rejected').length
      if (failed > 0) {
        console.error(`Bulk : ${failed} mise(s) à jour en échec`, results)
        setBulkError(`${failed} mise(s) à jour en échec`)
      }
      await Promise.all([loadIssues(), loadStats(), loadOverview()])
    } finally {
      setSelectedIds(new Set())
      setLastClickedId(null)
      setBulkStatus('')
      setBulkPriority('')
      setBulkLabel('')
      setBulkApplying(false)
    }
  }

  const projectOverview = useMemo(() => {
    if (!overview) return []
    return [...overview.projects]
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
      .map((p) => {
        const active = (p.counts.byStatus.IN_PROGRESS || 0) + (p.counts.byStatus.IN_REVIEW || 0)
        return {
          project: { _id: p._id, key: p.key, name: p.name, color: p.color },
          total: p.counts.total,
          done: p.counts.done,
          active,
          urgent: p.counts.urgent,
          blocked: p.counts.blocked,
          percent: p.progress,
          lastActivityAt: p.lastActivityAt,
        }
      })
  }, [overview])

  const visibleProjectOverview = showAllProjects ? projectOverview : projectOverview.slice(0, 6)

  const globalCompletion = stats ? computeWeightedProgress(stats.byStatus as Record<DevIssueStatus, number>) : 0

  const renderRow = (issue: DevIssue) => {
    const project = typeof issue.project === 'object' ? issue.project : null
    return (
      <div
        key={issue._id}
        className={`dev-row${selectedIssue?._id === issue._id ? ' selected' : ''}`}
        onClick={() => handleSelectIssue(issue)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleSelectIssue(issue)}
      >
        <input
          type="checkbox"
          className="dev-row-check"
          checked={selectedIds.has(issue._id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => toggleSelect(issue._id, (e.nativeEvent as MouseEvent).shiftKey)}
        />
        <span
          className="dev-row-priority"
          title={PRIORITY_LABEL[issue.priority]}
          style={{ ['--prio-color' as never]: PRIORITY_COLOR[issue.priority] }}
        >
          {PRIORITY_ICON[issue.priority]}
        </span>
        <span className="dev-row-identifier">{project ? `${project.key}-${issue.number}` : issue.identifier}</span>
        <span
          className="dev-row-status"
          style={{ color: STATUS_COLOR[issue.status] }}
          title={STATUS_LABEL[issue.status]}
        >
          <span
            className={`dev-row-status-dot${issue.status === 'DONE' || issue.status === 'CANCELLED' ? ' filled' : ''}`}
          />
        </span>
        <span className="dev-row-title">{issue.title}</span>
        <span className="dev-row-type" style={{ ['--type-color' as never]: TYPE_COLOR[issue.type] }}>
          {TYPE_LABEL[issue.type]}
        </span>
        <span className="dev-row-labels">
          {issue.labels.slice(0, 2).map((l) => (
            <span key={l} className="dev-row-label">
              {l}
            </span>
          ))}
          {issue.labels.length > 2 && <span className="dev-row-label">+{issue.labels.length - 2}</span>}
        </span>
        <span className="dev-row-date">{formatRelative(issue.updatedAt)}</span>
        <span
          className={`dev-row-assignee${issue.assignee ? ' filled' : ''}`}
          title={issue.assignee?.name || issue.assignee?.email || 'Non assignée'}
        >
          {issue.assignee ? userInitial(issue.assignee) : '?'}
        </span>
      </div>
    )
  }

  return (
    <div className="dev-workspace">
      {ConfirmDialog}

      <div className="dev-header">
        <div className="dev-header-left">
          <h1 className="dev-title">Suivi développement</h1>
          <span className="dev-subtitle">
            {stats?.totalProjects ?? 0} projet(s) · {stats?.open ?? 0} issue(s) ouverte(s)
          </span>
        </div>
        <div className="dev-header-actions">
          <button className="dev-btn subtle" onClick={loadIssues} title="Rafraîchir">
            <RefreshCw size={13} />
          </button>
          {(stats?.byStatus?.IN_REVIEW ?? 0) > 0 && (
            <button className="dev-btn review" onClick={() => setShowReviewQueue(true)} title="Ouvrir la file de revue">
              <Check size={13} /> À valider ({stats!.byStatus.IN_REVIEW})
            </button>
          )}
          {canManage && (
            <>
              <button className="dev-btn subtle" onClick={() => setShowProjectModal(true)}>
                <Plus size={13} /> Projet
              </button>
              <button
                className="dev-btn primary"
                onClick={() => setShowQuickCreate((s) => !s)}
                disabled={projects.length === 0}
                title={projects.length === 0 ? "Créez d'abord un projet" : undefined}
              >
                <Plus size={13} /> Nouvelle issue
              </button>
            </>
          )}
        </div>
      </div>

      {stats && (
        <div className="dev-overview">
          <section className="dev-command-card">
            <div className="dev-command-card-main">
              <span className="dev-kicker">Command center</span>
              <div className="dev-command-title-row">
                <h2>{globalCompletion}%</h2>
                <span>complétion globale</span>
              </div>
              <div className="dev-progress-track" aria-label={'Complétion globale ' + globalCompletion + '%'}>
                <span style={{ width: globalCompletion + '%' }} />
              </div>
            </div>
            <div className="dev-command-metrics">
              <span>
                <Layers3 size={14} /> {stats.totalProjects} projets
              </span>
              <span>
                <CircleDot size={14} /> {stats.open} ouvertes
              </span>
              <span>
                <Activity size={14} /> {stats.byStatus.IN_PROGRESS + stats.byStatus.IN_REVIEW} actives
              </span>
              <span>
                <Target size={14} /> {stats.completedRecent} finies / 14j
              </span>
            </div>
          </section>

          {projectOverview.length > 0 && (
            <section className="dev-project-overview-block" aria-label="Projets triés par dernière modification">
              <div className="dev-project-strip-header">
                <span>Projets récents</span>
                <small>Triés par dernière modification, du plus récent au plus ancien</small>
                {projectOverview.length > 6 && (
                  <button type="button" className="dev-project-toggle" onClick={() => setShowAllProjects((v) => !v)}>
                    {showAllProjects ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {showAllProjects ? 'Réduire' : `Voir les ${projectOverview.length} projets`}
                  </button>
                )}
              </div>
              <div className={'dev-project-strip' + (showAllProjects ? ' expanded' : '')}>
                {visibleProjectOverview.map(
                  ({ project, total, done, active, urgent, blocked, percent, lastActivityAt }) => (
                    <button
                      key={project._id}
                      type="button"
                      className={'dev-project-card' + (filters.project === project._id ? ' selected' : '')}
                      onClick={() => navigate(`/admin/dev/projects/${project._id}`)}
                      style={{ ['--project-color' as never]: project.color || '#7c5cff' }}
                      title="Ouvrir le cockpit du projet"
                    >
                      <span className="dev-project-card-key">{project.key}</span>
                      <strong>{project.name}</strong>
                      <span className="dev-project-card-meta">
                        {done}/{total} terminées · {active} actives
                      </span>
                      <span className="dev-project-card-activity">Mis à jour {formatRelative(lastActivityAt)}</span>
                      <span className="dev-project-progress">
                        <span style={{ width: percent + '%' }} />
                      </span>
                      <span className="dev-project-card-footer">
                        <span className={urgent ? 'warn' : ''}>{urgent} urgent(s)</span>
                        <span className={blocked ? 'warn' : ''}>
                          {blocked ? `${blocked} bloqué(s)` : `${percent}% progression`}
                        </span>
                      </span>
                    </button>
                  ),
                )}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="dev-quick-views">
        {(
          [
            ['today', 'Ma journée'],
            ['all', 'Toutes ouvertes'],
            ['mine', 'Mes issues'],
            ['urgent', 'Urgentes'],
            ['blocked', 'Bloquées'],
            ['review', 'En revue'],
            ['backlog', 'Backlog'],
          ] as Array<[typeof quickView, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={'dev-quick-view-btn' + (quickView === key ? ' active' : '')}
            onClick={() => applyQuickView(key)}
          >
            {label}
          </button>
        ))}
        <div className="dev-view-mode">
          <button
            type="button"
            className={'dev-view-mode-btn' + (viewMode === 'list' ? ' active' : '')}
            onClick={() => setViewMode('list')}
            title="Vue liste"
          >
            Liste
          </button>
          <button
            type="button"
            className={'dev-view-mode-btn' + (viewMode === 'kanban' ? ' active' : '')}
            onClick={() => setViewMode('kanban')}
            title="Vue Kanban (statuts)"
          >
            Kanban
          </button>
        </div>
      </div>

      <div className="dev-toolbar">
        <input
          ref={searchRef}
          className="dev-search"
          placeholder="Rechercher (titre, identifiant)…"
          value={filters.q || ''}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
        />
        <select
          className="dev-select"
          value={filters.project || 'all'}
          onChange={(e) => {
            const next = e.target.value === 'all' ? undefined : e.target.value
            setFilters((f) => ({ ...f, project: next }))
          }}
        >
          <option value="all">Tous projets</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.key} · {p.name}
            </option>
          ))}
        </select>
        {filters.project && (
          <button
            type="button"
            className="dev-btn subtle"
            onClick={() => navigate(`/admin/dev/projects/${filters.project}`)}
            title="Ouvrir le cockpit projet"
          >
            <Target size={12} /> Cockpit projet
          </button>
        )}
        <select
          className="dev-select"
          value={filters.status || 'open'}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as IssueFilters['status'] }))}
        >
          <option value="open">Ouvertes</option>
          <option value="all">Toutes</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select
          className="dev-select"
          value={filters.priority || 'all'}
          onChange={(e) => setFilters((f) => ({ ...f, priority: e.target.value as IssueFilters['priority'] }))}
        >
          <option value="all">Toutes priorités</option>
          {PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select
          className="dev-select"
          value={filters.type || 'all'}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as IssueFilters['type'] }))}
        >
          <option value="all">Tous types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="dev-select"
          value={filters.assignee || 'all'}
          onChange={(e) => setFilters((f) => ({ ...f, assignee: e.target.value as IssueFilters['assignee'] }))}
        >
          <option value="all">Tous assignés</option>
          <option value="me">Moi</option>
          <option value="unassigned">Non assignées</option>
        </select>
        <select
          className="dev-select"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as 'status' | 'priority' | 'none')}
        >
          <option value="status">Groupé par statut</option>
          <option value="priority">Groupé par priorité</option>
          <option value="none">Pas de groupe</option>
        </select>
        <select
          className="dev-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          title="Tri des issues"
        >
          <option value="activity">Tri : activité</option>
          <option value="created">Tri : création</option>
          <option value="priority">Tri : priorité</option>
          <option value="due">Tri : échéance</option>
        </select>
      </div>

      <div className={`dev-body${selectedIssue ? ' with-detail' : ''}`}>
        <div className="dev-list">
          {canManage && showQuickCreate && (
            <form className="dev-quick-create" onSubmit={handleQuickCreate}>
              <select
                value={quickCreate.project}
                onChange={(e) => setQuickCreate((q) => ({ ...q, project: e.target.value }))}
              >
                {projects.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.key}
                  </option>
                ))}
              </select>
              <input
                className="title"
                placeholder="Titre de l'issue…"
                value={quickCreate.title}
                onChange={(e) => setQuickCreate((q) => ({ ...q, title: e.target.value }))}
                autoFocus
              />
              <select
                value={quickCreate.type}
                onChange={(e) => setQuickCreate((q) => ({ ...q, type: e.target.value as DevIssueType }))}
              >
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select
                value={quickCreate.priority}
                onChange={(e) => setQuickCreate((q) => ({ ...q, priority: e.target.value as DevIssuePriority }))}
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
              <select
                value={quickCreate.status}
                onChange={(e) => setQuickCreate((q) => ({ ...q, status: e.target.value as DevIssueStatus }))}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <button type="submit" className="dev-btn primary" disabled={creating || !quickCreate.title.trim()}>
                {creating ? '…' : 'Créer'}
              </button>
              <button type="button" className="dev-btn subtle" onClick={() => setShowQuickCreate(false)}>
                Annuler
              </button>
            </form>
          )}

          {loading ? (
            <div className="dev-loading">Chargement…</div>
          ) : issues.length === 0 ? (
            <div className="dev-empty">
              Aucune issue.
              {projects.length === 0 && canManage && (
                <div style={{ marginTop: 12 }}>
                  <button className="dev-btn primary" onClick={() => setShowProjectModal(true)}>
                    Créer le premier projet
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === 'kanban' ? (
            <div className="dev-kanban">
              {STATUS_ORDER.filter((s) => s !== 'CANCELLED').map((status) => {
                const colIssues = sortIssues(issues.filter((i) => i.status === status))
                return (
                  <div
                    key={status}
                    className={'dev-kanban-col' + (dragOverCol === status ? ' drag-over' : '')}
                    style={{ ['--col-color' as never]: STATUS_COLOR[status] }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverCol(status)
                    }}
                    onDragLeave={() => setDragOverCol((c) => (c === status ? null : c))}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOverCol(null)
                      const id = e.dataTransfer.getData('text/plain')
                      const dropped = issues.find((i) => i._id === id)
                      if (id && dropped && dropped.status !== status) handlePatchIssue(id, { status })
                    }}
                  >
                    <header
                      className="dev-kanban-col-header"
                      style={{ ['--col-color' as never]: STATUS_COLOR[status] }}
                    >
                      <span className="dev-kanban-col-dot" />
                      <span className="dev-kanban-col-title">{STATUS_LABEL[status]}</span>
                      <span className="dev-kanban-col-count">{colIssues.length}</span>
                    </header>
                    <div className="dev-kanban-col-body">
                      {colIssues.length === 0 ? (
                        <div className="dev-kanban-empty">—</div>
                      ) : (
                        colIssues.map((issue) => {
                          const project = typeof issue.project === 'object' ? issue.project : null
                          return (
                            <button
                              key={issue._id}
                              type="button"
                              className={'dev-kanban-card' + (selectedIssue?._id === issue._id ? ' selected' : '')}
                              onClick={() => handleSelectIssue(issue)}
                              style={{ ['--prio-color' as never]: PRIORITY_COLOR[issue.priority] }}
                              draggable={canManage}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', issue._id)
                                e.dataTransfer.effectAllowed = 'move'
                              }}
                            >
                              <div className="dev-kanban-card-top">
                                <span className="dev-kanban-card-id">
                                  {project ? `${project.key}-${issue.number}` : issue.identifier}
                                </span>
                                <span className="dev-kanban-card-prio">{PRIORITY_ICON[issue.priority]}</span>
                              </div>
                              <div className="dev-kanban-card-title">{issue.title}</div>
                              <div className="dev-kanban-card-meta">
                                <span
                                  className="dev-kanban-card-type"
                                  style={{ ['--type-color' as never]: TYPE_COLOR[issue.type] }}
                                >
                                  {TYPE_LABEL[issue.type]}
                                </span>
                                {issue.labels.slice(0, 2).map((l) => (
                                  <span key={l} className="dev-kanban-card-label">
                                    {l}
                                  </span>
                                ))}
                                {issue.assignee && (
                                  <span
                                    className="dev-kanban-card-assignee"
                                    title={issue.assignee.name || issue.assignee.email}
                                  >
                                    {userInitial(issue.assignee)}
                                  </span>
                                )}
                              </div>
                            </button>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : quickView === 'today' ? (
            // Vue « Ma journée » : 3 groupes client à accent couleur (A5).
            todayGroups.length === 0 ? (
              <div className="dev-empty">Rien à traiter aujourd'hui 🎉</div>
            ) : (
              todayGroups.map((group) => (
                <div key={group.key}>
                  <div className="dev-list-group-header dev-today-group" style={{ color: group.color }}>
                    {group.key}
                    <span className="dev-list-group-count">{group.count}</span>
                    {group.reviewShortcut && (
                      <button type="button" className="dev-today-review-link" onClick={() => setShowReviewQueue(true)}>
                        → Ouvrir la file de revue
                      </button>
                    )}
                  </div>
                  {group.issues.map(renderRow)}
                </div>
              ))
            )
          ) : (
            grouped.map((group) => (
              <div key={group.key}>
                <div className="dev-list-group-header" style={{ color: (group as { color?: string }).color }}>
                  {group.key}
                  <span className="dev-list-group-count">{group.count}</span>
                </div>
                {group.issues.map(renderRow)}
              </div>
            ))
          )}
        </div>

        {selectedIssue && (
          <IssueDetailPanel
            issue={selectedIssue}
            comments={comments}
            user={user}
            canManage={canManage}
            commentDraft={commentDraft}
            setCommentDraft={setCommentDraft}
            setIssue={setSelectedIssue}
            onPatch={handlePatchIssue}
            onClose={handleCloseDetail}
            onAddComment={handleAddComment}
            onDeleteComment={handleDeleteComment}
            onDeleteIssue={handleDeleteIssue}
          />
        )}
      </div>

      {(selectedIds.size > 0 || bulkError) && (
        <div className="dev-bulk-bar">
          {bulkError ? (
            <>
              <span className="dev-bulk-error">{bulkError}</span>
              <button className="dev-btn subtle" onClick={() => setBulkError(null)} title="Fermer">
                <X size={12} />
              </button>
            </>
          ) : (
            <>
              <span className="dev-bulk-count">{selectedIds.size} sélectionnée(s)</span>
              <select
                className="dev-select"
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value as '' | DevIssueStatus)}
              >
                <option value="">Statut…</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <select
                className="dev-select"
                value={bulkPriority}
                onChange={(e) => setBulkPriority(e.target.value as '' | DevIssuePriority)}
              >
                <option value="">Priorité…</option>
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
              <input
                className="dev-bulk-label-input"
                placeholder="+ label"
                value={bulkLabel}
                onChange={(e) => setBulkLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void applyBulk()
                }}
              />
              <button
                className="dev-btn primary"
                onClick={() => void applyBulk()}
                disabled={bulkApplying || (!bulkStatus && !bulkPriority && !bulkLabel.trim())}
              >
                {bulkApplying ? '…' : 'Appliquer'}
              </button>
              <button className="dev-btn subtle" onClick={() => setSelectedIds(new Set())} title="Vider la sélection">
                <X size={12} />
              </button>
            </>
          )}
        </div>
      )}

      {showPalette && (
        <CommandPalette
          issues={issues}
          projects={projects}
          canCreate={canManage && projects.length > 0}
          onClose={() => setShowPalette(false)}
          onSelectIssue={handleSelectIssue}
          onNewIssue={() => setShowQuickCreate(true)}
          onOpenReviewQueue={() => setShowReviewQueue(true)}
          onToggleViewMode={() => setViewMode((v) => (v === 'list' ? 'kanban' : 'list'))}
          onShowToday={() => applyQuickView('today')}
          onOpenCockpit={(id) => navigate(`/admin/dev/projects/${id}`)}
        />
      )}

      {showReviewQueue && (
        <ReviewQueue
          projects={projects}
          onClose={() => setShowReviewQueue(false)}
          onChanged={() => {
            loadIssues()
            loadStats()
            loadOverview()
          }}
        />
      )}

      {showProjectModal && (
        <ProjectCreateModal
          form={projectForm}
          setForm={setProjectForm}
          error={projectError}
          saving={savingProject}
          onSubmit={handleCreateProject}
          onClose={() => setShowProjectModal(false)}
        />
      )}
    </div>
  )
}

export default DevWorkspace
