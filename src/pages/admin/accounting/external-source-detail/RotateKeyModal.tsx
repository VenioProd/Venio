import { useI18n } from '../../../../context/I18nContext'

interface RotateKeyModalProps {
  apiKey: string
  webhookSecret: string
  warning?: string
  copyState: { key: boolean; secret: boolean }
  onCopy: (text: string, key: 'key' | 'secret') => void
  onClose: () => void
}

export default function RotateKeyModal({
  apiKey,
  webhookSecret,
  warning,
  copyState,
  onCopy,
  onClose,
}: RotateKeyModalProps) {
  const { t } = useI18n()
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 16,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div
        className="accounting-card"
        style={{
          maxWidth: 720,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>{t('accVat.esd.rotateHeading')}</h2>

        <div
          className="accounting-message"
          style={{
            background: 'color-mix(in srgb, var(--warning) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
            color: 'var(--warning)',
          }}
        >
          ⚠ {t('accVat.esd.rotateWarning')}
          {warning && <div style={{ marginTop: 6, fontSize: '0.82rem', opacity: 0.85 }}>{warning}</div>}
        </div>

        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: '0.78rem',
              textTransform: 'none',
              letterSpacing: 'normal',
              color: 'var(--text-secondary)',
              marginBottom: 6,
            }}
          >
            {t('accVat.esd.apiKey')}
          </div>
          <div
            style={{
              padding: '14px 16px',
              background: 'color-mix(in srgb, var(--bg-secondary) 85%, transparent)',
              border: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)',
              borderRadius: 'var(--r-md)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.92rem',
              color: 'var(--primary)',
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {apiKey}
          </div>
          <button
            type="button"
            className="portal-button secondary"
            style={{ marginTop: 8 }}
            onClick={() => onCopy(apiKey, 'key')}
          >
            {copyState.key ? t('accVat.modal.copied') : t('accVat.src.copyKey')}
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: '0.78rem',
              textTransform: 'none',
              letterSpacing: 'normal',
              color: 'var(--text-secondary)',
              marginBottom: 6,
            }}
          >
            {t('accVat.esd.webhookSecret')}
          </div>
          <div
            style={{
              padding: '14px 16px',
              background: 'color-mix(in srgb, var(--bg-secondary) 85%, transparent)',
              border: '1px solid color-mix(in srgb, var(--primary) 35%, transparent)',
              borderRadius: 'var(--r-md)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.92rem',
              color: 'var(--primary)',
              wordBreak: 'break-all',
              userSelect: 'all',
            }}
          >
            {webhookSecret}
          </div>
          <button
            type="button"
            className="portal-button secondary"
            style={{ marginTop: 8 }}
            onClick={() => onCopy(webhookSecret, 'secret')}
          >
            {copyState.secret ? t('accVat.modal.copied') : t('accVat.src.copySecret')}
          </button>
        </div>

        <div
          style={{
            marginTop: 24,
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
          }}
        >
          <button type="button" className="portal-button" onClick={onClose}>
            {t('accVat.src.noted')}
          </button>
        </div>
      </div>
    </div>
  )
}
