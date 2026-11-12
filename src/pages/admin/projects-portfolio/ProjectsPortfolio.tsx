import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../lib/api'
import { sensitiveActionHeaders } from '../../../lib/sensitiveActions'
import { useAuth } from '../../../context/AuthContext'
import { useToast } from '../../../context/ToastContext'
import ConfirmModal from '../../../components/ConfirmModal'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import { formatMoney } from '../../../i18n/format'
import {
  applyFilters,
  BUILTIN_VIEWS,
  dueLabel,
  EMPTY_FILTERS,
  riskLabel,
  sameFilters,
  shortDate,
  type Filters,
  type PortfolioItem,
  type PortfolioOverview,
  type ProjectAction,
  type SavedView,
  type SortKey,
} from './portfolio'
import './ProjectsPortfolio.css'

type BulkAction = 'archive' | 'unarchive' | 'set-status' | 'set-assignee' | 'delete'
interface Admin {
  _id: string
  name: string
}

const STATUS_LABEL_KEY = {
  EN_COURS: 'status.inProgress',
  EN_ATTENTE: 'status.pending',
  TERMINE: 'status.completed',
} as const satisfies Record<string, MessageKey>
const STATUS_TONE = { EN_COURS: 'sky', EN_ATTENTE: 'amber', TERMINE: 'mint' } as const
const ACTION_LABEL_KEY: Record<ProjectAction, MessageKey> = {
  POSTPONE: 'portfolio.action.postpone',
  REMIND_CLIENT: 'portfolio.action.remindClient',
  REASSIGN: 'portfolio.action.reassign',
  RESUME: 'portfolio.action.resume',
  INVOICE: 'portfolio.action.invoice',
  ARCHIVE: 'portfolio.action.archive',
}
const PRIORITY_LABEL_KEY: Record<PortfolioItem['priority'], MessageKey> = {
  URGENTE: 'portfolio.priority.URGENTE',
  HAUTE: 'portfolio.priority.HAUTE',
  NORMALE: 'portfolio.priority.NORMALE',
  BASSE: 'portfolio.priority.BASSE',
}

const money = (n: number | null) => (n == null ? '' : formatMoney(Math.round(n), 'EUR', { maximumFractionDigits: 0 }))
const initials = (name?: string) =>
  (name ?? '')
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

