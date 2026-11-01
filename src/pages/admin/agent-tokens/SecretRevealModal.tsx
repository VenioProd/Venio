import { useI18n } from '../../../context/I18nContext'

interface Props {
  secret: string
  tokenName: string
  copied: boolean
  onCopy: () => void
  onClose: () => void
}

export default function SecretRevealModal({ secret, tokenName, copied, onCopy, onClose }: Props) {
  const { t } = useI18n()
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
          <h2 className="confirm-modal__title">{t('adminTech.agentTokens.createdTitle', { name: tokenName })}</h2>
        </div>
        <div className="confirm-modal__body">
          <p
            style={{
              color: 'var(--warning)',
              fontWeight: 500,
              background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
              padding: '10px 12px',
              borderRadius: 'var(--r-sm)',
            }}
          >
            {t('adminTech.agentTokens.secretWarning')}
          </p>
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 'var(--r-sm)',
              fontFamily: 'var(--font-mono)',
              wordBreak: 'break-all',
              fontSize: '0.9rem',
            }}
          >
            {secret}
          </div>
          <button type="button" onClick={onCopy} className="portal-button" style={{ marginTop: 12, width: '100%' }}>
            {copied ? t('adminTech.agentTokens.copied') : t('adminTech.agentTokens.copySecret')}
          </button>
        </div>
        <div className="confirm-modal__footer">
          <button
            type="button"
            className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info"
            onClick={onClose}
          >
            {t('adminTech.agentTokens.copiedClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
