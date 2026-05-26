import ModalShell from './ModalShell'
import type { GeneratedCredentials } from './types'

interface Props {
  credentials: GeneratedCredentials
  copiedField: string | null
  onCopy: (value: string, fieldKey: string) => void
  onClose: () => void
}

export default function CredentialsModal({ credentials, copiedField, onCopy, onClose }: Props) {
  const ingestUrl = `https://venio.paris/api/external/${credentials.sourceSlug}/entries`
  const envBlock = [
    `VENIO_API_KEY=${credentials.apiKey}`,
    `VENIO_HMAC_SECRET=${credentials.webhookSecret}`,
    `VENIO_INGEST_URL=${ingestUrl}`,
    'VENIO_API_VERSION=2026-01',
  ].join('\n')

  const title =
    credentials.context === 'rotated'
      ? `🔄 Nouvelles clés pour ${credentials.sourceName}`
      : `🎉 Intégration ${credentials.sourceName} créée`

  return (
    <ModalShell title={title} onClose={onClose} closeOnBackdrop={false} wide>
      <div
        style={{
          fontSize: '0.85rem',
          color: 'rgba(255,255,255,0.65)',
          marginTop: -4,
          marginBottom: 14,
        }}
      >
        Slug&nbsp;:{' '}
        <code
          style={{
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            background: 'rgba(15,15,20,0.6)',
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          {credentials.sourceSlug}
        </code>
      </div>

      <div
        style={{
          padding: '12px 14px',
          background: 'rgba(251,191,36,0.10)',
          border: '1px solid rgba(251,191,36,0.40)',
          borderRadius: 10,
          color: '#fde68a',
          fontSize: '0.88rem',
          lineHeight: 1.5,
        }}
      >
        ⚠️ Ces valeurs ne s'afficheront <strong>PLUS JAMAIS</strong>.
        <br />
        Stocke-les immédiatement dans un gestionnaire de secrets sécurisé.
        {credentials.warning && (
          <div style={{ marginTop: 8, fontSize: '0.82rem', opacity: 0.85 }}>
            {credentials.warning}
          </div>
        )}
      </div>

      <SecretField
        label="VENIO_API_KEY"
        value={credentials.apiKey}
        color="#7dd3fc"
        borderColor="rgba(14,165,233,0.35)"
        fieldKey="apiKey"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <SecretField
        label="VENIO_HMAC_SECRET"
        value={credentials.webhookSecret}
        color="#c084fc"
        borderColor="rgba(192,132,252,0.35)"
        fieldKey="webhookSecret"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <SecretField
        label="VENIO_INGEST_URL"
        value={ingestUrl}
        color="#86efac"
        borderColor="rgba(134,239,172,0.35)"
        fieldKey="ingestUrl"
        copiedField={copiedField}
        onCopy={onCopy}
      />

      <div style={{ marginTop: 22 }}>
        <div
          style={{
            fontSize: '0.78rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'rgba(255,255,255,0.55)',
            marginBottom: 6,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>Variables à coller dans le .env du service</span>
          <button
            type="button"
            className="portal-button secondary"
            style={{ fontSize: '0.72rem', padding: '4px 10px' }}
            onClick={() => onCopy(envBlock, 'envBlock')}
          >
            {copiedField === 'envBlock' ? '✓ Copié' : '📋 Tout copier'}
          </button>
        </div>
        <pre
          style={{
            margin: 0,
            padding: '14px 16px',
            background: 'rgba(15,15,20,0.85)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 10,
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.82rem',
            color: 'rgba(255,255,255,0.88)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            userSelect: 'all',
          }}
        >
          {envBlock}
        </pre>
      </div>

      <div
        style={{
          marginTop: 22,
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button type="button" className="portal-button" onClick={onClose}>
          ✅ J'ai bien noté les credentials → Fermer
        </button>
      </div>
    </ModalShell>
  )
}

interface SecretFieldProps {
  label: string
  value: string
  color: string
  borderColor: string
  fieldKey: string
  copiedField: string | null
  onCopy: (value: string, fieldKey: string) => void
}

function SecretField({
  label,
  value,
  color,
  borderColor,
  fieldKey,
  copiedField,
  onCopy,
}: SecretFieldProps) {
  return (
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
        {label}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'stretch',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            flex: '1 1 280px',
            padding: '12px 14px',
            background: 'rgba(15,15,20,0.85)',
            border: `1px solid ${borderColor}`,
            borderRadius: 10,
            fontFamily: "'SF Mono', Menlo, Consolas, monospace",
            fontSize: '0.86rem',
            color,
            wordBreak: 'break-all',
            userSelect: 'all',
            minWidth: 0,
          }}
        >
          {value}
        </div>
        <button
          type="button"
          className="portal-button secondary"
          onClick={() => onCopy(value, fieldKey)}
          style={{ whiteSpace: 'nowrap' }}
        >
          {copiedField === fieldKey ? '✓ Copié' : '📋 Copier'}
        </button>
      </div>
    </div>
  )
}
