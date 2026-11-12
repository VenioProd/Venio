import { useState } from 'react'
import { X } from 'lucide-react'
import CallPanel from '../../components/calls/CallPanel'
import CallStateChips from '../../components/calls/CallStateChips'
import { formatDuration, useLeadCalls } from '../../components/calls/leadCalls'
import { useI18n } from '../../context/I18nContext'

export interface RecentCall {
  callId: string
  leadId: string
  company: string
  durationSec: number
}

function RecentCallItem({
  item,
  apiPrefix,
  canLiftHold,
  onDismiss,
  onApplied,
}: {
  item: RecentCall
  apiPrefix?: string
  canLiftHold?: boolean
  onDismiss: () => void
  onApplied: () => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const { calls, reload } = useLeadCalls(item.leadId, apiPrefix, item.callId)
  const call = calls.find((candidate) => candidate._id === item.callId)
  const ready = Boolean(call && (call.transcriptStatus === 'DONE' || call.analysisStatus !== null))
  const analysisReady = call?.analysisStatus === 'READY'
  const announce = !call
    ? ''
    : analysisReady
      ? t('commercial.recent.analysisReady', { company: item.company })
      : call.transcriptStatus === 'DONE'
        ? t('commercial.recent.transcriptReady', { company: item.company })
        : ''
  const panelId = `recent-call-${item.callId}`

  return (
    <li className="recent-call">
      <div className="recent-call-head">
        <span className="recent-call-title">
          <strong>{item.company}</strong>
          <span className="commercial-muted">{formatDuration(item.durationSec)}</span>
        </span>
        {call ? (
          <CallStateChips call={call} />
        ) : (
          <span className="commercial-muted">{t('commercial.recent.waiting')}</span>
        )}
        <span className="recent-call-actions">
          <button
            type="button"
            className="portal-button secondary"
            aria-expanded={open}
            aria-controls={panelId}
            disabled={!ready}
            title={ready ? undefined : t('commercial.recent.notReady')}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? t('commercial.recent.hide') : t('commercial.recent.open')}
          </button>
          <button
            type="button"
            className="recent-call-dismiss"
            aria-label={t('commercial.recent.dismiss', { company: item.company })}
            onClick={onDismiss}
          >
            <X size={16} aria-hidden />
          </button>
        </span>
      </div>
      <span className="ci-visually-hidden" role="status">
        {announce}
      </span>
      {open && call && (
        <div id={panelId} className="recent-call-body">
          <CallPanel
            call={call}
            apiPrefix={apiPrefix}
            canLiftHold={canLiftHold}
            onApplied={() => {
              // Les puces de l'appel suivent la décision (analyse appliquée, retenue décidée).
              reload()
              onApplied()
            }}
          />
        </div>
      )}
    </li>
  )
}

/**
 * Appels décrochés pendant cette séance : transcript et analyse s'ouvrent dès qu'ils sont prêts.
 * Rien ne prend le focus ni ne bloque la file ; la zone ignore les raccourcis de saisie de la page.
 */
export default function RecentCalls({
  items,
  apiPrefix,
  canLiftHold,
  onDismiss,
  onApplied,
}: {
  items: RecentCall[]
  apiPrefix?: string
  canLiftHold?: boolean
  onDismiss: (callId: string) => void
  onApplied: (leadId: string) => void
}) {
  const { t } = useI18n()
  if (!items.length) return null
  return (
    <section className="recent-calls" aria-label={t('commercial.recent.title')}>
      <h2>{t('commercial.recent.title')}</h2>
      <ul>
        {items.map((item) => (
          <RecentCallItem
            key={item.callId}
            item={item}
            apiPrefix={apiPrefix}
            canLiftHold={canLiftHold}
            onDismiss={() => onDismiss(item.callId)}
            onApplied={() => onApplied(item.leadId)}
          />
        ))}
      </ul>
    </section>
  )
}
