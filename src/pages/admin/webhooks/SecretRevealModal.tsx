import { useState } from 'react'
import { useI18n } from '../../../context/I18nContext'

interface Props {
  secret: string
  endpointName: string
  onClose: () => void
}

/**
 * Révélation unique du secret d'un endpoint : le serveur ne le renverra
 * jamais plus, l'avertissement doit donc être explicite.
 */
export default function SecretRevealModal({ secret, endpointName, onClose }: Props) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div
        className="confirm-modal"
        style={{ maxWidth: 640, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <div className="confirm-modal__header">
          <h2 className="confirm-modal__title">{t('adminTech.webhooks.secretTitle', { name: endpointName })}</h2>
        </div>
        <div className="confirm-modal__body">
          <p className="admin-info" style={{ margin: 0 }}>
            {t('adminTech.webhooks.secretWarningLead')} <code>X-Venio-Signature</code>{' '}
            {t('adminTech.webhooks.secretWarningTail')}
          </p>
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(0,0,0,0.3)',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              fontSize: '0.9rem',
            }}
          >
            {secret}
          </div>
          <button type="button" onClick={copy} className="portal-button" style={{ marginTop: 12, width: '100%' }}>
            {copied ? t('adminTech.webhooks.copied') : t('adminTech.webhooks.copySecret')}
          </button>
        </div>
        <div className="confirm-modal__footer">
          <button
            type="button"
            className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info"
            onClick={onClose}
          >
            {t('adminTech.webhooks.copiedClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
