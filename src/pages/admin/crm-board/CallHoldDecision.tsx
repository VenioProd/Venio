import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ConfirmModal from '../../../components/ConfirmModal'
import { apiFetch } from '../../../lib/api'
import { useI18n } from '../../../context/I18nContext'
import { formatDateTime } from '../../../i18n/format'
import { TEAM_CALL_DESK_PREFIX } from './teamDeskApi'
import './lead/lead.css'

interface HoldView {
  at: string
  quote: string | null
  quoteVerified: boolean
  analysisErased: boolean
  author: { _id: string; name: string } | null
}

type Action = 'CONFIRM' | 'DISMISS'

/**
 * Retenue d'opposition sur la fiche d'un externe non transmise : l'équipe ne
 * lit pas ses appels, elle décide sur la seule citation qui a déclenché la
 * retenue, sa date et l'auteur de l'appel.
 */
const CallHoldDecision: React.FC<{ leadId: string; onDecided: () => void }> = ({ leadId, onDecided }) => {
  const { t } = useI18n()
  const [hold, setHold] = useState<HoldView | null>(null)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [busy, setBusy] = useState(false)
  // Une clé par décision : un double envoi rejoue la même réponse.
  const keyRef = useRef<{ action: Action; key: string } | null>(null)

  useEffect(() => {
    let live = true
    apiFetch<{ hold: HoldView }>(`${TEAM_CALL_DESK_PREFIX}/leads/${leadId}/call-hold`)
      .then((data) => live && setHold(data.hold))
      .catch(() => live && setError(t('callHold.loadError')))
    return () => {
      live = false
    }
  }, [leadId, t])

  const decide = async (action: Action) => {
    setConfirm(null)
    if (keyRef.current?.action !== action) keyRef.current = { action, key: crypto.randomUUID() }
    setBusy(true)
    setError('')
    try {
      await apiFetch(`${TEAM_CALL_DESK_PREFIX}/leads/${leadId}/call-hold`, {
        method: 'POST',
        headers: { 'Idempotency-Key': keyRef.current.key },
        body: JSON.stringify({ action }),
      })
      onDecided()
    } catch {
      setError(t('callHold.decideError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="crm-hold-decision" role="group" aria-label={t('callHold.title')}>
      {!hold && !error && <p className="crm-hold-decision-meta">{t('callHold.loading')}</p>}
      {hold && (
        <>
          <p className="crm-hold-decision-meta">
            {t('callHold.meta', {
              date: formatDateTime(hold.at),
              author: hold.author?.name ?? t('callHold.unknownAuthor'),
            })}
          </p>
          {hold.quote ? (
            <blockquote className="crm-hold-decision-quote">{hold.quote}</blockquote>
          ) : (
            <p className="crm-hold-decision-meta">{t(hold.analysisErased ? 'callHold.erased' : 'callHold.noQuote')}</p>
          )}
          {hold.quote && !hold.quoteVerified && <p className="crm-hold-decision-meta">{t('callHold.unverified')}</p>}
          <div className="crm-hold-decision-actions">
            <button
              type="button"
              className="crm-ui-btn crm-ui-btn--danger crm-ui-btn--sm"
              disabled={busy}
              onClick={() => setConfirm('CONFIRM')}
            >
              {t('callHold.confirm')}
            </button>
            <button
              type="button"
              className="crm-ui-btn crm-ui-btn--sm"
              disabled={busy}
              onClick={() => setConfirm('DISMISS')}
            >
              {t('callHold.dismiss')}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="crm-hold-decision-meta" role="alert">
          {error}
        </p>
      )}
      {createPortal(
        <ConfirmModal
          isOpen={confirm !== null}
          title={t(confirm === 'DISMISS' ? 'callHold.dismissTitle' : 'callHold.confirmTitle')}
          message={t(confirm === 'DISMISS' ? 'callHold.dismissBody' : 'callHold.confirmBody')}
          confirmLabel={t(confirm === 'DISMISS' ? 'callHold.dismiss' : 'callHold.confirm')}
          variant={confirm === 'DISMISS' ? 'warning' : 'danger'}
          onConfirm={() => confirm && void decide(confirm)}
          onCancel={() => setConfirm(null)}
        />,
        document.body,
      )}
    </div>
  )
}

export default CallHoldDecision
