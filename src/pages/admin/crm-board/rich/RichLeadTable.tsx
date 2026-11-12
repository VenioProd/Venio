import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../../../lib/api'
import Dialog from '../automations/Dialog'
import ConfirmModal from '../../../../components/ConfirmModal'
import { exportToCsv } from '../../../../lib/exportCsv'
import { useI18n } from '../../../../context/I18nContext'
import type { MessageKey } from '../../../../i18n'
import type { AdminUser, Lead } from '../../../../types/crm.types'
import EnrollDialog from '../sequences/EnrollDialog'
import {
  CRM_PRIORITIES,
  CRM_PROJECTS,
  CRM_STATUSES,
  CRM_TEMPERATURES,
  leadEntity,
  parseEntityParam,
} from '../constants'
import {
  COLUMN_GROUPS,
  COLUMN_MAP,
  DEFAULT_COLUMNS,
  RICH_COLUMNS,
  formatEuro,
  daysSince,
  isLate,
  isOpen,
  lastActivityOf,
  weightedOf,
  type ColumnContext,
} from './columns'
import {
  bulkLeads,
  createView,
  deleteView,
  listViews,
  updateView,
  type BulkAction,
  type CrmView,
  type RichFilters,
} from './api'
import './rich.css'

interface Props {
  leads: Lead[]
  admins: AdminUser[]
  adminsById: Record<string, AdminUser>
  canManageCrm: boolean
  currentUserId?: string
  onOpenLead: (lead: Lead) => void
  onReload: () => Promise<void>
  onError: (message: string) => void
  /** Filtre plateforme tenu par l'URL (?project=) pour rester partageable entre les vues. */
  project: string
  onProjectChange: (project: string) => void
  entityFilter?: ReactNode
  exportRef?: MutableRefObject<(() => void) | null>
  updatedLead?: Lead | null
  onUpdateLead?: (id: string, patch: Record<string, unknown>) => Promise<void>
  renderBoard?: (leads: Lead[]) => ReactNode
}

interface Sort {
  key: string
  dir: 1 | -1
}

const COLUMNS_STORAGE = 'venio.crm.columns.v1'

const BUILTIN_VIEWS: Array<{ id: string; nameKey: MessageKey; filters: RichFilters }> = [
  { id: 'all', nameKey: 'crmRich.view.all', filters: {} },
  { id: 'hot', nameKey: 'crmRich.view.hot', filters: { temperature: 'HOT' } },
  { id: 'late', nameKey: 'crmRich.view.late', filters: { late: true } },
  { id: 'big', nameKey: 'crmRich.view.big', filters: { big: true } },
]

function loadStoredColumns(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(COLUMNS_STORAGE) || 'null')
    if (Array.isArray(raw) && raw.every((k) => typeof k === 'string' && COLUMN_MAP[k])) return raw
  } catch {
    /* stockage indisponible : colonnes par défaut */
  }
  return DEFAULT_COLUMNS
}

function matches(lead: Lead, f: RichFilters, now: Date): boolean {
  if (f.q) {
    const q = f.q.toLowerCase()
    const hay = [lead.company, lead.contactName, lead.contactEmail, lead.source, ...(lead.tags ?? [])]
      .join(' ')
      .toLowerCase()
    if (!hay.includes(q)) return false
  }
  if (f.status && lead.status !== f.status) return false
  if (f.priority && lead.priority !== f.priority) return false
  if (f.project && lead.project !== f.project) return false
  if (f.owner === 'none' ? lead.assignedTo : f.owner && lead.assignedTo !== f.owner) return false
  if (f.source && lead.source !== f.source) return false
  if (
    f.temperature === 'HOT'
      ? !['CHAUD', 'TRES_CHAUD'].includes(lead.leadTemperature || '')
      : f.temperature && lead.leadTemperature !== f.temperature
  )
    return false
  if (f.tag && !(lead.tags ?? []).includes(f.tag)) return false
  if (f.late && !isLate(lead, now)) return false
  if (f.big && (lead.budget ?? 0) <= 30000) return false
  return true
}

