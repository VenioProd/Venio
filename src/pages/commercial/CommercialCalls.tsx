import { Fragment, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useI18n } from '../../context/I18nContext'
import { formatDay, type CallSettings, type RepLead, type RepInteraction } from '../../services/externalSales'
import { commercialDesk, type CallDeskApi } from './callDesk'
import CallLeadImport from './CallLeadImport'
import './CommercialSpace.css'
import RecentCalls, { type RecentCall } from './RecentCalls'
import CallBar from './softphone/CallBar'
import { useSoftphone } from './softphone/useSoftphone'
import type { SettledCall } from './softphone/engine'

const KIND_KEYS = {
  CALL: 'commercial.kind.call',
  EMAIL: 'commercial.kind.email',
  MEETING: 'commercial.kind.meeting',
  NOTE: 'commercial.kind.note',
} as const

type Draft = { note: string; outcome: string; scriptTag: string; nextActionAt: string; callId?: string }
function localDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function CommercialCalls() {
  return <CallDesk desk={commercialDesk} />
}

/** La file d'appels, commune au commercial externe (`commercialDesk`) et à l'équipe (voir `crm-board/TeamCallDesk`). */
export function CallDesk({ desk }: { desk: CallDeskApi }) {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const [settings, setSettings] = useState<CallSettings | null>(null)
  const [filters, setFilters] = useState<{ lists: string[]; projects: string[] }>({ lists: [], projects: [] })
  const [callList, setCallList] = useState('')
  const [project, setProject] = useState('')
  const [mine, setMine] = useState(true)
  const [leads, setLeads] = useState<RepLead[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<{ lead: RepLead; draft: Draft; index: number; interactionId: string } | null>(null)
  const [history, setHistory] = useState<Record<string, RepInteraction[]>>({})
  const [historyResult, setHistoryResult] = useState<{ id: string | null; error: string }>({ id: null, error: '' })
  const historyLoading = selected !== null && historyResult.id !== selected
  const historyError = historyResult.id === selected ? historyResult.error : ''
  const [newScript, setNewScript] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [autoOutcomes, setAutoOutcomes] = useState<Record<string, string>>({})
  const [refresh, setRefresh] = useState(0)
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([])
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const saving = useRef(false)
  const completed = useRef(new Set<string>())
  const attempt = useRef<{ body: string; key: string } | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([desk.settings(), desk.filters()])
      .then(([config, options]) => {
        if (active) {
          setSettings(config)
          setFilters(options)
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message)
      })
    return () => {
      active = false
    }
  }, [desk, refresh])

  useEffect(() => {
    let active = true
    desk
      .queue({ callList, project, ...(desk.mineToggle ? { mine } : {}) })
      .then((data) => {
        if (active) {
          setLeads(data.leads)
          setCursor(data.nextCursor)
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [desk, callList, project, mine, refresh])

  useEffect(() => {
    if (selected) noteRef.current?.focus()
    if (!selected) return
    let active = true
    desk
      .history(selected)
      .then((items) => {
        if (active) {
          setHistory((current) => ({ ...current, [selected]: items }))
          setHistoryResult({ id: selected, error: '' })
        }
      })
      .catch((err: Error) => {
        if (active) setHistoryResult({ id: selected, error: err.message })
      })
    return () => {
      active = false
    }
  }, [desk, selected])

  const resetQueue = () => {
    setLoading(true)
    setError('')
    setSelected(null)
    completed.current.clear()
  }
  const refreshQueue = () => {
    resetQueue()
    setRefresh((value) => value + 1)
  }
  const draftKey = (id: string) => `venio-call-draft:${user!._id}:${id}`
  const storeDraft = (id: string, draft: Draft | null) => {
    if (!user) return
    try {
      if (draft) localStorage.setItem(draftKey(id), JSON.stringify(draft))
      else localStorage.removeItem(draftKey(id))
    } catch {}
  }
  const draftFor = (lead: RepLead): Draft => {
    if (drafts[lead._id]) return drafts[lead._id]
    if (user) {
      try {
        const stored = JSON.parse(localStorage.getItem(draftKey(lead._id)) ?? 'null') as Draft | null
        if (
          stored &&
          ['note', 'outcome', 'scriptTag', 'nextActionAt'].every(
            (key) => typeof stored[key as keyof Draft] === 'string',
          )
        )
          return stored
      } catch {}
    }
    return { note: '', outcome: '', scriptTag: settings?.scriptTags[0] ?? '', nextActionAt: '' }
  }
  const changeDraft = (lead: RepLead, change: Partial<Draft>) => {
    const draft = { ...draftFor(lead), ...change }
    setDrafts((current) => ({ ...current, [lead._id]: draft }))
    storeDraft(lead._id, draft)
  }
  // Après l'appel : le résultat se présélectionne d'après l'état final, et le callId part avec la fiche.
  const softphone = useSoftphone({ onSettled: (call) => settleCall(call), apiPrefix: desk.apiPrefix })
  const settleCall = (call: SettledCall) => {
    const lead = leads.find((item) => item._id === call.leadId)
    if (!lead) return
    // Un appel décroché garde un accès à son transcript et à son analyse, le temps de la séance.
    if (call.record?.answeredAt || call.elapsedSec > 0)
      setRecentCalls((current) =>
        [
          {
            callId: call.callId,
            leadId: lead._id,
            company: lead.company,
            durationSec: call.record?.durationSec ?? call.elapsedSec,
          },
          ...current.filter((item) => item.callId !== call.callId),
        ].slice(0, 5),
      )
    const suggested = call.record?.suggestedOutcome
    const draft = draftFor(lead)
    const preselect =
      suggested &&
      settings?.outcomes.some((item) => item.value === suggested) &&
      (!draft.outcome || draft.outcome === autoOutcomes[lead._id])
    if (preselect) setAutoOutcomes((current) => ({ ...current, [lead._id]: suggested }))
    changeDraft(lead, { callId: call.callId, ...(preselect ? { outcome: suggested } : {}) })
  }
  const open = (id: string | null) => {
    if (!saving.current && !softphone.active) {
      setSelected(id)
      setError('')
    }
  }
  const followingPage = async (start: string) => {
    let next: string | null = start
    let page: RepLead[] = []
    do {
      const data = await desk.queue({ callList, project, cursor: next, ...(desk.mineToggle ? { mine } : {}) })
      page = data.leads.filter((item) => !completed.current.has(item._id))
      next = data.nextCursor
    } while (!page.length && next)
    return { leads: page, nextCursor: next }
  }
  const loadMore = async () => {
    if (!cursor) return
    setLoading(true)
    setError('')
    try {
      const data = await followingPage(cursor)
      setLeads((current) => [
        ...current,
        ...data.leads.filter((lead) => !current.some((item) => item._id === lead._id)),
      ])
      setCursor(data.nextCursor)
      if (!leads.length) setSelected(data.leads[0]?._id ?? null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }
  const save = async (lead: RepLead) => {
    const draft = draftFor(lead)
    const outcome = settings?.outcomes.find((item) => item.value === draft.outcome)
    if (saving.current || softphone.active || !outcome || (outcome.effect === 'CALLBACK' && !draft.nextActionAt)) return
    saving.current = true
    setBusy(true)
    setError('')
    setSaved(null)
    try {
      const input = { ...draft, nextActionAt: draft.nextActionAt ? new Date(draft.nextActionAt).toISOString() : null }
      const body = JSON.stringify({ leadId: lead._id, ...input })
      if (attempt.current?.body !== body) attempt.current = { body, key: crypto.randomUUID() }
      const receipt = await desk.quickCall(lead._id, { ...input, clientRequestId: attempt.current.key })
      completed.current.add(lead._id)
      const index = leads.findIndex((item) => item._id === lead._id)
      setSaved({ lead, draft, index, interactionId: receipt.interactionId })
      storeDraft(lead._id, null)
      const remaining = leads.filter((item) => item._id !== lead._id)
      setLeads(remaining)
      setDrafts((current) => {
        const next = { ...current }
        delete next[lead._id]
        return next
      })
      let nextId = remaining[index]?._id ?? remaining[0]?._id ?? null
      setSelected(nextId)
      if (!nextId && cursor) {
        const data = await followingPage(cursor)
        setLeads(data.leads)
        setCursor(data.nextCursor)
        nextId = data.leads[0]?._id ?? null
      }
      setSelected(nextId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const undo = async () => {
    if (!saved || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      const restored = await desk.undoQuickCall(saved.lead._id, saved.interactionId)
      completed.current.delete(saved.lead._id)
      setLeads((current) => {
        const next = current.filter((item) => item._id !== saved.lead._id)
        next.splice(Math.min(saved.index, next.length), 0, restored.lead)
        return next
      })
      setDrafts((current) => ({ ...current, [saved.lead._id]: saved.draft }))
      storeDraft(saved.lead._id, saved.draft)
      setSelected(saved.lead._id)
      attempt.current = null
      setSaved(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(null), 10000)
    return () => clearTimeout(timer)
  }, [saved])
  useEffect(() => {
    if (!saved) return
    const handler = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyZ' && !event.isComposing) {
        event.preventDefault()
        void undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })
  const addScript = async () => {
    if (!newScript.trim() || saving.current) return
    saving.current = true
    setBusy(true)
    try {
      const data = await desk.addScriptTag(newScript.trim())
      setSettings((current) => (current ? { ...current, scriptTags: data.scriptTags } : current))
      const lead = leads.find((item) => item._id === selected)
      if (lead) changeDraft(lead, { scriptTag: newScript.trim() })
      setNewScript('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const quickDate = (lead: RepLead, kind: 'hour' | 'tomorrow' | 'days') => {
    const date = new Date()
    if (kind === 'hour') date.setHours(date.getHours() + 1)
    if (kind === 'days') date.setDate(date.getDate() + 3)
    if (kind === 'tomorrow') {
      date.setDate(date.getDate() + 1)
      date.setHours(9, 0, 0, 0)
    }
    changeDraft(lead, { nextActionAt: localDate(date.toISOString()) })
  }
  // Une analyse appliquée change la fiche : la ligne de la file se recharge.
  const reloadLead = (leadId: string) => {
    desk
      .lead(leadId)
      .then((fresh) =>
        setLeads((current) => current.map((item) => (item._id === leadId ? { ...item, ...fresh } : item))),
      )
      .catch(() => undefined)
  }
  const keyboard = (event: React.KeyboardEvent) => {
    if (
      busy ||
      loading ||
      event.nativeEvent.isComposing ||
      (event.target as HTMLElement).closest('.commercial-import-form, .recent-calls')
    )
      return
    const lead = leads.find((item) => item._id === selected)
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code)
    const shortcut = digit ? Number(digit[1]) - 1 : -1
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      lead &&
      shortcut >= 0 &&
      shortcut < 9 &&
      settings?.outcomes[shortcut]
    ) {
      event.preventDefault()
      changeDraft(lead, { outcome: settings.outcomes[shortcut].value })
      return
    }
    const inEditor = (event.target as HTMLElement).closest('input, textarea, select, [role="listbox"]')
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && (!inEditor || event.altKey)) {
      event.preventDefault()
      const index = leads.findIndex((item) => item._id === selected)
      const next = index < 0 ? 0 : index + (event.key === 'ArrowDown' ? 1 : -1)
      open(leads[Math.max(0, Math.min(leads.length - 1, next))]?._id ?? null)
    }
  }
  const outcomeLabel = (value: string | null | undefined) =>
    settings?.outcomes.find((item) => item.value === value)?.[locale] ?? value ?? '—'

  return (
    <div onKeyDown={keyboard}>
      {desk.team ? <h2>{t('commercial.calls.title')}</h2> : <h1>{t('commercial.calls.title')}</h1>}
      <p className="commercial-muted commercial-call-shortcuts">{t('commercial.calls.shortcuts')}</p>
      {settings && desk.allowImport && (
        <CallLeadImport
          region={settings.defaultRegion}
          projects={settings.projects}
          disabled={busy || loading || softphone.active}
          onDone={refreshQueue}
        />
      )}
      <fieldset className="commercial-toolbar commercial-call-filters" disabled={busy || loading || softphone.active}>
        <label>
          {t('commercial.calls.list')}
          <select
            className="portal-input"
            value={callList}
            onChange={(event) => {
              resetQueue()
              setCallList(event.target.value)
            }}
          >
            {[
              { value: '', label: t('commercial.calls.allLists') },
              ...filters.lists.map((value) => ({ value, label: value })),
            ].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('commercial.calls.project')}
          <select
            className="portal-input"
            value={project}
            onChange={(event) => {
              resetQueue()
              setProject(event.target.value)
            }}
          >
            {[
              { value: '', label: t('commercial.calls.allProjects') },
              ...filters.projects.map((value) => ({ value, label: value })),
            ].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {desk.mineToggle && (
          <div className="commercial-scope" role="group" aria-label={t('commercial.calls.scope')}>
            {([true, false] as const).map((value) => (
              <button
                type="button"
                key={String(value)}
                className={`portal-button${mine === value ? '' : ' secondary'}`}
                aria-pressed={mine === value}
                onClick={() => {
                  if (mine === value) return
                  resetQueue()
                  setMine(value)
                }}
              >
                {t(value ? 'commercial.calls.scopeMine' : 'commercial.calls.scopeAll')}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="portal-button secondary" onClick={refreshQueue}>
          {t('commercial.calls.refresh')}
        </button>
      </fieldset>
      {error && (
        <div role="alert" className="admin-error">
          {error}
        </div>
      )}
      {saved && (
        <div role="status" className="admin-success">
          {t('commercial.calls.saved')} —{' '}
          <button
            type="button"
            className="portal-button secondary"
            onClick={() => void undo()}
            disabled={busy}
            aria-keyshortcuts="Alt+Z"
          >
            {t('commercial.calls.undo')}
          </button>
        </div>
      )}
      <RecentCalls
        items={recentCalls}
        apiPrefix={desk.apiPrefix}
        canLiftHold={desk.canLiftHold}
        onDismiss={(callId) => setRecentCalls((current) => current.filter((item) => item.callId !== callId))}
        onApplied={reloadLead}
      />
      {loading && <p role="status">{t('commercial.loading')}</p>}
      {!loading && !leads.length && <p>{t('commercial.calls.empty')}</p>}
      <div className="commercial-call-columns" aria-hidden="true">
        <span>{t('commercial.field.company')}</span>
        <span>{t('commercial.field.phone')}</span>
        <span>{t('commercial.calls.outcome')}</span>
        <span>{t('commercial.field.nextAction')}</span>
      </div>
      <div className="commercial-call-grid" aria-busy={busy || loading}>
        {leads.map((lead) => {
          const expanded = selected === lead._id
          const draft = draftFor(lead)
          const callback = settings?.outcomes.find((item) => item.value === draft.outcome)?.effect === 'CALLBACK'
          return (
            <Fragment key={lead._id}>
              <button
                type="button"
                className={`commercial-call-row${settings?.outcomes.find((item) => item.value === lead.lastCallOutcome)?.effect === 'VOICEMAIL' ? ' voicemail' : ''}${expanded ? ' selected' : ''}`}
                aria-expanded={expanded}
                aria-controls={`call-${lead._id}`}
                disabled={busy || loading || softphone.active}
                onClick={() => open(expanded ? null : lead._id)}
              >
                <span data-label={t('commercial.field.company')}>
                  <strong>{lead.company}</strong>
                  <small>{lead.contactName || '—'}</small>
                  {lead.callHold && <em className="commercial-hold-tag">{t('commercial.hold.tag')}</em>}
                </span>
                <span data-label={t('commercial.field.phone')}>{lead.contactPhone || '—'}</span>
                <span data-label={t('commercial.calls.outcome')}>{outcomeLabel(lead.lastCallOutcome)}</span>
                <span data-label={t('commercial.field.nextAction')}>{formatDay(lead.nextActionAt)}</span>
              </button>
              {expanded && (
                <form
                  id={`call-${lead._id}`}
                  className="portal-card commercial-call-editor"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void save(lead)
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      (event.target as HTMLElement).tagName !== 'SELECT' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing &&
                      (event.target as HTMLElement).tagName !== 'A' &&
                      !(event.target as HTMLElement).closest('.softphone-bar') &&
                      !(event.target as HTMLElement).closest('[role="listbox"]')
                    ) {
                      event.preventDefault()
                      void save(lead)
                    }
                  }}
                >
                  <fieldset disabled={busy || loading}>
                    <CallBar
                      controller={softphone}
                      leadId={lead._id}
                      phone={lead.contactPhone}
                      disabled={busy}
                      held={Boolean(lead.callHold)}
                      suggestion={
                        draft.callId && draft.outcome && draft.outcome === autoOutcomes[lead._id]
                          ? outcomeLabel(draft.outcome)
                          : null
                      }
                    />
                    {lead.callHold && (
                      <p className="commercial-hold" role="status">
                        <strong>{t('commercial.hold.title')}</strong>{' '}
                        {t(desk.team ? 'commercial.hold.bodyTeam' : 'commercial.hold.body')}
                      </p>
                    )}
                    <div className="commercial-toolbar">
                      <span>{lead.contactName}</span>
                      {lead.contactEmail && (
                        <a className="commercial-link" href={`mailto:${lead.contactEmail}`}>
                          {lead.contactEmail}
                        </a>
                      )}
                      <span className="commercial-muted">
                        {lead.callList} {lead.project} {lead.source}
                      </span>
                    </div>
                    {Object.keys(lead.extraInfo).length > 0 && (
                      <ul className="commercial-call-extra">
                        {Object.entries(lead.extraInfo).map(([key, value]) => (
                          <li key={key}>
                            {key} :{' '}
                            {/^https?:\/\//i.test(value) ? (
                              <a className="commercial-link" href={value} target="_blank" rel="noopener noreferrer">
                                {value}
                              </a>
                            ) : (
                              value
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <section aria-label={t('commercial.calls.history')}>
                      <h3>{t('commercial.calls.history')}</h3>
                      {historyLoading && <p role="status">{t('commercial.loading')}</p>}
                      {historyError && <p role="alert">{historyError}</p>}
                      {!historyLoading && !historyError && !history[lead._id]?.length && (
                        <p>{t('commercial.calls.noHistory')}</p>
                      )}
                      <ul>
                        {history[lead._id]?.map((item) => (
                          <li key={item._id}>
                            {new Date(item.occurredAt).toLocaleString(locale)} · {t(KIND_KEYS[item.kind])} ·{' '}
                            {outcomeLabel(item.outcome)} · {item.scriptTag || '—'}
                            <p className="commercial-call-notes">{item.body}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                    {lead.notes && <p className="commercial-call-notes">{lead.notes}</p>}
                    <label>
                      {t('commercial.field.notes')}
                      <textarea
                        ref={noteRef}
                        className="portal-input"
                        rows={3}
                        maxLength={20000}
                        value={draft.note}
                        onChange={(event) => changeDraft(lead, { note: event.target.value })}
                      />
                    </label>
                    <div className="commercial-call-outcomes" role="group" aria-label={t('commercial.calls.outcome')}>
                      {settings?.outcomes.map((outcome, index) => (
                        <button
                          type="button"
                          className={`portal-button${draft.outcome === outcome.value ? '' : ' secondary'}`}
                          key={outcome.value}
                          aria-pressed={draft.outcome === outcome.value}
                          aria-keyshortcuts={index < 9 ? `Alt+${index + 1}` : undefined}
                          onClick={() => changeDraft(lead, { outcome: outcome.value })}
                        >
                          {outcome[locale]}
                          {index < 9 && <kbd>Alt+{index + 1}</kbd>}
                        </button>
                      ))}
                    </div>
                    <div className="commercial-form-grid">
                      <label>
                        {t('commercial.calls.script')}
                        <select
                          className="portal-input"
                          value={draft.scriptTag}
                          onChange={(event) => changeDraft(lead, { scriptTag: event.target.value })}
                        >
                          {[
                            { value: '', label: '—' },
                            ...(settings?.scriptTags ?? []).map((value) => ({ value, label: value })),
                          ].map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {desk.allowScriptTags && (
                        <label>
                          {t('commercial.calls.addScript')}
                          <input
                            className="portal-input"
                            maxLength={60}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                event.stopPropagation()
                                void addScript()
                              }
                            }}
                            value={newScript}
                            onChange={(event) => setNewScript(event.target.value)}
                          />
                          <button
                            type="button"
                            className="portal-button secondary"
                            disabled={!newScript.trim() || (settings?.scriptTags.length ?? 0) >= 30}
                            onClick={() => void addScript()}
                          >
                            {t('commercial.calls.addScript')}
                          </button>
                        </label>
                      )}
                      <label>
                        {t('commercial.field.nextAction')}
                        {callback ? ' *' : ''}
                        <input
                          className="portal-input"
                          type="datetime-local"
                          required={callback}
                          value={draft.nextActionAt}
                          onChange={(event) => changeDraft(lead, { nextActionAt: event.target.value })}
                        />
                      </label>
                    </div>
                    {callback && (
                      <div className="commercial-toolbar">
                        <button
                          type="button"
                          className="portal-button secondary"
                          onClick={() => quickDate(lead, 'hour')}
                        >
                          {t('commercial.calls.plusHour')}
                        </button>
                        <button
                          type="button"
                          className="portal-button secondary"
                          onClick={() => quickDate(lead, 'tomorrow')}
                        >
                          {t('commercial.calls.tomorrow')}
                        </button>
                        <button
                          type="button"
                          className="portal-button secondary"
                          onClick={() => quickDate(lead, 'days')}
                        >
                          {t('commercial.calls.plusDays')}
                        </button>
                      </div>
                    )}
                    <button
                      type="submit"
                      className="portal-button"
                      disabled={!draft.outcome || (callback && !draft.nextActionAt) || softphone.active}
                    >
                      {t('commercial.calls.saveNext')}
                    </button>
                    {softphone.active && <p className="commercial-muted">{t('calls.hangupFirst')}</p>}
                  </fieldset>
                </form>
              )}
            </Fragment>
          )
        })}
      </div>
      {cursor && (
        <button
          type="button"
          className="portal-button secondary"
          disabled={busy || loading}
          onClick={() => void loadMore()}
        >
          {t('commercial.calls.more')}
        </button>
      )}
    </div>
  )
}
