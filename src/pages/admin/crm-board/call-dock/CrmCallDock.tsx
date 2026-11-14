import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mic, MicOff, PhoneOff } from 'lucide-react'
import { useI18n, type MessageKey } from '../../../../context/I18nContext'
import { formatDuration } from '../../../../components/calls/leadCalls'
import { useElapsed } from '../../../commercial/softphone/CallBar'
import type { SharedSoftphone } from '../../../commercial/softphone/shared'
import type { CallDockStore } from './callDockStore'
import '../../../../components/admin/crm-ui/crm-ui.css'
import './callDock.css'

const isLeadPath = (path: string) => path.startsWith('/admin/crm/leads/')

/**
 * Barre fixe en bas du CRM : l'appel en cours quand l'écran affiché ne montre pas sa barre d'appel, puis
 * son résultat à saisir tant qu'il n'a pas été remis à l'écran d'où l'appel est parti, ou écarté.
 * Aucun dock quand le poste est en repli `tel:`.
 */
export default function CrmCallDock({ shared, store }: { shared: SharedSoftphone; store: CallDockStore }) {
  const { t } = useI18n()
  const { engine, session, owed, path } = shared
  const call = useSyncExternalStore(engine.subscribe, engine.getSnapshot)
  const { origin, shown } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const inCall = call.phase !== 'idle'
  const elapsed = useElapsed(inCall ? call.answeredAt : null)

  const mode = session.unavailable
    ? null
    : inCall
      ? shown > 0
        ? null
        : 'call'
      : owed && owed.origin.path !== path
        ? 'owed'
        : null
  const target = mode === 'owed' ? owed!.origin : origin?.leadId === call.leadId ? origin : null
  const company = target?.company ?? null
  const live = call.phase === 'active' || call.phase === 'reconnecting'
  const state =
    mode === 'call'
      ? call.bridge && (call.phase === 'connecting' || call.phase === 'ringing')
        ? t('callCountries.bridge.ringing')
        : t(`calls.state.${call.phase}` as MessageKey)
      : mode === 'owed'
        ? company
          ? t('crmCallDock.owed', { company })
          : t('crmCallDock.owedUnnamed')
        : ''
  const title = mode === 'call' ? t('crmCallDock.inCall') : t('crmCallDock.ended')
  const back = target && target.path !== path ? `${target.path}${target.search}` : null
  const backLabel = t(target && isLeadPath(target.path) ? 'crmCallDock.backLead' : 'crmCallDock.backDesk')

  return createPortal(
    <>
      {/* Toujours présente : une région ajoutée en même temps que son texte n'est pas toujours lue. */}
      <p className="crm-ui-sr-only" role="status" aria-live="polite">
        {mode ? [title, mode === 'call' && company, state].filter(Boolean).join(' · ') : ''}
      </p>
      {mode && (
        <section className="crm-call-dock" data-mode={mode} aria-label={t('crmCallDock.aria')}>
          <span className="crm-ui-dot" data-tone={mode === 'call' ? 'green' : 'amber'} aria-hidden="true" />
          <div className="crm-call-dock__what">
            <strong>{title}</strong>
            <span className="crm-call-dock__sub">
              {company && mode === 'call' && <b>{company}</b>}
              {mode === 'call' && call.phase === 'active' ? (
                <span className="crm-call-dock__timer" role="timer" aria-label={t('calls.timer')}>
                  {formatDuration(elapsed)}
                </span>
              ) : (
                <span>{state}</span>
              )}
            </span>
          </div>
          <div className="crm-call-dock__actions">
            {mode === 'call' && live && !call.bridge && (
              <button
                type="button"
                className="crm-ui-btn"
                aria-pressed={call.muted}
                aria-label={t('calls.mute')}
                onClick={() => engine.toggleMute()}
              >
                {call.muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
                <span className="crm-call-dock__label">{t('calls.mute')}</span>
              </button>
            )}
            {mode === 'call' && (
              <button
                type="button"
                className="crm-ui-btn crm-ui-btn--danger"
                aria-label={t('calls.hangup')}
                disabled={call.phase === 'ending'}
                onClick={() => engine.hangup()}
              >
                <PhoneOff aria-hidden="true" />
                <span className="crm-call-dock__label">{t('calls.hangup')}</span>
              </button>
            )}
            {mode === 'owed' && back && (
              <Link className="crm-ui-btn crm-ui-btn--primary" to={back}>
                {t('crmCallDock.enter')}
              </Link>
            )}
            {mode === 'owed' && (
              <button
                type="button"
                className="crm-ui-btn crm-ui-btn--ghost"
                aria-label={t('crmCallDock.dismissAria')}
                onClick={store.dismiss}
              >
                {t('crmCallDock.dismiss')}
              </button>
            )}
            {mode === 'call' && back && (
              <Link className="crm-ui-btn crm-ui-btn--soft" to={back}>
                <ArrowLeft aria-hidden="true" />
                {backLabel}
              </Link>
            )}
          </div>
        </section>
      )}
    </>,
    document.body,
  )
}
