import { useEffect, useState } from 'react'
import { Circle, Grid3x3, Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { useI18n, type MessageKey } from '../../../context/I18nContext'
import { formatDuration } from '../../../components/calls/leadCalls'
import { FINAL_CALL_STATUSES } from '../../../services/calls'
import type { SoftphoneController } from './useSoftphone'
import LiveTranscript from '../../../components/calls/live/LiveTranscript'
import './softphone.css'

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']

function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (since === null) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [since])
  return since === null ? 0 : Math.max(0, (now - since) / 1000)
}

interface Props {
  controller: SoftphoneController
  leadId: string
  phone: string
  /** Libellé du résultat présélectionné d'après l'appel, quand il y en a un. */
  suggestion?: string | null
  disabled?: boolean
  /** La fiche est retenue après une opposition détectée : elle ne peut plus être appelée en attendant la décision. */
  held?: boolean
}

/** Barre d'appel : appeler, raccrocher, muet, clavier, chronomètre. Repli sur `tel:` quand le navigateur ne peut pas appeler. */
export default function CallBar({ controller, leadId, phone, suggestion, disabled, held = false }: Props) {
  const { t } = useI18n()
  const [keypad, setKeypad] = useState(false)
  const mine = controller.leadId === leadId
  const phase = mine ? controller.phase : 'idle'
  const inCall = phase !== 'idle'
  const elsewhere = controller.active && !mine
  const elapsed = useElapsed(mine ? controller.answeredAt : null)
  const failure = mine ? controller.failure : null
  const last = controller.lastCall?.leadId === leadId ? controller.lastCall : null
  const live = phase === 'active' || phase === 'reconnecting'
  const stop = mine ? controller.recordingStop : 'idle'

  if (controller.unavailable) {
    return (
      <div className="softphone-bar" role="group" aria-label={t('calls.group')}>
        <div className="softphone-row">
          <a
            className="portal-button secondary"
            href={`tel:${phone}`}
            aria-disabled={!phone || disabled || held}
            onClick={(event) => {
              if (!phone || disabled || held) event.preventDefault()
            }}
          >
            <Phone size={16} aria-hidden="true" /> {t('calls.call')}
          </a>
        </div>
        <p className="softphone-notice" role="status">
          {t(`calls.fallback.${controller.unavailable}` as MessageKey)}
        </p>
        {controller.unavailable === 'MIC_DENIED' && (
          <button type="button" className="portal-button secondary softphone-retry" onClick={controller.retry}>
            {t('calls.fallback.retry')}
          </button>
        )}
      </div>
    )
  }

  const status = last?.record?.status
  const summary = last
    ? last.record?.answeredBy === 'MACHINE'
      ? t('calls.status.MACHINE')
      : status && FINAL_CALL_STATUSES.includes(status) && status !== 'COMPLETED'
        ? t(`calls.status.${status}` as MessageKey)
        : status === 'COMPLETED'
          ? t('calls.ended', {
              duration: formatDuration(last.record?.durationSec ?? last.elapsedSec),
            })
          : t('calls.status.pending')
    : ''

  return (
    <div className="softphone-bar" role="group" aria-label={t('calls.group')}>
      <div className="softphone-row">
        {inCall ? (
          <button
            type="button"
            className="portal-button softphone-hangup"
            onClick={controller.hangup}
            disabled={phase === 'ending'}
          >
            <PhoneOff size={16} aria-hidden="true" /> {t('calls.hangup')}
          </button>
        ) : (
          <button
            type="button"
            className="portal-button"
            aria-label={t('calls.callAria')}
            title={held ? t('calls.held') : !phone ? t('calls.noPhone') : undefined}
            disabled={disabled || held || !phone || elsewhere || controller.checking}
            onClick={() => {
              setKeypad(false)
              controller.start(leadId)
            }}
          >
            <Phone size={16} aria-hidden="true" /> {t('calls.call')}
          </button>
        )}
        {phase === 'active' || phase === 'reconnecting' ? (
          <>
            <button
              type="button"
              className="portal-button secondary"
              aria-pressed={controller.muted}
              onClick={controller.toggleMute}
            >
              {controller.muted ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}{' '}
              {controller.muted ? t('calls.unmute') : t('calls.mute')}
            </button>
            <button
              type="button"
              className="portal-button secondary"
              aria-expanded={keypad}
              onClick={() => setKeypad((value) => !value)}
            >
              <Grid3x3 size={16} aria-hidden="true" /> {keypad ? t('calls.keypadHide') : t('calls.keypad')}
            </button>
          </>
        ) : null}
        {phase === 'active' && (
          <span className="softphone-timer" role="timer" aria-label={t('calls.timer')}>
            {formatDuration(elapsed)}
          </span>
        )}
      </div>
      <p className="softphone-state" role="status" aria-live="polite">
        {controller.checking
          ? t('calls.checking')
          : held && !inCall
            ? t('calls.held')
            : elsewhere
              ? t('calls.busyElsewhere')
              : inCall
                ? t(`calls.state.${phase}` as MessageKey)
                : summary || t('calls.state.idle')}
      </p>
      {live && controller.recording.enabled && (
        <div className="softphone-recording" data-state={stop === 'stopped' ? 'stopped' : 'on'}>
          {stop === 'stopped' ? (
            <p className="softphone-recording-state" role="status">
              <MicOff size={14} aria-hidden /> {t('calls.recording.stopped')}
            </p>
          ) : (
            <>
              <p className="softphone-recording-state" role="status">
                <Circle size={10} className="softphone-rec-dot" fill="currentColor" aria-hidden />{' '}
                {t('calls.recording.on')}
                {controller.recording.notice ? ` ${t('calls.recording.notice')}` : ''}
              </p>
              <button
                type="button"
                className="portal-button secondary softphone-objection"
                disabled={stop === 'pending'}
                onClick={controller.stopRecording}
              >
                {stop === 'pending' ? t('calls.recording.stopping') : t('calls.recording.objection')}
              </button>
              {stop === 'failed' && (
                <p className="softphone-error" role="alert">
                  {t('calls.recording.stopFailed')}
                </p>
              )}
            </>
          )}
        </div>
      )}
      {live && controller.callId && controller.recording.enabled && (
        <LiveTranscript callId={controller.callId} apiPrefix={controller.apiPrefix} stopped={stop === 'stopped'} />
      )}
      {failure && (
        <p className="softphone-error" role="alert">
          {t(
            `calls.error.${failure.kind === 'SERVER' ? failure.code : failure.kind === 'NETWORK' ? 'NETWORK' : 'CALL'}` as MessageKey,
          )}
        </p>
      )}
      {!inCall && last && suggestion && (
        <p className="softphone-suggestion">{t('calls.suggested', { outcome: suggestion })}</p>
      )}
      {keypad && (phase === 'active' || phase === 'reconnecting') && (
        <div className="softphone-keypad" role="group" aria-label={t('calls.keypad')}>
          {KEYPAD.map((digit) => (
            <button
              type="button"
              key={digit}
              className="portal-button secondary"
              aria-label={t('calls.digit', { digit })}
              onClick={() => controller.sendDigit(digit)}
            >
              {digit}
            </button>
          ))}
        </div>
      )}
      {controller.microphones.length > 1 && (
        <label className="softphone-microphone">
          {t('calls.microphone')}
          <select
            className="portal-input"
            value={
              controller.microphones.some((mic) => mic.id === controller.microphoneId) ? controller.microphoneId : ''
            }
            onChange={(event) => controller.setMicrophone(event.target.value)}
          >
            <option value="">{t('calls.microphoneDefault')}</option>
            {controller.microphones.map((mic) => (
              <option key={mic.id} value={mic.id}>
                {mic.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