export default function ProjectsPortfolio() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { showToast } = useToast()
  const meId = user?._id
  const [data, setData] = useState<PortfolioOverview | null>(null)
  const [error, setError] = useState(false)
  const [views, setViews] = useState<SavedView[]>([])
  const [admins, setAdmins] = useState<Admin[]>([])
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [savingView, setSavingView] = useState<string | null>(null)
  const [inline, setInline] = useState<{ id: string; kind: 'POSTPONE' | 'REASSIGN' } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    apiFetch<PortfolioOverview>('/api/admin/projects/overview')
      .then((d) => {
        if (!Array.isArray(d?.items)) throw new Error('invalid overview')
        setData(d)
        setError(false)
      })
      .catch(() => setError(true))
  }, [])
  const loadViews = useCallback(() => {
    apiFetch<{ views: SavedView[] }>('/api/admin/projects/views')
      .then((r) => setViews(r.views))
      .catch(() => {})
  }, [])
  useEffect(() => {
    load()
    loadViews()
    apiFetch<{ users: Admin[] }>('/api/admin/admins')
      .then((r) => setAdmins(r.users || []))
      .catch(() => {})
  }, [load, loadViews])

  const rows = useMemo(() => (data ? applyFilters(data.items, filters, meId) : []), [data, filters, meId])
  const visibleIds = useMemo(() => new Set(rows.map((r) => r._id)), [rows])
  const picked = useMemo(() => [...selected].filter((id) => visibleIds.has(id)), [selected, visibleIds])
  const allPicked = rows.length > 0 && picked.length === rows.length

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    if (!data) return c
    for (const v of BUILTIN_VIEWS) c[v.id] = applyFilters(data.items, v.filters, meId).length
    return c
  }, [data, meId])

  const bulk = async (action: BulkAction, ids: string[], value?: string | null, confirmed = false) => {
    if (!ids.length || busy) return
    setBusy(true)
    try {
      const res = await apiFetch<{
        succeeded: number
        failed: number
        results: { id: string; ok: boolean; error?: string }[]
      }>('/api/admin/projects/bulk', {
        method: 'POST',
        headers: confirmed ? sensitiveActionHeaders('PROJECT_DELETE') : undefined,
        body: JSON.stringify({ action, ids, value }),
      })
      if (res.failed) {
        const first = res.results.find((r) => !r.ok)
        showToast(
          t('portfolio.toast.partial', {
            ok: res.succeeded,
            failed: res.failed,
            error: first?.error ?? t('portfolio.toast.unknownError'),
          }),
          'error',
        )
      } else {
        showToast(t('portfolio.toast.updated', { count: res.succeeded }), 'success')
      }
      setSelected(new Set())
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('portfolio.toast.actionFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const postpone = async (id: string, date: string) => {
    if (!date) return
    try {
      await apiFetch(`/api/admin/projects/${id}`, { method: 'PATCH', body: JSON.stringify({ endDate: date }) })
      showToast(t('portfolio.toast.postponed'), 'success')
      setInline(null)
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('portfolio.toast.actionFailed'), 'error')
    }
  }

  const saveView = async (name: string) => {
    if (!name.trim()) return
    try {
      await apiFetch('/api/admin/projects/views', { method: 'POST', body: JSON.stringify({ name, filters }) })
      setSavingView(null)
      loadViews()
    } catch (err) {
      showToast(err instanceof Error ? err.message : t('portfolio.toast.viewNotSaved'), 'error')
    }
  }
  const deleteView = async (id: string) => {
    await apiFetch(`/api/admin/projects/views/${id}`, { method: 'DELETE' }).catch(() => {})
    loadViews()
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (error)
    return (
      <p role="alert">
        {t('portfolio.loadError')}{' '}
        <button type="button" className="pf-link" onClick={load}>
          {t('portfolio.retry')}
        </button>
      </p>
    )
  if (!data) return <p role="status">{t('portfolio.loading')}</p>

  const { pulse } = data
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const doAction = (item: PortfolioItem, a: ProjectAction) => {
    if (a === 'POSTPONE' || a === 'REASSIGN') return setInline({ id: item._id, kind: a })
    if (a === 'RESUME') return bulk('set-status', [item._id], 'EN_COURS')
    if (a === 'ARCHIVE') return bulk('archive', [item._id])
  }

  return (
    <div className="pf">
      <p className="pf-lead" aria-live="polite">
        <strong className={pulse.late ? 'pf-neg' : ''}>{t('portfolio.lead.late', { count: pulse.late })}</strong>
        {t('portfolio.lead.rest', { atRisk: pulse.atRisk, active: pulse.active, due: pulse.dueIn7Days })}
        {pulse.toBill ? t('portfolio.lead.toBill', { count: pulse.toBill }) : ''}
      </p>

      <section className="pf-card pf-pulse" aria-label={t('portfolio.pulse.aria')}>
        <Pulse
          label={t('portfolio.pulse.active')}
          value={pulse.active}
          sub={t('portfolio.pulse.activeSub', { total: pulse.total, done: pulse.done })}
        />
        <Pulse
          label={t('portfolio.pulse.late')}
          value={pulse.late}
          hot={pulse.late > 0}
          sub={t('portfolio.pulse.atRisk', { count: pulse.atRisk })}
        />
        <Pulse
          label={t('portfolio.pulse.due7')}
          value={pulse.dueIn7Days}
          sub={t('portfolio.pulse.due48', { count: pulse.dueIn48h })}
        />
        <Pulse
          label={t('portfolio.pulse.budget')}
          isNew
          value={pulse.budget.pct == null ? '—' : `${pulse.budget.pct} %`}
          sub={
            pulse.budget.total
              ? t('portfolio.pulse.budgetSub', {
                  invoiced: money(pulse.budget.invoiced),
                  total: money(pulse.budget.total),
                })
              : t('portfolio.pulse.noBudget')
          }
          meter={pulse.budget.pct}
        />
        <Pulse
          label={t('portfolio.pulse.load')}
          isNew
          value={pulse.load.pct == null ? '—' : `${pulse.load.pct} %`}
          sub={
            pulse.load.overloaded
              ? t('portfolio.pulse.overloaded', { count: pulse.load.overloaded })
              : t('portfolio.pulse.withinCapacity')
          }
          meter={pulse.load.pct}
        />
      </section>

      <div className="pf-grid">
        <div className="pf-col">
          <section className="pf-card pf-queue" aria-label={t('portfolio.queue.title')}>
            <header className="pf-card-h">
              <h2>
                {t('portfolio.queue.title')}{' '}
                <span className={`pf-count ${data.queue.length ? 'hot' : ''}`}>{data.queue.length}</span>
              </h2>
            </header>
            {data.queue.length === 0 ? (
              <p className="pf-empty">{t('portfolio.queue.empty')}</p>
            ) : (
              <ul>
                {data.queue.map((item) => (
                  <li key={item._id} className="pf-q">
                    <div className="pf-q-t">
                      <Link to={`/admin/projets/${item._id}`}>{item.name}</Link>
                      <span>
                        {item.client?.name ?? '—'}
                        {item.assignedTo ? ` · ${item.assignedTo.name}` : ''}
                      </span>
                      <div className="pf-why">
                        {item.risks
                          .filter((r) => r.code !== 'WAITING_CLIENT' || item.risks.length === 1)
                          .map((r) => {
                            const l = riskLabel(r, item)
                            return (
                              <span key={r.code} className={`pf-chip ${l.tone}`}>
                                {l.text}
                              </span>
                            )
                          })}
                      </div>
                    </div>
                    <div className="pf-q-a">
                      {inline?.id === item._id && inline.kind === 'POSTPONE' ? (
                        <PostponeForm onSubmit={(d) => postpone(item._id, d)} onCancel={() => setInline(null)} />
                      ) : inline?.id === item._id && inline.kind === 'REASSIGN' ? (
                        <select
                          className="pf-sel"
                          aria-label={t('portfolio.queue.newOwnerAria', { name: item.name })}
                          defaultValue=""
                          onChange={(e) => {
                            if (e.target.value)
                              bulk('set-assignee', [item._id], e.target.value).then(() => setInline(null))
                          }}
                        >
                          <option value="" disabled>
                            {t('portfolio.queue.choose')}
                          </option>
                          {admins.map((a) => (
                            <option key={a._id} value={a._id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        item.actions.map((a, idx) =>
                          a === 'REMIND_CLIENT' || a === 'INVOICE' ? (
                            <Link
                              key={a}
                              to={`/admin/projets/${item._id}`}
                              className={`pf-btn ${idx === 0 ? 'primary' : ''}`}
                            >
                              {t(ACTION_LABEL_KEY[a])}
                            </Link>
                          ) : (
                            <button
                              key={a}
                              type="button"
                              className={`pf-btn ${idx === 0 ? 'primary' : ''}`}
                              onClick={() => doAction(item, a)}
                            >
                              {t(ACTION_LABEL_KEY[a])}
                            </button>
                          ),
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pf-card" aria-label={t('portfolio.clients.title')}>
            <header className="pf-card-h">
              <h2>{t('portfolio.clients.title')}</h2>
            </header>
            <div className="pf-views" role="group" aria-label={t('portfolio.views.aria')}>
              {BUILTIN_VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="pf-flt"
                  aria-pressed={sameFilters(filters, v.filters)}
                  onClick={() => setFilters(v.filters)}
                >
                  {t(v.labelKey)} <span className="pf-count">{counts[v.id] ?? 0}</span>
                </button>
              ))}
              {views.map((v) => (
                <span key={v._id} className="pf-view-wrap">
                  <button
                    type="button"
                    className="pf-flt"
                    aria-pressed={sameFilters(filters, { ...EMPTY_FILTERS, ...v.filters })}
                    onClick={() => setFilters({ ...EMPTY_FILTERS, ...v.filters })}
                  >
                    {v.name}
                    {v.shared ? t('portfolio.views.shared') : ''}
                  </button>
                  {v.mine && (
                    <button
                      type="button"
                      className="pf-x"
                      aria-label={t('portfolio.views.deleteAria', { name: v.name })}
                      onClick={() => deleteView(v._id)}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {savingView === null ? (
                <button type="button" className="pf-flt add" onClick={() => setSavingView('')}>
                  {t('portfolio.views.save')}
                </button>
              ) : (
                <form
                  className="pf-inline"
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveView(savingView)
                  }}
                >
                  <input
                    className="pf-input"
                    autoFocus
                    aria-label={t('portfolio.views.name')}
                    maxLength={60}
                    value={savingView}
                    onChange={(e) => setSavingView(e.target.value)}
                    placeholder={t('portfolio.views.name')}
                  />
                  <button type="submit" className="pf-btn primary">
                    {t('portfolio.views.ok')}
                  </button>
                  <button type="button" className="pf-btn" onClick={() => setSavingView(null)}>
                    {t('common.cancel')}
                  </button>
                </form>
              )}
            </div>

            <div className="pf-fbar">
              <input
                className="pf-input"
                type="search"
                aria-label={t('portfolio.filter.searchAria')}
                placeholder={t('portfolio.filter.searchPlaceholder')}
                value={filters.q}
                onChange={(e) => set('q', e.target.value)}
              />
              <select
                className="pf-sel"
                aria-label={t('portfolio.filter.status')}
                value={filters.status}
                onChange={(e) => set('status', e.target.value)}
              >
                <option value="">{t('portfolio.filter.statusAll')}</option>
                <option value="EN_COURS">{t('status.inProgress')}</option>
                <option value="EN_ATTENTE">{t('status.pending')}</option>
                <option value="TERMINE">{t('status.completed')}</option>
              </select>
              <select
                className="pf-sel"
                aria-label={t('portfolio.filter.owner')}
                value={filters.assignedTo}
                onChange={(e) => set('assignedTo', e.target.value)}
              >
                <option value="">{t('portfolio.filter.ownerAll')}</option>
                {admins.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select
                className="pf-sel"
                aria-label={t('portfolio.filter.priority')}
                value={filters.priority}
                onChange={(e) => set('priority', e.target.value)}
              >
                <option value="">{t('portfolio.filter.priorityAll')}</option>
                <option value="URGENTE">{t('portfolio.priority.URGENTE')}</option>
                <option value="HAUTE">{t('portfolio.priority.HAUTE')}</option>
                <option value="NORMALE">{t('portfolio.priority.NORMALE')}</option>
                <option value="BASSE">{t('portfolio.priority.BASSE')}</option>
              </select>
              <select
                className="pf-sel"
                aria-label={t('portfolio.filter.sort')}
                value={filters.sort}
                onChange={(e) => set('sort', e.target.value as SortKey)}
              >
                <option value="urgency">{t('portfolio.filter.sortUrgency')}</option>
                <option value="dueDate">{t('portfolio.filter.sortDue')}</option>
                <option value="budget">{t('portfolio.filter.sortBudget')}</option>
                <option value="name">{t('portfolio.filter.sortName')}</option>
              </select>
            </div>

            <div className="pf-table" role="table" aria-label={t('portfolio.table.aria')}>
              <div className="pf-th" role="row">
                <input
                  type="checkbox"
                  className="pf-chk"
                  aria-label={t('bulk.selectAll')}
                  checked={allPicked}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r._id)) : new Set())}
                />
                <span>{t('portfolio.table.project')}</span>
                <span>{t('portfolio.table.status')}</span>
                <span className="pf-h-prog">{t('portfolio.table.progress')}</span>
                <span>{t('portfolio.table.due')}</span>
                <span>{t('portfolio.table.budget')}</span>
                <span>{t('portfolio.table.owner')}</span>
              </div>
              {rows.length === 0 && <p className="pf-empty">{t('portfolio.table.empty')}</p>}
              {rows.map((i) => {
                const on = selected.has(i._id)
                const tone = STATUS_TONE[i.status]
                const dueTone =
                  i.overdueDays > 0
                    ? 'late'
                    : i.daysToDue !== null && i.daysToDue <= 7 && i.status !== 'TERMINE'
                      ? 'soon'
                      : ''
                const budTone = i.budgetPct == null ? '' : i.budgetPct > 100 ? 'bad' : i.budgetPct >= 85 ? 'warn' : ''
                return (
                  <div key={i._id} className="pf-tr" role="row" aria-selected={on}>
                    <input
                      type="checkbox"
                      className="pf-chk"
                      aria-label={t('portfolio.table.selectRow', { name: i.name })}
                      checked={on}
                      onChange={() => toggle(i._id)}
                    />
                    <div className="pf-cell-n">
                      <Link to={`/admin/projets/${i._id}`}>{i.name}</Link>
                      <span>
                        {[
                          i.client?.name,
                          i.priority !== 'NORMALE' ? t(PRIORITY_LABEL_KEY[i.priority]).toLowerCase() : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <div className="pf-cell-st">
                      <span className={`pf-chip dot ${i.overdueDays > 0 ? 'rose' : tone}`}>
                        {i.overdueDays > 0 ? t('portfolio.late') : t(STATUS_LABEL_KEY[i.status])}
                      </span>
                    </div>
                    <div className="pf-cell-pr">
                      <span className="pf-mono">{i.progress} %</span>
                      <div className="pf-meter">
                        <i style={{ width: `${i.progress}%` }} />
                      </div>
                    </div>
                    <div className={`pf-cell-d ${dueTone}`}>{dueLabel(i)}</div>
                    <div className={`pf-cell-b ${budTone}`}>
                      {i.budgetPct == null ? '—' : `${i.budgetPct} %`}
                      {i.budget.amount ? <small>{money(i.budget.amount)}</small> : null}
                    </div>
                    <div className="pf-cell-r">
                      {i.assignedTo ? (
                        <span className="pf-av" title={i.assignedTo.name}>
                          {initials(i.assignedTo.name)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {picked.length > 0 && (
              <div className="pf-bulk" role="region" aria-label={t('bulk.toolbar')}>
                <span className="pf-bulk-n">{t('portfolio.bulk.selected', { count: picked.length })}</span>
                <select
                  className="pf-sel"
                  aria-label={t('portfolio.bulk.changeStatus')}
                  value=""
                  disabled={busy}
                  onChange={(e) => e.target.value && bulk('set-status', picked, e.target.value)}
                >
                  <option value="">{t('portfolio.bulk.statusPlaceholder')}</option>
                  <option value="EN_COURS">{t('status.inProgress')}</option>
                  <option value="EN_ATTENTE">{t('status.pending')}</option>
                  <option value="TERMINE">{t('status.completed')}</option>
                </select>
                <select
                  className="pf-sel"
                  aria-label={t('portfolio.bulk.changeOwner')}
                  value=""
                  disabled={busy}
                  onChange={(e) => e.target.value && bulk('set-assignee', picked, e.target.value)}
                >
                  <option value="">{t('portfolio.bulk.ownerPlaceholder')}</option>
                  {admins.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <button type="button" className="pf-btn" disabled={busy} onClick={() => bulk('archive', picked)}>
                  {t('bulk.action.archive')}
                </button>
                <button type="button" className="pf-btn danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  {t('bulk.action.delete')}
                </button>
                <button
                  type="button"
                  className="pf-x"
                  aria-label={t('bulk.clear')}
                  onClick={() => setSelected(new Set())}
                >
                  ×
                </button>
              </div>
            )}
            <div className="pf-foot">
              <span>{t('portfolio.foot.count', { shown: rows.length, total: data.items.length })}</span>
              <span className="pf-mono">{t('portfolio.foot.formula')}</span>
            </div>
          </section>
        </div>

        <div className="pf-col pf-side">
          <section className="pf-card" aria-label={t('portfolio.upcoming.aria')}>
            <header className="pf-card-h">
              <h2>
                {t('portfolio.upcoming.title')} <span className="pf-new">{t('portfolio.new')}</span>
              </h2>
            </header>
            {data.upcoming.length === 0 ? (
              <p className="pf-empty">{t('portfolio.upcoming.empty')}</p>
            ) : (
              <ul className="pf-tl">
                {data.upcoming.map((u) => (
                  <li key={u._id}>
                    <time className={u.overdueDays > 0 ? 'pf-neg' : ''}>
                      {u.overdueDays > 0 ? t('portfolio.due.overdue', { count: u.overdueDays }) : shortDate(u.endDate)}
                    </time>
                    <div>
                      <Link to={`/admin/projets/${u._id}`}>{u.name}</Link>
                      <span>{u.assignedTo?.name ?? t('portfolio.unassigned')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="pf-card" aria-label={t('portfolio.workload.title')}>
            <header className="pf-card-h">
              <h2>
                {t('portfolio.workload.title')} <span className="pf-new">{t('portfolio.new')}</span>
              </h2>
            </header>
            {data.workload.length === 0 ? (
              <p className="pf-empty">{t('portfolio.workload.empty')}</p>
            ) : (
              <ul className="pf-load">
                {data.workload.map((w) => (
                  <li key={w._id}>
                    <span className="pf-av">{initials(w.name)}</span>
                    <div>
                      <b>{w.name}</b>
                      <span>{t('portfolio.workload.counts', { projects: w.projects, tasks: w.openTasks })}</span>
                      <div className={`pf-meter ${w.loadPct > 100 ? 'bad' : w.loadPct >= 85 ? 'warn' : ''}`}>
                        <i style={{ width: `${Math.min(100, w.loadPct)}%` }} />
                      </div>
                    </div>
                    <span className={`pf-mono ${w.loadPct > 100 ? 'pf-neg' : ''}`}>{w.loadPct} %</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDelete}
        title={t('portfolio.delete.title')}
        message={t('portfolio.delete.message', { count: picked.length })}
        confirmLabel={t('bulk.action.delete')}
        variant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          bulk('delete', picked, null, true)
        }}
      />
    </div>
  )
}

function Pulse({
  label,
  value,
  sub,
  hot,
  isNew,
  meter,
}: {
  label: string
  value: number | string
  sub: string
  hot?: boolean
  isNew?: boolean
  meter?: number | null
}) {
  const { t } = useI18n()
  return (
    <div className={`pf-pc ${hot ? 'hot' : ''}`}>
      <span className="pf-pc-l">
        {label} {isNew && <span className="pf-new">{t('portfolio.new')}</span>}
      </span>
      <span className="pf-pc-v">{value}</span>
      <span className="pf-pc-s">{sub}</span>
      {meter != null && (
        <div className={`pf-meter ${meter > 100 ? 'bad' : meter >= 85 ? 'warn' : ''}`}>
          <i style={{ width: `${Math.min(100, meter)}%` }} />
        </div>
      )}
    </div>
  )
}

function PostponeForm({ onSubmit, onCancel }: { onSubmit: (date: string) => void; onCancel: () => void }) {
  const { t } = useI18n()
  const [date, setDate] = useState('')
  return (
    <form
      className="pf-inline"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(date)
      }}
    >
      <input
        className="pf-input"
        type="date"
        aria-label={t('portfolio.postpone.newDate')}
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
      />
      <button type="submit" className="pf-btn primary">
        {t('portfolio.views.ok')}
      </button>
      <button type="button" className="pf-btn" onClick={onCancel}>
        {t('common.cancel')}
      </button>
    </form>
  )
}
