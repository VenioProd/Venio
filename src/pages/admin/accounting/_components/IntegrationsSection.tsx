import { Link } from 'react-router-dom'
import type { IExternalSource, ExternalSourceStatus } from '@/types/accounting'

interface IntegrationsSectionProps {
  canManage: boolean
  sources: IExternalSource[]
  rotatingId: string | null
  onOpenCreate: () => void
  onRotate: (source: IExternalSource) => void
  onRequestRevoke: (source: IExternalSource) => void
}

export default function IntegrationsSection(props: IntegrationsSectionProps) {
  const { canManage, sources, rotatingId, onOpenCreate, onRotate, onRequestRevoke } = props

  return (
    <section className="accounting-card">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0 }}>Intégrations externes</h2>
        <button
          type="button"
          className="portal-button"
          onClick={onOpenCreate}
          disabled={!canManage}
        >
          + Nouvelle intégration
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: '14px 16px',
          background:
            'linear-gradient(135deg, rgba(56,189,248,0.10) 0%, rgba(192,132,252,0.10) 100%)',
          border: '1px solid rgba(125,211,252,0.25)',
          borderRadius: 10,
          fontSize: '0.88rem',
          lineHeight: 1.55,
          color: 'rgba(255,255,255,0.82)',
        }}
      >
        <p style={{ margin: 0 }}>
          Tout service tiers (Stripe, Shopify, Arrow, votre propre back-office…) peut pousser ses
          écritures comptables dans Venio via une API sécurisée. Chaque intégration
          dispose&nbsp;:
        </p>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div>
            <span style={{ color: '#7dd3fc', fontWeight: 600 }}>🔑 Clé API (X-Api-Key)</span>
            <div style={{ paddingLeft: 22, color: 'rgba(255,255,255,0.7)', fontSize: '0.84rem' }}>
              Identifie le service qui parle. Comme un mot de passe d'application.
            </div>
          </div>
          <div>
            <span style={{ color: '#c084fc', fontWeight: 600 }}>
              ✍️ Secret HMAC (X-Venio-Signature)
            </span>
            <div style={{ paddingLeft: 22, color: 'rgba(255,255,255,0.7)', fontSize: '0.84rem' }}>
              Signature cryptographique sur chaque requête. Empêche les attaques
              «&nbsp;man-in-the-middle&nbsp;» (modification du contenu en transit) et garantit
              l'authenticité de l'émetteur, même si la clé API était compromise.
            </div>
          </div>
        </div>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: '0.8rem',
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          📚 Documentation complète&nbsp;:{' '}
          <code
            style={{
              background: 'rgba(15,15,20,0.6)',
              padding: '1px 6px',
              borderRadius: 4,
              fontSize: '0.78rem',
            }}
          >
            docs/accounting/ARROW_INGESTION_API.md
          </code>
        </p>
      </div>

      {sources.length === 0 ? (
        <div className="accounting-empty" style={{ marginTop: 18 }}>
          <div style={{ fontSize: '2rem', opacity: 0.45 }}>🔌</div>
          Aucune intégration configurée.
          <div className="hint">
            Cliquez sur «&nbsp;+ Nouvelle intégration&nbsp;» pour commencer.
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          {sources.map(source => (
            <IntegrationCard
              key={source._id}
              source={source}
              canManage={canManage}
              rotating={rotatingId === source._id}
              onRotate={() => onRotate(source)}
              onRequestRevoke={() => onRequestRevoke(source)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface IntegrationCardProps {
  source: IExternalSource
  canManage: boolean
  rotating: boolean
  onRotate: () => void
  onRequestRevoke: () => void
}

function IntegrationCard({
  source,
  canManage,
  rotating,
  onRotate,
  onRequestRevoke,
}: IntegrationCardProps) {
  return (
    <div
      style={{
        padding: '16px 18px',
        background: 'rgba(15,15,20,0.55)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '1rem',
              color: 'rgba(255,255,255,0.92)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            {source.name}
            <StatusBadge status={source.status} />
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: '0.82rem',
              color: 'rgba(255,255,255,0.55)',
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
              {source.slug}
            </code>
          </div>
          {source.description && (
            <div
              style={{
                marginTop: 6,
                fontSize: '0.82rem',
                color: 'rgba(255,255,255,0.65)',
              }}
            >
              {source.description}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Link
            to={`/admin/comptabilite/sources-externes/${source._id}`}
            className="portal-button secondary"
            style={{ textDecoration: 'none' }}
          >
            ⚙️ Configuration détaillée
          </Link>
          <button
            type="button"
            className="portal-button secondary"
            onClick={onRotate}
            disabled={!canManage || rotating}
            title="Génère une nouvelle paire clé / secret et invalide l'ancienne"
          >
            {rotating ? '⏳ Rotation…' : '🔄 Régénérer les clés'}
          </button>
          <button
            type="button"
            className="portal-button"
            onClick={onRequestRevoke}
            disabled={!canManage}
            style={{
              background: 'rgba(220,38,38,0.18)',
              border: '1px solid rgba(220,38,38,0.45)',
              color: '#fecaca',
            }}
            title="Supprime définitivement l'intégration"
          >
            🗑️ Révoquer
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
          fontSize: '0.82rem',
        }}
      >
        <StatCell
          label="Préfixe clé"
          value={source.apiKeyPrefix ? `${source.apiKeyPrefix}…` : '—'}
          mono
        />
        <StatCell
          label="Dernier ping"
          value={source.lastSeenAt ? formatRelative(source.lastSeenAt) : 'Jamais'}
          title={
            source.lastSeenAt ? new Date(source.lastSeenAt).toLocaleString('fr-FR') : undefined
          }
        />
        <StatCell label="Ingérées" value={String(source.totalIngested ?? 0)} />
        <StatCell label="Rejetées" value={String(source.totalRejected ?? 0)} />
        <StatCell label="Doublons" value={String(source.totalDuplicates ?? 0)} />
      </div>

      {source.lastError && (
        <div
          style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.35)',
            borderRadius: 8,
            fontSize: '0.78rem',
            color: '#fecaca',
          }}
        >
          ⚠️ Dernière erreur&nbsp;: {source.lastError}
          {source.lastErrorAt && (
            <span style={{ opacity: 0.7, marginLeft: 6 }}>
              ({new Date(source.lastErrorAt).toLocaleString('fr-FR')})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ExternalSourceStatus }) {
  const map: Record<
    ExternalSourceStatus,
    { className: string; label: string; style?: React.CSSProperties }
  > = {
    ACTIVE: { className: 'accounting-badge validated', label: 'Active' },
    PAUSED: {
      className: 'accounting-badge',
      label: 'En pause',
      style: {
        background: 'rgba(251,146,60,0.15)',
        color: '#fdba74',
        border: '1px solid rgba(251,146,60,0.4)',
      },
    },
    DISABLED: {
      className: 'accounting-badge',
      label: 'Désactivée',
      style: {
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.55)',
        border: '1px solid rgba(255,255,255,0.12)',
      },
    },
  }
  const entry = map[status] || map.DISABLED
  return (
    <span
      className={entry.className}
      style={{ fontSize: '0.7rem', ...entry.style }}
      title={`Statut: ${status}`}
    >
      {entry.label}
    </span>
  )
}

function StatCell({
  label,
  value,
  mono,
  title,
}: {
  label: string
  value: string
  mono?: boolean
  title?: string
}) {
  return (
    <div
      title={title}
      style={{
        padding: '8px 10px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: '0.68rem',
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          color: 'rgba(255,255,255,0.45)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          color: 'rgba(255,255,255,0.88)',
          fontFamily: mono ? "'SF Mono', Menlo, Consolas, monospace" : undefined,
          fontSize: mono ? '0.82rem' : '0.88rem',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  if (Number.isNaN(diffMs)) return iso
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return "à l'instant"
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `il y a ${hr} h`
  const day = Math.floor(hr / 24)
  if (day < 30) return `il y a ${day} j`
  return date.toLocaleDateString('fr-FR')
}
