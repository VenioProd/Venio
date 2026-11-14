import { useState } from 'react'
import { createPortal } from 'react-dom'
import { PhoneOff } from 'lucide-react'
import ConfirmModal from '../ConfirmModal'
import { CrmBanner } from '../admin/crm-ui'
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
  const [liftOpen, setLiftOpen] = useState(false)
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
    <>
      <CrmBanner
        tone="red"
        role="alert"
        icon={<PhoneOff />}
        title={t('callInsights.optOut.title')}
        actions={
          <div className="ci-optout-body">
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
                        className="crm-ui-btn crm-ui-btn--danger crm-ui-btn--sm"
                        disabled={busy}
                        onClick={() => void run('CONFIRM', onConfirm)}
                      >
                        {t('callInsights.optOut.confirm')}
                      </button>
                    )}
                    {onLift && (
                      <button
                        type="button"
                        className="crm-ui-btn crm-ui-btn--sm"
                        disabled={busy}
                        onClick={() => setLiftOpen(true)}
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
        }
      >
        {!done && t('callInsights.optOut.body')}
      </CrmBanner>
      {onLift &&
        createPortal(
          <ConfirmModal
            isOpen={liftOpen}
            variant="warning"
            title={t('callInsights.optOut.liftTitle')}
            message={t('callInsights.optOut.liftConfirm')}
            confirmLabel={t('callInsights.optOut.liftAction')}
            cancelLabel={t('common.cancel')}
            onCancel={() => setLiftOpen(false)}
            onConfirm={() => {
              setLiftOpen(false)
              void run('DISMISS', onLift)
            }}
          />,
          document.body,
        )}
    </>
  )
}
