import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ArrowRight, ArrowUp, Lightbulb, Trash2, X } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext'
import { useI18n } from '../../../context/I18nContext'
import { useConfirm } from '../../../hooks/useConfirm'
import { hasPermission, PERMISSIONS } from '../../../lib/permissions'
import { apiFetch } from '../../../lib/api'
import {
  SUGGESTION_LEVEL_ORDER,
  SUGGESTION_STATUS_ORDER,
  bulkDevSuggestions,
  createDevSuggestion,
  listDevProjects,
  listDevSuggestions,
  toggleDevSuggestionVote,
  type DevBulkReport,
  type DevProject,
  type DevSuggestion,
  type DevSuggestionImpactLevel,
  type DevSuggestionSort,
  type DevSuggestionStatus,
} from '../../../services/dev'
import './IdeasBox.css'

const STATUS_TONE: Record<DevSuggestionStatus, string> = {
  NEW: 'sky',
  STUDIED: 'amber',
  ACCEPTED: 'mint',
  REJECTED: 'rose',
}

type LeadOption = { _id: string; company: string }

function formatAmount(amount: number | null): string {
  if (amount == null) return '—'
  return amount >= 1000 ? `${Math.round(amount / 1000)} k€` : `${amount} €`
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export default function IdeasBox() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { confirm, ConfirmDialog } = useConfirm()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_DEV)

  const [items, setItems] = useState<DevSuggestion[]>([])
  const [projects, setProjects] = useState<DevProject[]>([])
  const [filter, setFilter] = useState<'all' | DevSuggestionStatus>('all')
  const [sort, setSort] = useState<DevSuggestionSort>('impact')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [convertProject, setConvertProject] = useState('')

  // Formulaire de soumission rapide
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState('')
  const [project, setProject] = useState('')
  const [requester, setRequester] = useState('')
  const [amount, setAmount] = useState('')
  const [level, setLevel] = useState<DevSuggestionImpactLevel>('MEDIUM')
  const [leadQuery, setLeadQuery] = useState('')
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([])
  const [lead, setLead] = useState<LeadOption | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await listDevSuggestions({ sort })
      setItems(data.items)
      setSelected((prev) => new Set([...prev].filter((id) => data.items.some((s) => s._id === id))))
    } catch (err) {
      setError(t('devA.ideas.error', { message: errorMessage(err) }))
    }
  }, [sort, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    listDevProjects('ACTIVE')
      .then((r) => setProjects(r.projects))
      .catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    const q = leadQuery.trim()
    if (q.length < 2 || lead) {
      setLeadOptions([])
      return
    }
    const timer = setTimeout(() => {
      apiFetch<{ leads: LeadOption[] }>(`/api/admin/crm/leads?search=${encodeURIComponent(q)}`)
        .then((r) => setLeadOptions(r.leads.slice(0, 6)))
        .catch(() => setLeadOptions([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [leadQuery, lead])

  const visible = useMemo(() => (filter === 'all' ? items : items.filter((s) => s.status === filter)), [items, filter])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length }
    for (const s of items) c[s.status] = (c[s.status] ?? 0) + 1
    return c
  }, [items])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !problem.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const parsed = amount.trim() ? Number(amount.replace(/\s/g, '')) : null
      await createDevSuggestion({
        title: title.trim(),
        problem: problem.trim(),
        project: project || null,
        link: lead ? { kind: 'lead', ref: lead._id } : null,
        requesterName: requester.trim() || undefined,
        amountEur: parsed != null && Number.isFinite(parsed) ? parsed : null,
        level,
      })
      setTitle('')
      setProblem('')
      setAmount('')
      setLead(null)
      setLeadQuery('')
      await load()
    } catch (err) {
      setError(t('devA.ideas.error', { message: errorMessage(err) }))
    } finally {
      setSending(false)
    }
  }

  const vote = async (id: string) => {
    try {
      const updated = await toggleDevSuggestionVote(id)
      setItems((prev) => prev.map((s) => (s._id === id ? { ...s, voteCount: updated.voteCount, hasVoted: updated.hasVoted } : s)))
    } catch (err) {
      setError(t('devA.ideas.error', { message: errorMessage(err) }))
    }
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const run = async (action: () => Promise<DevBulkReport>) => {
    setBusy(true)
    setError(null)
    try {
      const report = await action()
      if (report.failed.length > 0) {
        setError(
          t('devA.ideas.bulk.partial', {
            done: report.processed.length,
            failed: report.failed.length,
            first: report.failed[0].error,
          }),
        )
      }
      setSelected(new Set())
      setRejecting(false)
      setReason('')
      await load()
    } catch (err) {
      setError(t('devA.ideas.error', { message: errorMessage(err) }))
    } finally {
      setBusy(false)
    }
  }

  const ids = [...selected]
  const needsProject = ids.some((id) => {
    const s = items.find((i) => i._id === id)
    return s && !s.project && s.status !== 'ACCEPTED'
  })

  const bulkConvert = () => {
    if (needsProject && !convertProject) {
      setError(t('devA.ideas.projectNeeded'))
      return
    }
    void run(() => bulkDevSuggestions(ids, 'convert', convertProject ? { project: convertProject } : {}))
  }

  const bulkDelete = async () => {
    if (!(await confirm({ message: t('devA.ideas.bulk.confirmDelete', { count: ids.length }), variant: 'danger' }))) return
    void run(() => bulkDevSuggestions(ids, 'delete'))
  }

  const bulkStatus = (value: string) => {
    if (!value) return
    if (value === 'REJECTED') {
      setRejecting(true)
      return
    }
    void run(() => bulkDevSuggestions(ids, 'status', { status: value as DevSuggestionStatus }))
  }

  return (
    <section className="ideas" aria-label={t('devA.ideas.title')}>
      <header className="ideas-head">
        <h2>
          <Lightbulb size={16} aria-hidden="true" /> {t('devA.ideas.title')}
        </h2>
        <p>{t('devA.ideas.subtitle')}</p>
      </header>

      <form className="ideas-form" onSubmit={submit}>
        <label className="ideas-fld full">
          <span>{t('devA.ideas.form.title')}</span>
          <input
            value={title}
            maxLength={160}
            required
            placeholder={t('devA.ideas.form.titlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="ideas-fld full">
          <span>{t('devA.ideas.form.problem')}</span>
          <textarea
            value={problem}
            maxLength={4000}
            required
            placeholder={t('devA.ideas.form.problemPlaceholder')}
            onChange={(e) => setProblem(e.target.value)}
          />
        </label>
        <label className="ideas-fld">
          <span>{t('devA.ideas.form.project')}</span>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">{t('devA.ideas.form.noProject')}</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="ideas-fld">
          <label htmlFor="ideas-lead">{t('devA.ideas.form.lead')}</label>
          {lead ? (
            <span className="ideas-chip">
              {lead.company}
              <button type="button" aria-label={t('devA.ideas.bulk.clear')} onClick={() => setLead(null)}>
                <X size={12} />
              </button>
            </span>
          ) : (
            <input
              id="ideas-lead"
              value={leadQuery}
              placeholder={t('devA.ideas.form.leadPlaceholder')}
              onChange={(e) => setLeadQuery(e.target.value)}
              autoComplete="off"
            />
          )}
          {leadOptions.length > 0 && (
            <ul className="ideas-suggest" role="listbox">
              {leadOptions.map((o) => (
                <li key={o._id}>
                  <button type="button" onClick={() => setLead(o)}>
                    {o.company}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="ideas-fld">
          <span>{t('devA.ideas.form.requester')}</span>
          <input
            value={requester}
            maxLength={120}
            placeholder={t('devA.ideas.form.requesterPlaceholder')}
            onChange={(e) => setRequester(e.target.value)}
          />
        </label>
        <div className="ideas-fld">
          <label htmlFor="ideas-amount">{t('devA.ideas.form.amount')}</label>
          <input id="ideas-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="ideas-seg" role="group" aria-label={t('devA.ideas.form.level')}>
            {SUGGESTION_LEVEL_ORDER.map((l) => (
              <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}>
                {t(`devA.ideas.level.${l}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="ideas-form-foot">
          <small>{t('devA.ideas.form.notice')}</small>
          <button className="ideas-btn primary" type="submit" disabled={sending || !title.trim() || !problem.trim()}>
            {sending ? t('devA.ideas.form.sending') : t('devA.ideas.form.submit')}
          </button>
        </div>
      </form>

      {error && (
        <p className="ideas-error" role="alert">
          {error}
        </p>
      )}

      <div className="ideas-tools">
        <div role="group" className="ideas-filters">
          {(['all', ...SUGGESTION_STATUS_ORDER] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === 'all' ? t('devA.ideas.filter.all') : t(`devA.ideas.status.${f}`)}
              <span className="ideas-count">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="ideas-sort">
          {t('devA.ideas.sort')}
          <select value={sort} onChange={(e) => setSort(e.target.value as DevSuggestionSort)}>
            <option value="impact">{t('devA.ideas.sort.impact')}</option>
            <option value="votes">{t('devA.ideas.sort.votes')}</option>
            <option value="recent">{t('devA.ideas.sort.recent')}</option>
          </select>
        </label>
      </div>

      {visible.length === 0 ? (
        <p className="ideas-empty">{t('devA.ideas.empty')}</p>
      ) : (
        <ul className="ideas-list">
          {visible.map((s) => (
            <li key={s._id} className={selected.has(s._id) ? 'ideas-row selected' : 'ideas-row'}>
              {canManage && (
                <input
                  type="checkbox"
                  className="ideas-check"
                  checked={selected.has(s._id)}
                  onChange={() => toggle(s._id)}
                  aria-label={t('devA.ideas.select', { title: s.title })}
                />
              )}
              <div className="ideas-main">
                <b>{s.title}</b>
                <p>{s.problem}</p>
                <div className="ideas-meta">
                  {s.project && <span className="ideas-chip">{s.project.key}</span>}
                  {s.requester.name && <span>{t('devA.ideas.requestedBy', { name: s.requester.name })}</span>}
                  {s.issue && (
                    <span className="ideas-chip mint">
                      <ArrowRight size={11} /> {t('devA.ideas.convertedTo', { id: s.issue.identifier })}
                    </span>
                  )}
                  {s.rejectionReason && <span className="ideas-reject">{t('devA.ideas.motif', { reason: s.rejectionReason })}</span>}
                </div>
              </div>
              <button
                type="button"
                className="ideas-vote"
                aria-pressed={s.hasVoted}
                aria-label={t('devA.ideas.vote', { count: s.voteCount })}
                onClick={() => void vote(s._id)}
              >
                <ArrowUp size={13} />
                <b>{s.voteCount}</b>
              </button>
              <div className="ideas-side">
                <span className="ideas-amount">
                  <b>{formatAmount(s.impact.amountEur)}</b>
                  <small>{t(`devA.ideas.level.${s.impact.level}`)}</small>
                </span>
                <span className={`ideas-status ${STATUS_TONE[s.status]}`}>{t(`devA.ideas.status.${s.status}`)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && selected.size > 0 && (
        <div className="ideas-bulk" role="toolbar" aria-label={t('devA.ideas.bulk.selected', { count: selected.size })}>
          {rejecting ? (
            <>
              <input
                className="ideas-reason"
                value={reason}
                placeholder={t('devA.ideas.reject.placeholder')}
                aria-label={t('devA.ideas.reject.title')}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                className="ideas-btn danger"
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => void run(() => bulkDevSuggestions(ids, 'status', { status: 'REJECTED', reason: reason.trim() }))}
              >
                {t('devA.ideas.reject.confirm')}
              </button>
              <button className="ideas-btn" type="button" onClick={() => setRejecting(false)}>
                {t('devA.ideas.reject.cancel')}
              </button>
            </>
          ) : (
            <>
              <span className="ideas-bulk-n">{t('devA.ideas.bulk.selected', { count: selected.size })}</span>
              {needsProject && (
                <select value={convertProject} onChange={(e) => setConvertProject(e.target.value)} aria-label={t('devA.ideas.convertProject')}>
                  <option value="">{t('devA.ideas.convertProject')}</option>
                  {projects.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              <button className="ideas-btn primary" type="button" disabled={busy} onClick={bulkConvert}>
                <ArrowRight size={13} /> {t('devA.ideas.bulk.convert')}
              </button>
              <select value="" disabled={busy} onChange={(e) => bulkStatus(e.target.value)} aria-label={t('devA.ideas.bulk.status')}>
                <option value="">{t('devA.ideas.bulk.status')}</option>
                {(['NEW', 'STUDIED', 'REJECTED'] as const).map((st) => (
                  <option key={st} value={st}>
                    {t(`devA.ideas.status.${st}`)}
                  </option>
                ))}
              </select>
              <button className="ideas-btn" type="button" disabled={busy} onClick={() => void run(() => bulkDevSuggestions(ids, 'archive'))}>
                <Archive size={13} /> {t('devA.ideas.bulk.archive')}
              </button>
              <button className="ideas-btn danger" type="button" disabled={busy} onClick={() => void bulkDelete()}>
                <Trash2 size={13} /> {t('devA.ideas.bulk.delete')}
              </button>
              <button className="ideas-btn" type="button" aria-label={t('devA.ideas.bulk.clear')} onClick={() => setSelected(new Set())}>
                <X size={13} />
              </button>
            </>
          )}
        </div>
      )}
      {ConfirmDialog}
    </section>
  )
}
