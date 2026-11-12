import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import type { MessageKey } from '../../../../i18n'
import { formatDateTime } from '../../../../i18n/format'
import { approveRun, fetchRuns, rejectRun, retryRun } from './api'
import {
  RUN_STATUS_COLORS,
  actionLabel,
  runStatusLabel,
  triggerLabel,
  formatDuration,
  formatRelative,
  type CrmRuleRun,
  type RunStep,
} from './types'

export type JournalFilter = 'all' | 'OK' | 'ERR' | 'SKIP' | 'SIM' | 'PENDING'

const FILTERS: Array<{ key: JournalFilter; labelKey: MessageKey }> = [
  { key: 'all', labelKey: 'crmAuto.journal.filter.all' },
  { key: 'OK', labelKey: 'crmAuto.journal.filter.OK' },
  { key: 'ERR', labelKey: 'crmAuto.journal.filter.ERR' },
  { key: 'SKIP', labelKey: 'crmAuto.journal.filter.SKIP' },
  { key: 'SIM', labelKey: 'crmAuto.journal.filter.SIM' },
  { key: 'PENDING', labelKey: 'crmAuto.journal.filter.PENDING' },
]
const PAGE_SIZE = 50

interface RunsJournalProps {
  canAdminister: boolean
  filter: JournalFilter
  onFilterChange: (filter: JournalFilter) => void
  /** Incrémenté par le parent quand les données ont pu changer. */
  version: number
  onChanged: (message: string) => void
  onError: (message: string) => void
}

const stepLabel = (step: RunStep) => step.message || actionLabel(step.action)

