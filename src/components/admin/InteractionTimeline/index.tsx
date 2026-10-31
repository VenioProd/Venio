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
import { useI18n } from '../../../context/I18nContext'
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
  const { t } = useI18n()
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
      setError((err as Error).message || t('compB.timeline.loadError'))
    } finally {
      setLoading(false)
    }
  }, [subjectType, subjectId, t])

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
      setError((err as Error).message || t('compB.timeline.actionError'))
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
      setError((err as Error).message || t('compB.timeline.sendError'))
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
            {emailOpen ? t('compB.timeline.hideEmail') : t('compB.timeline.writeEmail')}
          </button>
        </div>
      )}

      {canWrite && emailOpen && data && (
        <EmailComposer subject={data.subject} busy={busy} onCancel={() => setEmailOpen(false)} onSend={handleSend} />
      )}

      {canWrite && <InteractionComposer busy={busy} onSubmit={handleLog} />}

      {error && <div className="admin-error interaction-error">{error}</div>}

      <div className="interaction-filters" role="group" aria-label={t('compB.timeline.filterGroup')}>
        {TIMELINE_FILTERS.map((option) => (
          <button
            key={option.key}
            type="button"
            className={filter === option.key ? 'active' : ''}
            onClick={() => setFilter(option.key)}
          >
            {t(option.labelKey)}
          </button>
        ))}
        <span className="interaction-counts">
          {t('compB.timeline.counts', { exchanges: counts.exchanges, events: counts.system })}
        </span>
      </div>

      {loading && !data ? (
        <div className="admin-loading">{t('compB.timeline.loading')}</div>
      ) : (
        <>
          {legacyNote && filter === 'ALL' && (
            <div className="interaction-legacy">
              <span className="interaction-legacy-tag">{t('compB.timeline.legacyNote')}</span>
              <p>{legacyNote}</p>
            </div>
          )}

          {entries.length === 0 ? (
            <p className="interaction-empty">
              {filter === 'ALL' ? t('compB.timeline.emptyAll') : t('compB.timeline.emptyFiltered')}
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

          {data?.hasMore && <p className="interaction-hint">{t('compB.timeline.hasMore', { limit: data.limit })}</p>}
        </>
      )}
    </div>
  )
}

export default InteractionTimeline
