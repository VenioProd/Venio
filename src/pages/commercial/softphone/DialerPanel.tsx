import { Pause, Phone, Play, SkipForward } from 'lucide-react'
import { useI18n, type MessageKey } from '../../../context/I18nContext'
import type { DialerConfig } from '../../../services/calls'
import { DIALER_MODES, type Dialer, type DialerMode } from './dialer'
import './softphone.css'

interface Props {
  mode: DialerMode
  onMode: (mode: DialerMode) => void
  dialer: Dialer
  config: DialerConfig
  /** Société de la fiche ouverte. */
  company: string | null
  /** Un appel est en cours (ou en préparation). */
  calling: boolean
  /** La fiche ouverte attend son résultat. */
  pendingOutcome: boolean
  /** La file enregistre ou charge. */
  busy: boolean
  /** Le poste ne peut pas appeler depuis le navigateur (repli `tel:`) : seul le mode « au clic » reste. */
  unavailable: boolean
  onSkip: () => void
  /** CRM de l'équipe : le choix du mode en trois cartes (refonte), au lieu des boutons de l'espace externe. */
  cards?: boolean
  /** Pourquoi les autres modes sont indisponibles (cartes seulement). */
  unavailableWhy?: 'phone' | 'bridge'
}

/** Choix du mode d'appel et état de l'enchaînement, au-dessus de la file. */
export default function DialerPanel(props: Props) {
  const { mode, onMode, dialer, config, company, calling, pendingOutcome, busy, unavailable, onSkip } = props
  const { cards = false, unavailableWhy = 'phone' } = props
  const { t } = useI18n()
  const name = company ?? '—'
  const helpFor = (value: DialerMode) =>
    value === 'click'
      ? t('calls.dialer.help.click')
      : value === 'preview'
        ? config.previewDelaySec > 0
          ? t('calls.dialer.help.preview', { delay: config.previewDelaySec })
          : t('calls.dialer.help.previewClick')
        : t('calls.dialer.help.power', { delay: config.powerDelaySec })
  const help = helpFor(mode)
  const changeMode = (value: DialerMode) => {
    if (value === mode) return
    if (dialer.running) dialer.pause()
    onMode(value)
  }

  let state = ''
  if (dialer.running) {
    if (calling) state = t('calls.dialer.state.calling', { company: name })
    else if (busy) state = t('calls.dialer.state.saving')
    else if (pendingOutcome) state = t('calls.dialer.state.wrapUp', { company: name })
    else if (dialer.countdown !== null)
      state = t('calls.dialer.state.countdown', { company: name, seconds: dialer.countdown })
    else if (dialer.waitingClick) state = t('calls.dialer.state.waitClick', { company: name })
  } else if (dialer.stop) {
    const reason = dialer.stop.code ? t(`calls.error.${dialer.stop.code}` as MessageKey) : ''
    state = t(`calls.dialer.stop.${dialer.stop.reason}` as MessageKey, { reason })
  } else if (mode !== 'click') state = t('calls.dialer.state.idle')

  return (
    <section
      className="dialer-panel"
      aria-label={t('calls.dialer.group')}
      data-running={mode !== 'click' && dialer.running ? 'true' : undefined}
    >
      {cards ? (
        <fieldset className="crm-desk-modes" disabled={calling}>
          <legend className="crm-ui-sr-only">{t('calls.dialer.group')}</legend>
          {DIALER_MODES.map((value) => {
            const blocked = unavailable && value !== 'click'
            return (
              <label key={value} className="crm-desk-mode" data-blocked={blocked ? 'true' : undefined}>
                <input
                  type="radio"
                  name="dialer-mode"
                  value={value}
                  checked={mode === value}
                  disabled={blocked}
                  onChange={() => changeMode(value)}
                />
                <span className="crm-desk-mode__text">
                  <b>{t(`calls.dialer.mode.${value}` as MessageKey)}</b>
                  <span>
                    {blocked
                      ? t(
                          unavailableWhy === 'bridge'
                            ? 'crmProspect.mode.unavailableBridge'
                            : 'crmProspect.mode.unavailablePhone',
                        )
                      : helpFor(value)}
                  </span>
                </span>
              </label>
            )
          })}
        </fieldset>
      ) : (
        <div className="dialer-modes" role="group" aria-label={t('calls.dialer.group')}>
          {DIALER_MODES.map((value) => (
            <button
              type="button"
              key={value}
              className={`portal-button${mode === value ? '' : ' secondary'}`}
              aria-pressed={mode === value}
              disabled={calling || (unavailable && value !== 'click')}
              onClick={() => changeMode(value)}
            >
              {t(`calls.dialer.mode.${value}` as MessageKey)}
            </button>
          ))}
        </div>
      )}
      {cards ? (
        mode !== 'click' &&
        config.voicemailDetection && <p className="dialer-help">{t('calls.dialer.help.voicemail')}</p>
      ) : (
        <p className="dialer-help">
          {help}
          {mode !== 'click' && config.voicemailDetection ? ` ${t('calls.dialer.help.voicemail')}` : ''}
        </p>
      )}
      {mode !== 'click' && (
        <div className="dialer-controls">
          {dialer.running ? (
            <button type="button" className="portal-button secondary" onClick={dialer.pause}>
              <Pause size={16} aria-hidden="true" /> {t('calls.dialer.pause')}
            </button>
          ) : (
            <button type="button" className="portal-button" disabled={unavailable} onClick={dialer.start}>
              <Play size={16} aria-hidden="true" />{' '}
              {dialer.stop && dialer.stop.reason !== 'EMPTY' ? t('calls.dialer.resume') : t('calls.dialer.start')}
            </button>
          )}
          {dialer.running && (dialer.countdown !== null || dialer.waitingClick) && !calling && (
            <>
              <button type="button" className="portal-button" onClick={dialer.callNow}>
                <Phone size={16} aria-hidden="true" /> {t('calls.dialer.callNow')}
              </button>
              <button type="button" className="portal-button secondary" disabled={busy} onClick={onSkip}>
                <SkipForward size={16} aria-hidden="true" /> {t('calls.dialer.skip')}
              </button>
            </>
          )}
          {state && (
            <p
              className="dialer-state"
              role="status"
              aria-live="polite"
              data-stopped={!dialer.running && dialer.stop && dialer.stop.reason !== 'PAUSED' ? 'true' : undefined}
            >
              {state}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