export default function RichLeadTable({
  leads,
  admins,
  adminsById,
  canManageCrm,
  currentUserId,
  onOpenLead,
  onReload,
  onError,
  project,
  onProjectChange,
  entityFilter,
  exportRef,
  updatedLead,
  onUpdateLead,
  renderBoard,
}: Props) {
  const { t } = useI18n()
  const now = useMemo(() => new Date(), [leads])
  const ctx: ColumnContext = useMemo(() => ({ t: t as ColumnContext['t'], adminsById, now }), [t, adminsById, now])

  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => {
    const parsed: RichFilters = {}
    for (const key of ['q', 'status', 'priority', 'owner', 'source', 'temperature', 'tag'] as const) {
      const value = searchParams.get(key)
      if (value) parsed[key] = value
    }
    for (const key of ['late', 'big'] as const) if (searchParams.get(key) === '1') parsed[key] = true
    return parsed
  }, [searchParams])
  const setFilters = (next: RichFilters, nextSort?: Sort | null, archive?: boolean) =>
    setSearchParams(
      (params) => {
        for (const key of [
          'q',
          'status',
          'priority',
          'owner',
          'source',
          'temperature',
          'tag',
          'late',
          'big',
        ] as const) {
          const value = next[key]
          if (value) params.set(key, value === true ? '1' : String(value))
          else params.delete(key)
        }
        if ('project' in next) {
          if (next.project) params.set('project', next.project)
          else params.delete('project')
        }
        if (archive !== undefined) {
          if (archive) params.set('archived', '1')
          else params.delete('archived')
        }
        if (nextSort) {
          params.set('sort', nextSort.key)
          params.set('dir', nextSort.dir === 1 ? 'asc' : 'desc')
        }
        return params
      },
      { replace: true },
    )
  const archived = searchParams.get('archived') === '1'
  const [archivedLeads, setArchivedLeads] = useState<Lead[]>([])
  useEffect(() => {
    if (updatedLead)
      setArchivedLeads((items) => items.map((lead) => (lead._id === updatedLead._id ? updatedLead : lead)))
  }, [updatedLead])
  const [archiveLoading, setArchiveLoading] = useState(archived)
  const [archiveVersion, setArchiveVersion] = useState(0)
  useEffect(() => {
    if (!archived) return
    let active = true
    setArchiveLoading(true)
    apiFetch<{ leads: Lead[] }>('/api/admin/crm/leads?archived=true')
      .then((data) => {
        if (active) setArchivedLeads(data.leads)
      })
      .catch((error) => {
        if (active) onError((error as Error).message)
      })
      .finally(() => {
        if (active) setArchiveLoading(false)
      })
    return () => {
      active = false
    }
  }, [archived, archiveVersion])
  const [query, setQuery] = useState(filters.q)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(filters.q), 250)
    return () => clearTimeout(timer)
  }, [filters.q])
  const rowLimit = Math.max(100, parseInt(searchParams.get('rows') || '', 10) || 100)
  const wrapRef = useRef<HTMLDivElement>(null)
  const restoredScroll = useRef(false)
  const [builtin, setBuiltin] = useState('all')
  const [activeView, setActiveView] = useState<string | null>(null)
  const [views, setViews] = useState<CrmView[]>([])
  const [columns, setColumns] = useState<string[]>(loadStoredColumns)
  const sortKey = searchParams.get('sort')
  const sortDirection = searchParams.get('dir')
  const sort = useMemo<Sort>(
    () => ({
      key: RICH_COLUMNS.some((column) => column.key === sortKey) ? sortKey! : 'lastInteractionAt',
      dir: sortDirection === 'asc' ? 1 : -1,
    }),
    [sortKey, sortDirection],
  )
  const setSort = (next: Sort) =>
    setSearchParams(
      (params) => {
        params.set('sort', next.key)
        params.set('dir', next.dir === 1 ? 'asc' : 'desc')
        return params
      },
      { replace: true },
    )
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => setSelected(new Set()), [archived])
  const [colsOpen, setColsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewName, setViewName] = useState('')
  const [viewScope, setViewScope] = useState<'PRIVATE' | 'TEAM'>('PRIVATE')
  const [pending, setPending] = useState<{
    action: BulkAction
    payload?: Record<string, unknown>
    label: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [enrollOpen, setEnrollOpen] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)
  const colsPanelRef = useRef<HTMLDivElement>(null)
  const [colsPosition, setColsPosition] = useState({ top: 0, left: 0, maxHeight: 600 })
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => {
    if (!selected.size) setMoreOpen(false)
  }, [selected.size])
  const [tagOpen, setTagOpen] = useState(false)
  const [tag, setTag] = useState('')
  const [kpisOpen, setKpisOpen] = useState(() => {
    try {
      const stored = localStorage.getItem('venio.crm.kpis')
      if (stored !== null) return stored === 'open'
    } catch {
      /* préférence indisponible */
    }
    return false
  })
  const toggleKpis = () =>
    setKpisOpen((open) => {
      try {
        localStorage.setItem('venio.crm.kpis', open ? 'closed' : 'open')
      } catch {
        /* préférence indisponible */
      }
      return !open
    })

  useEffect(() => {
    listViews()
      .then(setViews)
      .catch(() => setViews([]))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_STORAGE, JSON.stringify(columns))
    } catch {
      /* préférence non persistée */
    }
  }, [columns])

  useEffect(() => {
    if (!colsOpen) return
    const close = (e: MouseEvent) => {
      if (!colsRef.current?.contains(e.target as Node) && !colsPanelRef.current?.contains(e.target as Node))
        setColsOpen(false)
    }
    const position = () => {
      const anchor = colsRef.current?.getBoundingClientRect()
      if (!anchor) return
      const below = window.innerHeight - anchor.bottom - 20
      const above = anchor.top - 20
      const naturalHeight = colsPanelRef.current?.scrollHeight || 520
      const upwards = below < Math.min(naturalHeight, 300) && above > below
      const maxHeight = Math.min(600, upwards ? above : below)
      const height = Math.min(naturalHeight, maxHeight)
      const width = Math.min(340, window.innerWidth - 24)
      setColsPosition({
        left: Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12)),
        top: upwards ? Math.max(12, anchor.top - height - 8) : anchor.bottom + 8,
        maxHeight,
      })
    }
    position()
    const trigger = colsRef.current?.querySelector('button')
    colsPanelRef.current?.querySelector('button')?.focus({ preventScroll: true })
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setColsOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      trigger?.focus()
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [colsOpen])

  const effective = useMemo(
    () => ({ ...filters, q: query, project }),
    [
      query,
      project,
      filters.status,
      filters.priority,
      filters.owner,
      filters.source,
      filters.temperature,
      filters.tag,
      filters.late,
      filters.big,
    ],
  )
  const entity = parseEntityParam(searchParams.get('entity'))
  const visible = useMemo(
    () =>
      (archived ? archivedLeads : leads).filter(
        (l) => (!entity || leadEntity(l) === entity) && matches(l, effective, now),
      ),
    [leads, archived, archivedLeads, entity, effective, now],
  )
  const rows = useMemo(() => {
    const col = COLUMN_MAP[sort.key] ?? COLUMN_MAP.lastInteractionAt
    return [...visible].sort((a, b) => {
      if (sort.key === 'lastInteractionAt') {
        if (!a.lastInteractionAt) return b.lastInteractionAt ? 1 : 0
        if (!b.lastInteractionAt) return -1
      }
      const x = col.sortValue(a, ctx)
      const y = col.sortValue(b, ctx)
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir
    })
  }, [visible, sort, ctx])

  useEffect(() => {
    if (restoredScroll.current || archiveLoading) return
    const frame = requestAnimationFrame(() => {
      const table = wrapRef.current?.querySelector('.rich-table-wrap')
      if (table) {
        table.scrollTop = Number(searchParams.get('tableScroll')) || 0
        table.scrollLeft = Number(searchParams.get('tableX')) || 0
      }
      const board = wrapRef.current?.querySelector('.crm-board')
      if (board) board.scrollLeft = Number(searchParams.get('boardX')) || 0
      wrapRef.current?.querySelectorAll<HTMLElement>('.crm-column').forEach((column) => {
        column.scrollTop = Number(searchParams.get(`columnScroll_${column.dataset.status}`)) || 0
      })
      restoredScroll.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [archiveLoading, rows.length])

  const mobileKeys = ['company', 'status', 'nextAction', 'assignedTo']
  const shown = columns.map((k) => COLUMN_MAP[k]).filter(Boolean)
  const mobileShown = [...shown, ...mobileKeys.filter((key) => !columns.includes(key)).map((key) => COLUMN_MAP[key])]
  const open = visible.filter(isOpen)
  const totals = {
    open: open.reduce((s, l) => s + (l.budget ?? 0), 0),
    weighted: open.reduce((s, l) => s + weightedOf(l), 0),
    won: visible.filter((l) => l.status === 'WON').reduce((s, l) => s + (l.budget ?? 0), 0),
    idle: open.filter((l) => (daysSince(lastActivityOf(l), now) ?? 0) >= 7).length,
    late: open.filter((l) => isLate(l, now)).length,
  }

  const sources = useMemo(() => [...new Set(leads.map((l) => l.source).filter(Boolean) as string[])].sort(), [leads])
  const allOn = rows.length > 0 && rows.every((l) => selected.has(l._id))
  const filterCount = Object.entries(effective).filter(([, v]) => v).length

  const patchFilters = (patch: RichFilters) => {
    if ('project' in patch) onProjectChange(patch.project ?? '')
    else setFilters({ ...filters, ...patch })
    if (!('q' in patch)) {
      setBuiltin('')
      setActiveView(null)
    }
  }
  const applyBuiltin = (id: string) => {
    const v = BUILTIN_VIEWS.find((x) => x.id === id)
    setBuiltin(id)
    setActiveView(null)
    setFilters({ ...(v?.filters ?? {}), project: v?.filters.project ?? '' }, undefined, id === 'archived')
    setSelected(new Set())
  }
  const applySaved = (view: CrmView) => {
    setActiveView(view._id)
    setBuiltin('')
    setFilters({ ...view.filters, project: view.filters.project ?? '' }, view.sort, false)
    if (view.columns?.length) setColumns(view.columns.filter((k) => COLUMN_MAP[k]))
  }
  const toggleSort = (key: string) =>
    setSort(sort.key === key ? { key, dir: -sort.dir as 1 | -1 } : { key, dir: key === 'company' ? 1 : -1 })
  const toggleColumn = (key: string) =>
    setColumns((cols) =>
      cols.includes(key)
        ? cols.filter((k) => k !== key)
        : RICH_COLUMNS.map((c) => c.key).filter((k) => cols.includes(k) || k === key),
    )

  const saveView = async () => {
    const name = viewName.trim()
    if (!name) return
    try {
      const created = await createView({ name, scope: viewScope, filters: effective, columns, sort, mode: 'table' })
      setViews((v) => [...v, created])
      setActiveView(created._id)
      setBuiltin('')
      setSaving(false)
      setViewName('')
    } catch (err) {
      onError((err as Error).message || t('crmRich.views.saveError'))
    }
  }
  const removeView = async (view: CrmView) => {
    try {
      await deleteView(view._id)
      setViews((v) => v.filter((x) => x._id !== view._id))
      if (activeView === view._id) applyBuiltin('all')
    } catch (err) {
      onError((err as Error).message || t('crmRich.views.deleteError'))
    }
  }
  const saveColumnsInView = async () => {
    const view = views.find((v) => v._id === activeView)
    if (!view) return
    try {
      const updated = await updateView(view._id, { columns, sort, filters: effective })
      setViews((vs) => vs.map((x) => (x._id === updated._id ? updated : x)))
      setNotice(t('crmRich.views.columnsSaved', { name: view.name }))
    } catch (err) {
      onError((err as Error).message || t('crmRich.views.updateError'))
    }
  }

  const runBulk = useCallback(
    async (action: BulkAction, payload: Record<string, unknown> = {}) => {
      setBusy(true)
      try {
        const res = await bulkLeads([...selected], action, payload)
        setNotice(
          res.failed
            ? t('crmRich.bulk.resultPartial', { ok: res.ok, failed: res.failed })
            : t('crmRich.bulk.result', { ok: res.ok }),
        )
        setSelected(new Set())
        if (archived) {
          const succeeded = new Set(res.results?.filter((result) => result.ok).map((result) => result.id) ?? [])
          setArchivedLeads((items) => items.filter((lead) => !succeeded.has(lead._id)))
          setArchiveVersion((value) => value + 1)
        }
        await onReload()
      } catch (err) {
        onError((err as Error).message || t('crmRich.bulk.error'))
      } finally {
        setBusy(false)
        setPending(null)
      }
    },
    [selected, onReload, onError, t, archived],
  )

  const exportSelected = () => {
    const chosen = rows.filter((l) => selected.has(l._id))
    exportToCsv(
      'crm-leads.csv',
      shown.map((c) => t(c.labelKey)),
      chosen.map((l) => shown.map((c) => c.csv(l, ctx))),
    )
    setNotice(t('crmRich.export.done', { leads: chosen.length, columns: shown.length }))
  }

  useEffect(() => {
    if (!exportRef) return
    exportRef.current = () =>
      exportToCsv(
        'crm-leads.csv',
        shown.map((column) => t(column.labelKey)),
        rows.map((lead) => shown.map((column) => column.csv(lead, ctx))),
      )
    return () => {
      exportRef.current = null
    }
  }, [exportRef, rows, columns, ctx, t])

  const restoreOne = async (id: string) => {
    setBusy(true)
    try {
      const result = await bulkLeads([id], 'restore')
      if (result.failed) throw new Error(result.results.find((item) => !item.ok)?.error || t('crmRich.bulk.error'))
      setArchivedLeads((items) => items.filter((lead) => lead._id !== id))
      await onReload()
    } catch (error) {
      onError((error as Error).message || t('crmRich.bulk.error'))
    } finally {
      setBusy(false)
    }
  }

  const tags = useMemo(() => [...new Set(leads.flatMap((l) => l.tags ?? []))].sort(), [leads])

  return (
    <div className="rich-wrap" ref={wrapRef}>
      <button
        type="button"
        className="rich-link-btn rich-kpi-toggle"
        aria-expanded={kpisOpen}
        aria-controls="rich-kpis"
        onClick={toggleKpis}
      >
        {t('crmRich.kpi.aria')} {kpisOpen ? '−' : '+'}
      </button>
      {kpisOpen && (
        <section id="rich-kpis" className="rich-kpis" aria-label={t('crmRich.kpi.aria')}>
          {[
            [t('crmRich.kpi.open'), formatEuro(totals.open), t('crmRich.kpi.openHint', { count: open.length })],
            [t('crmRich.kpi.weighted'), formatEuro(totals.weighted), t('crmRich.kpi.weightedHint')],
            [
              t('crmRich.kpi.won'),
              formatEuro(totals.won),
              t('crmRich.kpi.wonHint', { count: visible.filter((l) => l.status === 'WON').length }),
            ],
            [t('crmRich.kpi.idle'), String(totals.idle), t('crmRich.kpi.idleHint')],
            [
              t('crmRich.kpi.late'),
              String(totals.late),
              totals.late ? t('crmRich.kpi.lateHint') : t('crmRich.kpi.upToDate'),
            ],
          ].map(([label, value, hint]) => (
            <div key={String(label)} className="rich-kpi">
              <small>{label}</small>
              <b>{value}</b>
              <em>{hint}</em>
            </div>
          ))}
        </section>
      )}

      <div className="rich-controls">
        <div className="rich-views">
          <select
            aria-label={t('crmRich.views.aria')}
            value={archived ? 'archived' : (activeView ?? (builtin === 'archived' ? 'all' : builtin))}
            onChange={(event) => {
              const saved = views.find((view) => view._id === event.target.value)
              if (saved) applySaved(saved)
              else applyBuiltin(event.target.value)
            }}
          >
            <option value="" disabled>
              {t('crmRich.views.aria')}
            </option>
            {BUILTIN_VIEWS.map((view) => (
              <option key={view.id} value={view.id}>
                {t(view.nameKey)}
              </option>
            ))}
            <option value="archived">{t('crmRich.view.archived')}</option>
            {views.map((view) => (
              <option key={view._id} value={view._id}>
                {view.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="portal-button secondary rich-btn"
            onClick={() => setSaving((value) => !value)}
            aria-expanded={saving}
            aria-label={t('crmRich.views.saveThis')}
            title={t('crmRich.views.saveThis')}
          >
            +
          </button>
          {activeView &&
            canManageCrm &&
            views
              .filter((view) => view._id === activeView && (view.owner === currentUserId || !currentUserId))
              .map((view) => (
                <button
                  key={view._id}
                  type="button"
                  className="rich-chip-x"
                  aria-label={t('crmRich.views.deleteAria', { name: view.name })}
                  onClick={() => removeView(view)}
                >
                  ×
                </button>
              ))}
        </div>

        <div className="rich-filters" role="search">
          {entityFilter}
          <label className="rich-search">
            <span className="rich-sr">{t('crmRich.filter.searchLabel')}</span>
            <input
              type="search"
              placeholder={t('crmRich.filter.searchPlaceholder')}
              value={filters.q ?? ''}
              onChange={(e) => patchFilters({ q: e.target.value })}
            />
          </label>
          <select
            aria-label={t('crmRich.filter.project')}
            value={project}
            onChange={(e) => patchFilters({ project: e.target.value })}
          >
            <option value="">{t('crmRich.filter.project')}</option>
            {CRM_PROJECTS.map((p) => (
              <option key={p.key} value={p.key}>
                {t(p.labelKey)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('crmRich.col.status')}
            value={filters.status ?? ''}
            onChange={(e) => patchFilters({ status: e.target.value })}
          >
            <option value="">{t('crm.filters.allStatuses')}</option>
            {CRM_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>
                {t(s.labelKey)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('crm.col.priority')}
            value={filters.priority ?? ''}
            onChange={(e) => patchFilters({ priority: e.target.value })}
          >
            <option value="">{t('crm.filters.allPriorities')}</option>
            {CRM_PRIORITIES.map((p) => (
              <option key={p.key} value={p.key}>
                {t(p.labelKey)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('crmRich.filter.owner')}
            value={filters.owner ?? ''}
            onChange={(e) => patchFilters({ owner: e.target.value })}
          >
            <option value="">{t('crmRich.filter.owner')}</option>
            <option value="none">{t('crmRich.filter.unassigned')}</option>
            {admins.map((a) => (
              <option key={a._id} value={a._id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t('crmRich.filter.source')}
            value={filters.source ?? ''}
            onChange={(e) => patchFilters({ source: e.target.value })}
          >
            <option value="">{t('crmRich.filter.source')}</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label={t('crmRich.filter.temperature')}
            value={filters.temperature ?? ''}
            onChange={(e) => patchFilters({ temperature: e.target.value })}
          >
            <option value="">{t('crmRich.filter.temperature')}</option>
            <option value="HOT">{t('crmRich.filter.hotAndAbove')}</option>
            {CRM_TEMPERATURES.map((x) => (
              <option key={x.key} value={x.key}>
                {t(x.labelKey)}
              </option>
            ))}
          </select>
          {tags.length > 0 && (
            <select
              aria-label={t('crmRich.filter.tag')}
              value={filters.tag ?? ''}
              onChange={(e) => patchFilters({ tag: e.target.value })}
            >
              <option value="">{t('crmRich.filter.tag')}</option>
              {tags.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          )}
          {filterCount > 0 && (
            <button type="button" className="rich-link-btn" onClick={() => applyBuiltin('all')}>
              {t('crmRich.filter.reset')}
            </button>
          )}
          <span className="rich-grow" />
          <div className="rich-cols" ref={colsRef}>
            <button
              type="button"
              className="portal-button secondary rich-btn"
              aria-haspopup="dialog"
              aria-expanded={colsOpen}
              onClick={() => setColsOpen((o) => !o)}
            >
              {t('crmRich.cols.button')}
            </button>
            {colsOpen &&
              createPortal(
                <div
                  ref={colsPanelRef}
                  style={colsPosition}
                  className="rich-colpn"
                  role="dialog"
                  aria-label={t('crmRich.cols.dialogAria')}
                >
                  <header>
                    <h3>{t('crmRich.cols.title')}</h3>
                    <button type="button" className="rich-link-btn" onClick={() => setColumns(DEFAULT_COLUMNS)}>
                      {t('crmRich.cols.default')}
                    </button>
                  </header>
                  <div className="rich-cl">
                    {COLUMN_GROUPS.map((g) => (
                      <fieldset key={g}>
                        <legend>{t(`crmRich.group.${g}`)}</legend>
                        {RICH_COLUMNS.filter((c) => c.group === g).map((c) => (
                          <label key={c.key} className={c.locked ? 'is-locked' : ''}>
                            <input
                              type="checkbox"
                              checked={columns.includes(c.key)}
                              disabled={c.locked}
                              onChange={() => toggleColumn(c.key)}
                            />
                            {t(c.labelKey)}
                          </label>
                        ))}
                      </fieldset>
                    ))}
                  </div>
                  <footer>
                    {activeView && (
                      <button type="button" className="portal-button secondary rich-btn" onClick={saveColumnsInView}>
                        {t('crmRich.cols.saveInView')}
                      </button>
                    )}
                    <button
                      type="button"
                      className="portal-button rich-btn rich-btn--primary"
                      onClick={() => setColsOpen(false)}
                    >
                      {t('crmRich.cols.done')}
                    </button>
                  </footer>
                </div>,
                document.body,
              )}
          </div>
        </div>
      </div>
      {saving && (
        <form
          className="rich-save"
          onSubmit={(e) => {
            e.preventDefault()
            void saveView()
          }}
        >
          <label>
            <span>{t('crmRich.views.name')}</span>
            <input value={viewName} onChange={(e) => setViewName(e.target.value)} maxLength={80} autoFocus />
          </label>
          <label>
            <span>{t('crmRich.views.visibility')}</span>
            <select value={viewScope} onChange={(e) => setViewScope(e.target.value as 'PRIVATE' | 'TEAM')}>
              <option value="PRIVATE">{t('crmRich.views.private')}</option>
              <option value="TEAM">{t('crmRich.views.team')}</option>
            </select>
          </label>
          <button type="submit" className="portal-button rich-btn rich-btn--primary" disabled={!viewName.trim()}>
            {t('crmRich.views.save')}
          </button>
          <button type="button" className="portal-button secondary rich-btn" onClick={() => setSaving(false)}>
            {t('common.cancel')}
          </button>
          <small>{t('crmRich.views.hint', { count: columns.length })}</small>
        </form>
      )}

      {notice && (
        <p className="rich-notice" role="status">
          {notice}
          <button type="button" aria-label={t('crmRich.close')} onClick={() => setNotice('')}>
            ×
          </button>
        </p>
      )}

      {renderBoard ? (
        renderBoard(rows)
      ) : (
        <div className="rich-table-wrap">
          <table className="rich-table" aria-label={t('crmRich.table.aria')}>
            <thead>
              <tr>
                {canManageCrm && (
                  <th className="rich-ck">
                    <input
                      type="checkbox"
                      aria-label={t('crmRich.table.selectAll')}
                      checked={allOn}
                      ref={(el) => {
                        if (el) el.indeterminate = !allOn && rows.some((l) => selected.has(l._id))
                      }}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((l) => l._id)) : new Set())}
                    />
                  </th>
                )}
                {shown.map((c, i) => (
                  <th
                    key={c.key}
                    className={`${c.align === 'right' ? 'is-r' : ''} ${i === 0 ? 'is-sticky' : ''}`}
                    aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
                  >
                    <button type="button" onClick={() => toggleSort(c.key)}>
                      {t(c.labelKey)}
                      <span aria-hidden="true">{sort.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(rows.length > 200 ? rows.slice(0, rowLimit) : rows).map((lead) => (
                <tr
                  key={lead._id}
                  className={`${selected.has(lead._id) ? 'is-sel' : ''} ${expandedRows.has(lead._id) ? 'is-expanded' : ''}`}
                  onClick={() => onOpenLead(lead)}
                >
                  {canManageCrm && (
                    <td className="rich-ck" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={t('crmRich.table.selectRow', { name: lead.company })}
                        checked={selected.has(lead._id)}
                        onChange={(e) =>
                          setSelected((s) => {
                            const next = new Set(s)
                            if (e.target.checked) next.add(lead._id)
                            else next.delete(lead._id)
                            return next
                          })
                        }
                      />
                    </td>
                  )}
                  {mobileShown.map((c) => (
                    <td
                      key={c.key}
                      data-key={c.key}
                      data-l={t(c.labelKey)}
                      className={`${c.align === 'right' ? 'is-r' : ''} ${c.key === 'company' ? 'is-sticky' : ''} ${mobileKeys.includes(c.key) ? 'rich-mobile-main' : 'rich-mobile-extra'} ${columns.includes(c.key) ? '' : 'rich-mobile-only'}`}
                    >
                      {c.key === 'company' ? (
                        <button
                          type="button"
                          className="rich-open"
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenLead(lead)
                          }}
                        >
                          {c.render(lead, ctx)}
                        </button>
                      ) : canManageCrm && onUpdateLead && ['status', 'priority', 'assignedTo'].includes(c.key) ? (
                        <select
                          className="rich-inline-select"
                          aria-label={`${t(c.labelKey)} — ${lead.company}`}
                          value={String(lead[c.key as 'status' | 'priority' | 'assignedTo'] || '')}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => void onUpdateLead(lead._id, { [c.key]: event.target.value || null })}
                        >
                          {c.key === 'assignedTo' ? (
                            <>
                              <option value="">{t('crm.common.unassigned')}</option>
                              {admins.map((admin) => (
                                <option key={admin._id} value={admin._id}>
                                  {admin.name}
                                </option>
                              ))}
                            </>
                          ) : (
                            <>
                              <option value="" disabled>
                                —
                              </option>
                              {(c.key === 'status' ? CRM_STATUSES : CRM_PRIORITIES).map((option) => (
                                <option key={option.key} value={option.key}>
                                  {t(option.labelKey)}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      ) : (
                        c.render(lead, ctx)
                      )}
                      {archived && c.key === 'company' && canManageCrm && (
                        <button
                          type="button"
                          className="portal-button secondary rich-btn"
                          disabled={busy}
                          onClick={(event) => {
                            event.stopPropagation()
                            void restoreOne(lead._id)
                          }}
                        >
                          {t('crmRich.bulk.restore')}
                        </button>
                      )}
                    </td>
                  ))}
                  <td className="rich-mobile-toggle" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="rich-link-btn"
                      aria-expanded={expandedRows.has(lead._id)}
                      onClick={() =>
                        setExpandedRows((rows) => {
                          const next = new Set(rows)
                          if (next.has(lead._id)) next.delete(lead._id)
                          else next.add(lead._id)
                          return next
                        })
                      }
                    >
                      {t(expandedRows.has(lead._id) ? 'crmRich.table.less' : 'crmRich.table.more')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {archiveLoading && <p role="status">{t('common.loading')}</p>}
          {rows.length > 200 && rowLimit < rows.length && (
            <button
              type="button"
              className="portal-button secondary rich-btn"
              onClick={() =>
                setSearchParams(
                  (params) => {
                    params.set('rows', String(rowLimit + 100))
                    return params
                  },
                  { replace: true },
                )
              }
            >
              {t('crmRich.table.showMore')}
            </button>
          )}
          {rows.length === 0 && <p className="rich-empty">{t('crmRich.table.empty')}</p>}
          <div className="rich-foot">
            <span>{t('crmRich.table.footCount', { leads: rows.length, columns: shown.length })}</span>
            <span>
              {t('crmRich.table.footTotals', { open: formatEuro(totals.open), weighted: formatEuro(totals.weighted) })}
            </span>
          </div>
        </div>
      )}

      {!renderBoard &&
        selected.size > 0 &&
        canManageCrm &&
        createPortal(
          <div className="rich-bulk" role="region" aria-label={t('crmRich.bulk.aria')}>
            <span className="rich-bulk-n">
              <b>{selected.size}</b> {t('crmRich.bulk.selected')}
            </span>
            {archived ? (
              <button
                type="button"
                className="portal-button secondary rich-btn"
                disabled={busy}
                onClick={() =>
                  setPending({ action: 'restore', label: t('crmRich.bulk.restoreConfirm', { count: selected.size }) })
                }
              >
                {t('crmRich.bulk.restore')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="portal-button secondary rich-btn"
                  disabled={busy}
                  onClick={() =>
                    setPending({ action: 'archive', label: t('crmRich.bulk.archiveConfirm', { count: selected.size }) })
                  }
                >
                  {t('crmRich.bulk.archive')}
                </button>
              </>
            )}
            <button
              type="button"
              className="portal-button secondary rich-btn"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((value) => !value)}
            >
              {t('crmRich.bulk.more')}
            </button>
            <button
              type="button"
              className="rich-x"
              aria-label={t('crmRich.bulk.clearAria')}
              onClick={() => setSelected(new Set())}
            >
              ×
            </button>
          </div>,
          document.body,
        )}

      {moreOpen &&
        selected.size > 0 &&
        createPortal(
          <div className="rich-bulk-more" role="region" aria-label={t('crmRich.bulk.more')}>
            <button type="button" className="rich-x" onClick={() => setMoreOpen(false)} aria-label={t('common.close')}>
              ×
            </button>
            <select
              aria-label={t('crmRich.bulk.assignAria')}
              value=""
              disabled={busy}
              onChange={(e) =>
                e.target.value &&
                setPending({
                  action: 'assign',
                  payload: { userId: e.target.value },
                  label: t('crmRich.bulk.assignConfirm', {
                    count: selected.size,
                    name: adminsById[e.target.value]?.name ?? '',
                  }),
                })
              }
            >
              <option value="">{t('crmRich.bulk.assignPlaceholder')}</option>
              {admins.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              aria-label={t('crmRich.bulk.statusAria')}
              value=""
              disabled={busy}
              onChange={(e) =>
                e.target.value &&
                setPending({
                  action: 'status',
                  payload: { status: e.target.value },
                  label: t('crmRich.bulk.statusConfirm', {
                    count: selected.size,
                    status: t(CRM_STATUSES.find((s) => s.key === e.target.value)!.labelKey),
                  }),
                })
              }
            >
              <option value="">{t('crmRich.bulk.statusPlaceholder')}</option>
              {CRM_STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {t(s.labelKey)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="portal-button secondary rich-btn"
              disabled={busy}
              onClick={() => {
                setTag('')
                setTagOpen(true)
              }}
            >
              {t('crmRich.bulk.tag')}
            </button>
            <button
              type="button"
              className="portal-button secondary rich-btn"
              disabled={busy}
              onClick={() => setEnrollOpen(true)}
            >
              {t('crmSeq.bulk.add')}
            </button>
            <button type="button" className="portal-button secondary rich-btn" onClick={exportSelected}>
              {t('crmRich.bulk.export')}
            </button>
            <button
              type="button"
              className="portal-button secondary rich-btn rich-btn--danger"
              disabled={busy}
              onClick={() =>
                setPending({ action: 'delete', label: t('crmRich.bulk.deleteConfirm', { count: selected.size }) })
              }
            >
              {t('crmRich.bulk.delete')}
            </button>
          </div>,
          document.body,
        )}

      {tagOpen && (
        <Dialog titleId="rich-tag-title" onClose={() => setTagOpen(false)}>
          <h3 id="rich-tag-title">{t('crmRich.bulk.tagPrompt')}</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (tag.trim() && !busy) void runBulk('tag', { tag: tag.trim() }).then(() => setTagOpen(false))
            }}
          >
            <input
              className="portal-input"
              aria-label={t('crmRich.bulk.tagPrompt')}
              maxLength={40}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              autoFocus
            />
            <div className="crm-auto-row">
              <button type="button" className="portal-button secondary rich-btn" onClick={() => setTagOpen(false)}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="portal-button secondary rich-btn" disabled={!tag.trim() || busy}>
                {t('crmRich.bulk.confirm')}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {enrollOpen && selected.size > 0 && (
        <EnrollDialog
          leadIds={[...selected]}
          leadLabels={Object.fromEntries(leads.filter((l) => selected.has(l._id)).map((l) => [l._id, l.company]))}
          onClose={() => setEnrollOpen(false)}
        />
      )}

      {pending &&
        createPortal(
          <div className="crm-rich-confirm">
            <ConfirmModal
              isOpen={pending !== null}
              title={t('crmRich.bulk.confirmTitle')}
              message={pending?.label ?? ''}
              confirmLabel={t('crmRich.bulk.confirm')}
              cancelLabel={t('crmRich.bulk.cancel')}
              variant={pending?.action === 'delete' ? 'danger' : 'info'}
              onConfirm={() => pending && void runBulk(pending.action, pending.payload)}
              onCancel={() => setPending(null)}
            />
          </div>,
          document.body,
        )}
    </div>
  )
}
