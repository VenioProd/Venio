import { useCallback, useEffect, useRef, useState } from 'react'
import { approveRun, fetchRuns, rejectRun, retryRun } from './api'
import {
  ACTION_LABELS,
  RUN_STATUS_COLORS,
  RUN_STATUS_LABELS,
  TRIGGER_LABELS,
  formatDuration,
  formatRelative,
  type ActionType,
  type CrmRuleRun,
  type RunStep,
  type TriggerType,
} from './types'

export type JournalFilter = 'all' | 'OK' | 'ERR' | 'SKIP' | 'SIM' | 'PENDING'

const FILTERS: Array<{ key: JournalFilter; label: string }> = [
  { key: 'all', label: 'Tout' },
  { key: 'OK', label: 'Succès' },
  { key: 'ERR', label: 'Erreurs' },
  { key: 'SKIP', label: 'Ignorées' },
  { key: 'SIM', label: 'Simulations' },
  { key: 'PENDING', label: 'À valider' },
]
const PAGE_SIZE = 50

interface RunsJournalProps {
  filter: JournalFilter
  onFilterChange: (filter: JournalFilter) => void
  /** Incrémenté par le parent quand les données ont pu changer. */
  version: number
  onChanged: (message: string) => void
  onError: (message: string) => void
}


const stepLabel = (step: RunStep) => step.message || ACTION_LABELS[step.action as ActionType] || step.action

function RunRow({ run, open, onToggle, onAct, busy }: {
  run: CrmRuleRun
  open: boolean
  onToggle: () => void
  onAct: (kind: 'approve' | 'reject' | 'retry', run: CrmRuleRun) => void
  busy: boolean
}) {
  const panelId = `crm-auto-run-${run._id}`
  const base = new Date(run.createdAt).getTime()
  const pendingStep = run.steps.find((s) => s.status === 'PENDING' && s.payload)
  const payload = pendingStep?.payload as { to?: string; subject?: string; body?: string } | undefined
  return (
    <li className="crm-auto-run" data-testid={`run-${run._id}`}>
      <button type="button" className="crm-auto-run-h" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="crm-auto-when" title={new Date(run.createdAt).toLocaleString('fr-FR')}>
          {formatRelative(run.createdAt)}
        </span>
        <b>{run.ruleName || 'Règle supprimée'}</b>
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
          {RUN_STATUS_LABELS[run.status] ?? run.status}
        </span>
      </button>
      {open && (
        <div className="crm-auto-det" id={panelId}>
          <b>Déclencheur : {TRIGGER_LABELS[run.trigger as TriggerType] ?? run.trigger}</b>
          <ul>
            {run.steps.map((s, i) => {
              const at = new Date(s.at).getTime()
              return (
                <li key={i}>
                  <time dateTime={s.at}>{Number.isNaN(at - base) ? '' : `+${Math.max(0, at - base)} ms`}</time>
                  <span>
                    {ACTION_LABELS[s.action as ActionType] ?? s.action} · {s.message || RUN_STATUS_LABELS[s.status]}
                  </span>
                </li>
              )
            })}
          </ul>
          {payload && (
            <>
              <span className="crm-auto-lb">E-mail à valider{payload.to ? ` · ${payload.to}` : ''}</span>
              <pre>{`${payload.subject ?? ''}\n\n${payload.body ?? ''}`.trim()}</pre>
            </>
          )}
          <div className="crm-auto-det-actions">
            {run.status === 'PENDING' && (
              <>
                <button type="button" className="crm-auto-btn crm-auto-btn--primary crm-auto-btn--sm" disabled={busy} onClick={() => onAct('approve', run)}>
                  Approuver et envoyer
                </button>
                <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" disabled={busy} onClick={() => onAct('reject', run)}>
                  Refuser
                </button>
              </>
            )}
            {run.status === 'ERR' && (
              <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" disabled={busy} onClick={() => onAct('retry', run)}>
                Relancer l’exécution
              </button>
            )}
            {run.status !== 'PENDING' && run.status !== 'ERR' && <span className="crm-auto-note">Durée {formatDuration(run.durationMs)}</span>}
          </div>
        </div>
      )}
    </li>
  )
}

export default function RunsJournal({ filter, onFilterChange, version, onChanged, onError }: RunsJournalProps) {
  const [items, setItems] = useState<CrmRuleRun[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const seq = useRef(0)

  const load = useCallback(async (nextPage: number, append: boolean) => {
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
      setError(e instanceof Error ? e.message : 'Journal indisponible')
    } finally {
      if (mine === seq.current) setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load(1, false)
  }, [load, version])

  const act = async (kind: 'approve' | 'reject' | 'retry', run: CrmRuleRun) => {
    setBusyId(run._id)
    try {
      if (kind === 'approve') await approveRun(run._id)
      else if (kind === 'reject') await rejectRun(run._id)
      else await retryRun(run._id)
      onChanged(kind === 'approve' ? 'E-mail approuvé' : kind === 'reject' ? 'E-mail refusé' : 'Exécution relancée')
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Action impossible')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <div className="crm-auto-filters" role="group" aria-label="Filtrer le journal">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className="crm-auto-chip" aria-pressed={filter === f.key} onClick={() => onFilterChange(f.key)}>
            {f.label}
            {filter === f.key && !loading && <b className="crm-auto-note" style={{ fontFamily: 'var(--mono)' }}>{total}</b>}
          </button>
        ))}
      </div>
      <div className="crm-auto-glass">
        {error ? (
          <div className="crm-auto-notice crm-auto-notice--err" role="alert" style={{ margin: 12 }}>
            <span>{error}</span>
            <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" onClick={() => void load(1, false)}>
              Réessayer
            </button>
          </div>
        ) : loading && items.length === 0 ? (
          <p className="crm-auto-empty" role="status">Chargement du journal…</p>
        ) : items.length === 0 ? (
          <p className="crm-auto-empty">Aucune exécution pour ce filtre.</p>
        ) : (
          <ul className="crm-auto-runs" aria-label="Journal d’exécution">
            {items.map((run) => (
              <RunRow key={run._id} run={run} open={openId === run._id} busy={busyId === run._id} onToggle={() => setOpenId(openId === run._id ? null : run._id)} onAct={(k, r) => void act(k, r)} />
            ))}
          </ul>
        )}
        <div className="crm-auto-foot">
          <span>Conservé 90 jours · une exécution = un déclenchement sur un lead</span>
          {items.length < total && (
            <button type="button" className="crm-auto-btn crm-auto-btn--ghost crm-auto-btn--sm" disabled={loading} onClick={() => void load(page + 1, true)}>
              Charger la suite ({items.length}/{total})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
