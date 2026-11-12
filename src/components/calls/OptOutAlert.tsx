import { useState } from 'react'
import { PhoneOff } from 'lucide-react'
import { useI18n } from '../../context/I18nContext'
import { apiErrorCode } from '../../services/callInsights'
import { QuoteLine } from './ui'
import './callInsights.css'

interface OptOutAlertProps {
  quote: string | null
  onQuote?: (quote: string) => void
  /** La fiche est retenue (hors de la file) en attendant une décision. */
  held?: boolean
  /** Confirmer l'opposition : le numéro ne sera plus appelé. Absent : pas de geste (consultation). */
  onConfirm?: () => Promise<void>
  /** Lever la retenue : réservé à l'équipe. */
  onLift?: () => Promise<void>
}

/** Alerte prioritaire : le prospect s'est opposé à être rappelé. Confirmer est un geste explicite ; lever revient à l'équipe. */
export default function OptOutAlert({ quote, onQuote, held = false, onConfirm, onLift }: OptOutAlertProps) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<'CONFIRM' | 'DISMISS' | null>(null)

  async function run(action: 'CONFIRM' | 'DISMISS', handler: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await handler()
      setDone(action)
    } catch (failure) {
      setError(
        apiErrorCode(failure) === 'NO_CALL_HOLD' ? t('callInsights.optOut.noHold') : t('callInsights.optOut.error'),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ci-optout" role="alert">
      <PhoneOff size={20} aria-hidden />
      <div>
        <strong>{t('callInsights.optOut.title')}</strong>
        {!done && <p>{t('callInsights.optOut.body')}</p>}
        {quote && <QuoteLine quote={quote} onQuote={onQuote} />}
        {done === 'CONFIRM' ? (
          <p className="ci-optout-state" role="status">
            {t('callInsights.optOut.confirmed')}
          </p>
        ) : done === 'DISMISS' ? (
          <p className="ci-optout-state" role="status">
            {t('callInsights.optOut.lifted')}
          </p>
        ) : held ? (
          <>
            <p className="ci-optout-state">{t('callInsights.optOut.held')}</p>
            {(onConfirm || onLift) && (
              <div className="ci-gestures">
                {onConfirm && (
                  <button
                    type="button"
                    className="portal-button"
                    disabled={busy}
                    onClick={() => void run('CONFIRM', onConfirm)}
                  >
                    {t('callInsights.optOut.confirm')}
                  </button>
                )}
                {onLift && (
                  <button
                    type="button"
                    className="portal-button secondary"
                    disabled={busy}
                    onClick={() => void run('DISMISS', onLift)}
                  >
                    {t('callInsights.optOut.lift')}
                  </button>
                )}
              </div>
            )}
            {onConfirm && !onLift && <p className="ci-muted">{t('callInsights.optOut.teamLifts')}</p>}
          </>
        ) : (
          <p className="ci-muted">{t('callInsights.optOut.settled')}</p>
        )}
        {error && (
          <p className="ci-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
