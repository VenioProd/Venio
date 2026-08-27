import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteInteraction,
  fetchTimeline,
  logInteraction,
  sendInteractionEmail,
  updateInteraction,
} from '../../../services/interactions'
import type {
  InteractionSubjectType,
  LogInteractionInput,
  SendEmailInput,
  SendEmailResult,
  TimelineEntry,
  TimelineResponse,
} from '../../../types/interaction.types'
import TimelineEntryRow from './TimelineEntry'
import InteractionComposer from './InteractionComposer'
import EmailComposer from './EmailComposer'
import { TIMELINE_FILTERS, type TimelineFilter } from './constants'
import './InteractionTimeline.css'

interface InteractionTimelineProps {
  subjectType: InteractionSubjectType
  subjectId: string
  /** Faux en lecture seule : la timeline reste consultable, sans composeur ni actions. */
  canWrite: boolean
  /** Texte historique repris d'un champ libre, affiché en tête comme note. */
  legacyNote?: string
}

const InteractionTimeline: React.FC<InteractionTimelineProps> = ({ subjectType, subjectId, canWrite, legacyNote }) => {
  const [data, setData] = useState<TimelineResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<TimelineFilter>('ALL')
  const [emailOpen, setEmailOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchTimeline(subjectType, subjectId))
      setError('')
    } catch (err) {
      setError((err as Error).message || 'Impossible de charger les échanges')
    } finally {
      setLoading(false)
    }
  }, [subjectType, subjectId])

  useEffect(() => {
    void load()
  }, [load])

  /** Renvoie false si l'action a échoué, pour que le composeur garde sa saisie. */
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError('')
    try {
      await action()
      await load()
      return true
    } catch (err) {
      setError((err as Error).message || 'Action impossible')
      return false
    } finally {
      setBusy(false)
    }
  }

  const handleLog = (input: LogInteractionInput) => run(() => logInteraction(subjectType, subjectId, input))

  const handleSend = async (input: SendEmailInput): Promise<SendEmailResult | null> => {
    setBusy(true)
    setError('')
    try {
      const result = await sendInteractionEmail(subjectType, subjectId, input)
      await load()
      return result
    } catch (err) {
      setError((err as Error).message || "L'envoi a échoué")
      // L'échec est journalisé côté serveur : on recharge pour le montrer.
      await load()
      return null
    } finally {
      setBusy(false)
    }
  }

  const entries = useMemo(() => {
    const all = data?.entries ?? []
    if (filter === 'ALL') return all
    if (filter === 'SYSTEM') return all.filter((entry) => entry.source === 'SYSTEM')
    return all.filter((entry) => entry.source === 'INTERACTION' && entry.kind === filter)
  }, [data, filter])

  const counts = useMemo(() => {
    const all = data?.entries ?? []
    return {
      exchanges: all.filter((entry) => entry.source === 'INTERACTION').length,
      system: all.filter((entry) => entry.source === 'SYSTEM').length,
    }
  }, [data])

  return (
    <div className="interaction-timeline">
      {canWrite && (
        <div className="interaction-toolbar">
          <button type="button" className="portal-button" onClick={() => setEmailOpen((open) => !open)} disabled={busy}>
            {emailOpen ? "Masquer l'email" : 'Écrire un email'}
          </button>
        </div>
      )}

      {canWrite && emailOpen && data && (
        <EmailComposer subject={data.subject} busy={busy} onCancel={() => setEmailOpen(false)} onSend={handleSend} />
      )}

      {canWrite && <InteractionComposer busy={busy} onSubmit={handleLog} />}

      {error && <div className="admin-error interaction-error">{error}</div>}

      <div className="interaction-filters" role="group" aria-label="Filtrer les échanges">
        {TIMELINE_FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={filter === option.key ? 'active' : ''}
            onClick={() => setFilter(option.key)}
          >
            {option.label}
          </button>
        ))}
        <span className="interaction-counts">
          {counts.exchanges} échange{counts.exchanges > 1 ? 's' : ''} · {counts.system} événement
          {counts.system > 1 ? 's' : ''}
        </span>
      </div>

      {loading && !data ? (
        <div className="admin-loading">Chargement des échanges…</div>
      ) : (
        <>
          {legacyNote && filter === 'ALL' && (
            <div className="interaction-legacy">
              <span className="interaction-legacy-tag">Note historique</span>
              <p>{legacyNote}</p>
            </div>
          )}

          {entries.length === 0 ? (
            <p className="interaction-empty">
              {filter === 'ALL' ? "Aucun échange consigné pour l'instant." : "Rien de ce type dans l'historique."}
            </p>
          ) : (
            <ul className="interaction-entries">
              {entries.map((entry) => (
                <TimelineEntryRow
                  key={`${entry.source}-${entry.id}`}
                  entry={entry}
                  canWrite={canWrite}
                  busy={busy}
                  onDelete={(id) => void run(() => deleteInteraction(id))}
                  onTogglePin={(target: TimelineEntry) =>
                    void run(() => updateInteraction(target.id, { pinned: !target.pinned }))
                  }
                />
              ))}
            </ul>
          )}

          {data?.hasMore && (
            <p className="interaction-hint">Seuls les {data.limit} échanges les plus récents sont affichés.</p>
          )}
        </>
      )}
    </div>
  )
}

export default InteractionTimeline