function RunRow({
  run,
  open,
  onToggle,
  onAct,
  busy,
  canAdminister,
}: {
  run: CrmRuleRun
  canAdminister: boolean
  open: boolean
  onToggle: () => void
  onAct: (kind: 'approve' | 'reject' | 'retry', run: CrmRuleRun) => void
  busy: boolean
}) {
  const { t } = useI18n()
  const lockTitle = canAdminister ? undefined : t('crmAuto.adminOnly')
  const panelId = `crm-auto-run-${run._id}`
  const base = new Date(run.createdAt).getTime()
  const pendingStep = run.steps.find((s) => s.status === 'PENDING' && s.payload)
  const payload = pendingStep?.payload as { to?: string; subject?: string; body?: string } | undefined
  return (
    <li className="crm-auto-run" data-testid={`run-${run._id}`}>
      <button type="button" className="crm-auto-run-h" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span
          className="crm-auto-when"
          title={formatDateTime(run.createdAt, { dateStyle: 'short', timeStyle: 'medium' })}
        >
          {formatRelative(run.createdAt)}
        </span>
        <b>{run.ruleName || t('crmAuto.journal.deletedRule')}</b>
        <span>{run.leadLabel || '—'}</span>
        <span className="crm-auto-acts">
          {run.steps.map((s, i) => (
            <span key={i} className={s.status === 'ERR' || s.status === 'SKIP' ? 'ko' : ''}>
              {stepLabel(s)}
            </span>
          ))}
        </span>
        <span className="crm-auto-st" style={{ ['--c' as string]: RUN_STATUS_COLORS[run.status] }}>
          <i />
          {runStatusLabel(run.status)}
        </span>
      </button>
      {open && (
        <div className="crm-auto-det" id={panelId}>
          <b>{t('crmAuto.journal.trigger', { name: triggerLabel(run.trigger) })}</b>
          <ul>
            {run.steps.map((s, i) => {
              const at = new Date(s.at).getTime()
              return (
                <li key={i}>
                  <time dateTime={s.at}>{Number.isNaN(at - base) ? '' : `+${Math.max(0, at - base)} ms`}</time>
                  <span>
                    {actionLabel(s.action)} · {s.message || runStatusLabel(s.status)}
                  </span>
                </li>
              )
            })}
          </ul>
          {payload && (
            <>
              <span className="crm-auto-lb">
                {t('crmAuto.journal.emailToApprove')}
                {payload.to ? ` · ${payload.to}` : ''}
              </span>
              <pre>{`${payload.subject ?? ''}\n\n${payload.body ?? ''}`.trim()}</pre>
            </>
          )}
          <div className="crm-auto-det-actions">
            {run.status === 'PENDING' && (
              <>
                <button
                  type="button"
                  className="crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm"
                  disabled={busy || !canAdminister}
                  title={lockTitle}
                  onClick={() => onAct('approve', run)}
                >
                  {t('crmAuto.journal.approve')}
                </button>
                <button
                  type="button"
                  className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
                  disabled={busy || !canAdminister}
                  title={lockTitle}
                  onClick={() => onAct('reject', run)}
                >
                  {t('crmAuto.journal.reject')}
                </button>
              </>
            )}
            {run.status === 'ERR' && (
              <button
                type="button"
                className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
                disabled={busy || !canAdminister}
                title={lockTitle}
                onClick={() => onAct('retry', run)}
              >
                {t('crmAuto.journal.retryRun')}
              </button>
            )}
            {run.status !== 'PENDING' && run.status !== 'ERR' && (
              <span className="crm-auto-note">
                {t('crmAuto.journal.duration', { duration: formatDuration(run.durationMs) })}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  )
}

export default function RunsJournal({
  canAdminister,
  filter,
  onFilterChange,
  version,
  onChanged,
  onError,
}: RunsJournalProps) {
  const { t } = useI18n()
  const [items, setItems] = useState<CrmRuleRun[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const seq = useRef(0)

  const load = useCallback(
    async (nextPage: number, append: boolean) => {
      const mine = ++seq.current
      setLoading(true)
      try {
        const res = await fetchRuns({ status: filter, page: nextPage, pageSize: PAGE_SIZE })
        if (mine !== seq.current) return
        setItems((prev) => (append ? [...prev, ...res.items] : res.items))
        setTotal(res.total)
        setPage(nextPage)
        setError(null)
      } catch (e) {
        if (mine !== seq.current) return
        setError(e instanceof Error ? e.message : t('crmAuto.journal.unavailable'))
      } finally {
        if (mine === seq.current) setLoading(false)
      }
    },
    [filter, t],
  )

  useEffect(() => {
    void load(1, false)
  }, [load, version])

  const act = async (kind: 'approve' | 'reject' | 'retry', run: CrmRuleRun) => {
    if (!canAdminister) return
    setBusyId(run._id)
    try {
      if (kind === 'approve') await approveRun(run._id)
      else if (kind === 'reject') await rejectRun(run._id)
      else await retryRun(run._id)
      onChanged(
        kind === 'approve'
          ? t('crmAuto.journal.approved')
          : kind === 'reject'
            ? t('crmAuto.journal.rejected')
            : t('crmAuto.journal.retried'),
      )
    } catch (e) {
      onError(e instanceof Error ? e.message : t('crmAuto.journal.actionError'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="crm-auto-filters" role="group" aria-label={t('crmAuto.journal.filterAria')}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className="crm-auto-chip"
            aria-pressed={filter === f.key}
            onClick={() => onFilterChange(f.key)}
          >
            {t(f.labelKey)}
            {filter === f.key && !loading && (
              <b className="crm-auto-note" style={{ fontFamily: 'var(--mono)' }}>
                {total}
              </b>
            )}
          </button>
        ))}
      </div>
      <div className="crm-auto-glass">
        {error ? (
          <div className="crm-auto-notice crm-auto-notice--err" role="alert" style={{ margin: 12 }}>
            <span>{error}</span>
            <button
              type="button"
              className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
              onClick={() => void load(1, false)}
            >
              {t('crmAuto.retry')}
            </button>
          </div>
        ) : loading && items.length === 0 ? (
          <p className="crm-auto-empty" role="status">
            {t('crmAuto.journal.loading')}
          </p>
        ) : items.length === 0 ? (
          <p className="crm-auto-empty">{t('crmAuto.journal.empty')}</p>
        ) : (
          <ul className="crm-auto-runs" aria-label={t('crmAuto.journal.listAria')}>
            {items.map((run) => (
              <RunRow
                key={run._id}
                run={run}
                canAdminister={canAdminister}
                open={openId === run._id}
                busy={busyId === run._id}
                onToggle={() => setOpenId(openId === run._id ? null : run._id)}
                onAct={(k, r) => void act(k, r)}
              />
            ))}
          </ul>
        )}
        <div className="crm-auto-foot">
          <span>{t('crmAuto.journal.retention')}</span>
          {items.length < total && (
            <button
              type="button"
              className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm"
              disabled={loading}
              onClick={() => void load(page + 1, true)}
            >
              {t('crmAuto.journal.loadMore', { loaded: items.length, total })}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
