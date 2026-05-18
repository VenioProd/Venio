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
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>
          Nouvelle clé API et nouveau secret
        </h2>

        <div
          className="accounting-message"
          style={{
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid rgba(251,191,36,0.4)',
            color: '#fde68a',
          }}
        >
          ⚠ L'ancienne clé est invalidée. Ces nouvelles valeurs ne seront PLUS jamais
          affichées. Mettez à jour la configuration du site tiers immédiatement.
          {warning && (
            <div style={{ marginTop: 6, fontSize: '0.82rem', opacity: 0.85 }}>
              {warning}
            </div>
          )}
        </div>

        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: '0.78rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'rgba(255,255,255,0.55)',
              marginBottom: 6,
            }}
          >
            Clé API
          </div>
          <div
            style={{
              padding: '14px 16px',
              background: 'rgba(15,15,20,0.85)',
              border: '1px solid rgba(14,165,233,0.35)',
              borderRadius: 10,
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
              fontSize: '0.92rem',
              color: '#7dd3fc',
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
            {copyState.key ? '✓ Copié' : '📋 Copier la clé'}
          </button>
        </div>

        <div style={{ marginTop: 18 }}>
          <div
            style={{
              fontSize: '0.78rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'rgba(255,255,255,0.55)',
              marginBottom: 6,
            }}
          >
            Secret de signature webhook
          </div>
          <div
            style={{
              padding: '14px 16px',
              background: 'rgba(15,15,20,0.85)',
              border: '1px solid rgba(192,132,252,0.35)',
              borderRadius: 10,
              fontFamily: "'SF Mono', Menlo, Consolas, monospace",
              fontSize: '0.92rem',
              color: '#c084fc',
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
            {copyState.secret ? '✓ Copié' : '📋 Copier le secret'}
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
          <button
            type="button"
            className="portal-button"
            onClick={onClose}
          >
            J'ai bien noté → Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
