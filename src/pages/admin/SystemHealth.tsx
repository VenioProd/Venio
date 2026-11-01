import PageHeader from '../../components/admin/ui/PageHeader'
import './OrganisationSysteme.css'
import { useCallback, useEffect, useState } from 'react'
import {
  fetchSystemHealth,
  type HealthStatus,
  type SystemHealth as SystemHealthData,
} from '../../services/activityCenter'
import { useI18n } from '../../context/I18nContext'
import type { MessageKey } from '../../i18n'
import { formatDate } from '../../i18n/format'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const STATUS_LABEL_KEYS: Record<HealthStatus, MessageKey> = {
  ok: 'adminOps.health.statusOk',
  warning: 'adminOps.health.statusWarning',
  error: 'adminOps.health.statusError',
}
const STATUS_COLORS: Record<HealthStatus, string> = {
  ok: 'var(--good)',
  warning: 'var(--warning)',
  error: 'var(--critical)',
}

function StatusBadge({ status }: { status: HealthStatus }) {
  const { t } = useI18n()
  return (
    <span
      className="health-status"
      style={{
        color: STATUS_COLORS[status],
        background: `color-mix(in srgb, ${STATUS_COLORS[status]} 10%, transparent)`,
        border: `1px solid color-mix(in srgb, ${STATUS_COLORS[status]} 30%, transparent)`,
      }}
    >
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  )
}

function HealthCard({ title, status, children }: { title: string; status: HealthStatus; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--surface-glass)',
        border: '1px solid var(--border-color)',
        borderLeft: `3px solid ${STATUS_COLORS[status]}`,
        borderRadius: 'var(--r-lg)',
        padding: 20,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 15, color: 'var(--text-primary)' }}>{title}</h2>
        <StatusBadge status={status} />
      </div>
      <div style={{ display: 'grid', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>{children}</div>
    </section>
  )
}

export default function SystemHealth() {
  const { t } = useI18n()
  const formatRun = (value: string | null): string =>
    value ? formatDate(value, { dateStyle: 'short', timeStyle: 'medium' }) : t('adminOps.health.noRun')
  const [data, setData] = useState<SystemHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchSystemHealth())
    } catch {
      setError(t('adminOps.health.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="portal-container lot-c-page system-health-page">
      <div className="system-health-content">
        <PageHeader
          eyebrow={t('adminOps.zone.system')}
          title={t('adminOps.health.title')}
          actions={
            <>
              {data && (
                <span className="lot-c-count">
                  {t('adminOps.health.checkedAt', { date: formatRun(data.checkedAt) })}
                </span>
              )}
              <button className="portal-button secondary" onClick={() => void load()} disabled={loading}>
                {loading ? t('adminOps.common.loading') : t('adminOps.common.refresh')}
              </button>
            </>
          }
        />
        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}
        {loading && !data && <p style={{ color: 'var(--text-muted)' }}>{t('adminOps.common.loading')}</p>}
        {data && (
          <>
            <div style={{ marginBottom: 18 }}>
              <StatusBadge status={data.status} />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
                gap: 16,
              }}
            >
              <HealthCard title={t('adminOps.health.database')} status={data.database.status}>
                <span>
                  {data.database.latencyMs === null
                    ? t('adminOps.health.pingUnavailable')
                    : t('adminOps.health.ping', { ms: data.database.latencyMs })}
                </span>
              </HealthCard>
              <HealthCard title={t('adminOps.health.email')} status={data.email.status}>
                <span>{t('adminOps.health.smtp')}</span>
              </HealthCard>
              <HealthCard title={t('adminOps.health.push')} status={data.push.status}>
                <span>{t('adminOps.health.vapid')}</span>
              </HealthCard>
              <HealthCard title={t('adminOps.health.automation')} status={data.automation.status}>
                <span>
                  {data.automation.schedulerRunning
                    ? t('adminOps.health.schedulerOn')
                    : t('adminOps.health.schedulerOff')}
                </span>
                <span>{t('adminOps.health.jobs', { count: data.automation.registeredJobs })}</span>
                <span>{t('adminOps.health.lastCycle', { date: formatRun(data.automation.lastTickAt) })}</span>
              </HealthCard>
              <HealthCard
                title={t('adminOps.health.schedulers')}
                status={data.schedulers.crm.running && data.schedulers.accounting.running ? 'ok' : 'error'}
              >
                <span>
                  {t('adminOps.health.crmLine', {
                    state: data.schedulers.crm.running ? t('adminOps.health.running') : t('adminOps.health.stopped'),
                    date: formatRun(data.schedulers.crm.lastRunAt),
                  })}
                </span>
                <span>
                  {t('adminOps.health.accountingLine', {
                    state: data.schedulers.accounting.running
                      ? t('adminOps.health.running')
                      : t('adminOps.health.stopped'),
                    date: formatRun(data.schedulers.accounting.lastRunAt),
                  })}
                </span>
              </HealthCard>
              <HealthCard title={t('adminOps.health.uploads')} status={data.uploads.status}>
                {data.uploads.directories.map((directory) => (
                  <span key={directory.name}>
                    {directory.name}
                    {t('adminOps.health.colon')}
                    <StatusBadge status={directory.status} />
                  </span>
                ))}
              </HealthCard>
            </div>
            <section
              style={{
                marginTop: 20,
                background: 'var(--surface-glass)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--r-lg)',
                padding: 20,
              }}
            >
              <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>{t('adminOps.health.recentErrors')}</h2>
              {data.recentErrors.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>{t('adminOps.health.noErrors')}</p>
              ) : (
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    display: 'grid',
                    gap: 8,
                    color: 'var(--text-secondary)',
                    fontSize: 13,
                  }}
                >
                  {data.recentErrors.map((entry, index) => (
                    <li key={`${entry.source}-${entry.occurredAt}-${index}`}>
                      <strong>{entry.source}</strong> — {formatRun(entry.occurredAt)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
