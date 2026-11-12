import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { formatDateTime } from '../../i18n/format'
import CallPanel from './CallPanel'
import CallStateChips from './CallStateChips'
import { formatDuration, useLeadCalls, wasAnswered } from './leadCalls'
import './callInsights.css'

export interface LeadCallsListProps {
  leadId: string
  /** `/api/commercial` côté commercial ; le lot équipe passe le préfixe de son routeur. */
  apiPrefix?: string
  /** Changer cette valeur relit la liste (fin d'un appel, par exemple). */
  refreshKey?: unknown
  readOnly?: boolean
  /** L'équipe peut lever la retenue d'une opposition ; l'externe seulement la confirmer. */
  canLiftHold?: boolean
  /** Appelée après une application d'analyse ou une décision sur une opposition : la fiche autour doit se recharger. */
  onApplied?: () => void
}

/** Les appels d'une fiche, du plus récent au plus ancien ; ouvrir un appel décroché affiche son audio, son transcript et son analyse. */
export default function LeadCallsList({
  leadId,
  apiPrefix,
  refreshKey,
  readOnly,
  canLiftHold,
  onApplied,
}: LeadCallsListProps) {
  const { t } = useI18n()
  const { calls, loading, error, reload } = useLeadCalls(leadId, apiPrefix, refreshKey)
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section className="ci-lead-calls" aria-labelledby={`ci-lead-calls-${leadId}`}>
      <h2 id={`ci-lead-calls-${leadId}`}>{t('callInsights.leadCalls.title')}</h2>
      {loading && (
        <p className="ci-muted" role="status">
          {t('callInsights.loading')}
        </p>
      )}
      {error && (
        <p className="ci-error" role="alert">
          {t('callInsights.leadCalls.error')}{' '}
          <button type="button" className="ci-link" onClick={reload}>
            {t('callInsights.retry')}
          </button>
        </p>
      )}
      {!loading && !error && calls.length === 0 && <p className="ci-muted">{t('callInsights.leadCalls.empty')}</p>}
      <ul className="ci-lead-call-list">
        {calls.map((call) => {
          const open = openId === call._id
          const answered = wasAnswered(call)
          const summary = (
            <>
              <span className="ci-lead-call-when">
                <strong>{formatDateTime(call.answeredAt ?? call.startedAt) || '—'}</strong>
                <span className="ci-muted">
                  {call.durationSec !== null && call.durationSec > 0
                    ? formatDuration(call.durationSec)
                    : t(`calls.status.${call.status}` as 'calls.status.COMPLETED')}
                </span>
              </span>
              {answered && <CallStateChips call={call} />}
            </>
          )
          return (
            <li key={call._id} className="ci-lead-call">
              {answered ? (
                <button
                  type="button"
                  className="ci-lead-call-head"
                  aria-expanded={open}
                  aria-controls={`ci-call-${call._id}`}
                  onClick={() => setOpenId(open ? null : call._id)}
                >
                  {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                  {summary}
                </button>
              ) : (
                <div className="ci-lead-call-head ci-lead-call-head--static">{summary}</div>
              )}
              {open && (
                <div id={`ci-call-${call._id}`} className="ci-lead-call-body">
                  <CallPanel
                    call={call}
                    apiPrefix={apiPrefix}
                    readOnly={readOnly}
                    canLiftHold={canLiftHold}
                    onApplied={() => {
                      reload()
                      onApplied?.()
                    }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
