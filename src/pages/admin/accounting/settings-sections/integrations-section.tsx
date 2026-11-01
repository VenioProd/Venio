import { Link } from 'react-router-dom'
import type { IExternalSource, ExternalSourceStatus } from '../../../../types/accounting'
import { useI18n } from '../../../../context/I18nContext'
import { translate } from '../../../../i18n'
import type { MessageKey } from '../../../../i18n'
import { formatDate, formatDateTime } from '../../../../i18n/format'

const FULL_DATE_TIME: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
}

// ---- Sous-composants Intégrations externes ----

// ---- Sous-composants Intégrations externes ----

interface IntegrationsSectionProps {
  canManage: boolean
  sources: IExternalSource[]
  rotatingId: string | null
  onOpenCreate: () => void
  onRotate: (source: IExternalSource) => void
  onRequestRevoke: (source: IExternalSource) => void
}

export function IntegrationsSection(props: IntegrationsSectionProps) {
  const { canManage, sources, rotatingId, onOpenCreate, onRotate, onRequestRevoke } = props
  const { t } = useI18n()

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
        <h2 style={{ margin: 0 }}>{t('accVat.integ.heading')}</h2>
        <button type="button" className="portal-button" onClick={onOpenCreate} disabled={!canManage}>
          {t('accVat.integ.new')}
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: '14px 16px',
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--primary) 10%, transparent) 0%, color-mix(in srgb, var(--primary) 10%, transparent) 100%)',
          border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
          borderRadius: 'var(--r-md)',
          fontSize: '0.88rem',
          lineHeight: 1.55,
          color: 'var(--text-primary)',
        }}
      >
        <p style={{ margin: 0 }}>{t('accVat.integ.intro')}</p>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>🔑 {t('accVat.integ.apiKeyTitle')}</span>
            <div style={{ paddingLeft: 22, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
              {t('accVat.integ.apiKeyText')}
            </div>
          </div>
          <div>
            <span style={{ color: 'var(--primary)', fontWeight: 600 }}>✍️ {t('accVat.integ.hmacTitle')}</span>
            <div style={{ paddingLeft: 22, color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
              {t('accVat.integ.hmacText')}
            </div>
          </div>
        </div>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
          }}
        >
          📚 {t('accVat.integ.docs')}{' '}
          <code
            style={{
              background: 'color-mix(in srgb, var(--bg-secondary) 60%, transparent)',
              padding: '1px 6px',
              borderRadius: 'var(--r-sm)',
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
          {t('accVat.integ.empty')}
          <div className="hint">{t('accVat.integ.emptyHint')}</div>
        </div>
      ) : (
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          {sources.map((source) => (
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

export function IntegrationCard({ source, canManage, rotating, onRotate, onRequestRevoke }: IntegrationCardProps) {
  const { t } = useI18n()
  return (
    <div
      style={{
        padding: '16px 18px',
        background: 'color-mix(in srgb, var(--bg-secondary) 55%, transparent)',
        border: '1px solid color-mix(in srgb, var(--text-primary) 8%, transparent)',
        borderRadius: 'var(--r-md)',
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
              color: 'var(--text-primary)',
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
              color: 'var(--text-secondary)',
            }}
          >
            {t('accVat.integ.slugLabel')}{' '}
            <code
              style={{
                fontFamily: 'var(--font-mono)',
                background: 'color-mix(in srgb, var(--bg-secondary) 60%, transparent)',
                padding: '1px 6px',
                borderRadius: 'var(--r-sm)',
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
                color: 'var(--text-secondary)',
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
            ⚙️ {t('accVat.integ.configure')}
          </Link>
          <button
            type="button"
            className="portal-button secondary"
            onClick={onRotate}
            disabled={!canManage || rotating}
            title={t('accVat.integ.rotateTitle')}
          >
            {rotating ? t('accVat.integ.rotating') : t('accVat.integ.rotate')}
          </button>
          <button
            type="button"
            className="portal-button"
            onClick={onRequestRevoke}
            disabled={!canManage}
            style={{
              background: 'color-mix(in srgb, var(--critical) 18%, transparent)',
              border: '1px solid color-mix(in srgb, var(--critical) 45%, transparent)',
              color: 'var(--text-secondary)',
            }}
            title={t('accVat.integ.revokeTitle')}
          >
            🗑️ {t('accVat.integ.revoke')}
          </button>
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
          gap: 10,
          fontSize: '0.82rem',
        }}
      >
        <StatCell
          label={t('accVat.integ.keyPrefix')}
          value={source.apiKeyPrefix ? `${source.apiKeyPrefix}…` : '—'}
          mono
        />
        <StatCell
          label={t('accVat.integ.lastPing')}
          value={source.lastSeenAt ? formatRelative(source.lastSeenAt) : t('accVat.integ.never')}
          title={source.lastSeenAt ? formatDateTime(source.lastSeenAt, FULL_DATE_TIME) : undefined}
        />
        <StatCell label={t('accVat.integ.ingested')} value={String(source.totalIngested ?? 0)} />
        <StatCell label={t('accVat.integ.rejected')} value={String(source.totalRejected ?? 0)} />
        <StatCell label={t('accVat.integ.duplicates')} value={String(source.totalDuplicates ?? 0)} />
      </div>

      {source.lastError && (
        <div
          style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'color-mix(in srgb, var(--critical) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--critical) 35%, transparent)',
            borderRadius: 'var(--r-md)',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
          }}
        >
          ⚠️ {t('accVat.integ.lastError')} {source.lastError}
          {source.lastErrorAt && (
            <span style={{ opacity: 0.7, marginLeft: 6 }}>({formatDateTime(source.lastErrorAt, FULL_DATE_TIME)})</span>
          )}
        </div>
      )}
    </div>
  )
}

export function StatusBadge({ status }: { status: ExternalSourceStatus }) {
  const { t } = useI18n()
  const map: Record<ExternalSourceStatus, { className: string; labelKey: MessageKey; style?: React.CSSProperties }> = {
    ACTIVE: { className: 'accounting-badge validated', labelKey: 'accVat.integ.statusActive' },
    PAUSED: {
      className: 'accounting-badge',
      labelKey: 'accVat.integ.statusPaused',
      style: {
        background: 'color-mix(in srgb, var(--warning) 15%, transparent)',
        color: 'var(--warning)',
        border: '1px solid color-mix(in srgb, var(--warning) 40%, transparent)',
      },
    },
    DISABLED: {
      className: 'accounting-badge',
      labelKey: 'accVat.integ.statusDisabled',
      style: {
        background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
        color: 'var(--text-secondary)',
        border: '1px solid color-mix(in srgb, var(--text-primary) 12%, transparent)',
      },
    },
  }
  const entry = map[status] || map.DISABLED
  return (
    <span
      className={entry.className}
      style={{ fontSize: '0.7rem', ...entry.style }}
      title={t('accVat.integ.statusTitle', { status })}
    >
      {t(entry.labelKey)}
    </span>
  )
}

export function StatCell({
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
        background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
        border: '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)',
        borderRadius: 'var(--r-md)',
      }}
    >
      <div
        style={{
          fontSize: '0.68rem',
          textTransform: 'none',
          letterSpacing: 'normal',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 2,
          color: 'var(--text-primary)',
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          fontSize: mono ? '0.82rem' : '0.88rem',
        }}
      >
        {value}
      </div>
    </div>
  )
}

export function formatRelative(iso: string): string {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  if (Number.isNaN(diffMs)) return iso
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return translate('accVat.integ.relNow')
  const min = Math.floor(sec / 60)
  if (min < 60) return translate('accVat.integ.relMin', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return translate('accVat.integ.relHour', { n: hr })
  const day = Math.floor(hr / 24)
  if (day < 30) return translate('accVat.integ.relDay', { n: day })
  return formatDate(date)
}

// ---- Modal de création ----
