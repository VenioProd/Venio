import { useCallback, useEffect, useState } from 'react'
import {
  fetchSystemHealth,
  type HealthStatus,
  type SystemHealth as SystemHealthData,
} from '../../services/activityCenter'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

const STATUS_LABELS: Record<HealthStatus, string> = {
  ok: 'Opérationnel',
  warning: 'À surveiller',
  error: 'Indisponible',
}
const STATUS_COLORS: Record<HealthStatus, string> = { ok: '#22c55e', warning: '#f59e0b', error: '#ef4444' }

function formatDate(value: string | null): string {
  if (!value) return 'Aucune exécution enregistrée'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value))
}

function StatusBadge({ status }: { status: HealthStatus }) {
  return <span style={{ color: STATUS_COLORS[status], fontSize: 12, fontWeight: 700 }}>{STATUS_LABELS[status]}</span>
}

function HealthCard({ title, status, children }: { title: string; status: HealthStatus; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderLeft: `3px solid ${STATUS_COLORS[status]}`,
        borderRadius: 12,
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
  const [data, setData] = useState<SystemHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetchSystemHealth())
    } catch {
      setError('Impossible de charger les données de santé système.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="portal-container">
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '32px 24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 28,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Santé système</h1>
            {data && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '5px 0 0' }}>
                Vérifié le {formatDate(data.checkedAt)}
              </p>
            )}
          </div>
          <button className="portal-button secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Chargement…' : 'Rafraîchir'}
          </button>
        </div>
        {error && (
          <div className="admin-error" role="alert">
            {error}
          </div>
        )}
        {loading && !data && <p style={{ color: 'var(--text-muted)' }}>Chargement…</p>}
        {data && (
          <>
            <div style={{ marginBottom: 18 }}>
              <StatusBadge status={data.status} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
              <HealthCard title="Base de données" status={data.database.status}>
                <span>
                  {data.database.latencyMs === null ? 'Ping indisponible' : `Ping : ${data.database.latencyMs} ms`}
                </span>
              </HealthCard>
              <HealthCard title="Email" status={data.email.status}>
                <span>Configuration SMTP</span>
              </HealthCard>
              <HealthCard title="Notifications push" status={data.push.status}>
                <span>Configuration VAPID</span>
              </HealthCard>
              <HealthCard title="Moteur d’automatisation" status={data.automation.status}>
                <span>{data.automation.schedulerRunning ? 'Planificateur actif' : 'Planificateur arrêté'}</span>
                <span>{data.automation.registeredJobs} automatisation(s) enregistrée(s)</span>
                <span>Dernier cycle : {formatDate(data.automation.lastTickAt)}</span>
              </HealthCard>
              <HealthCard
                title="Planificateurs annexes"
                status={data.schedulers.crm.running && data.schedulers.accounting.running ? 'ok' : 'error'}
              >
                <span>
                  CRM : {data.schedulers.crm.running ? 'actif' : 'arrêté'} — {formatDate(data.schedulers.crm.lastRunAt)}
                </span>
                <span>
                  Comptabilité : {data.schedulers.accounting.running ? 'actif' : 'arrêté'} —{' '}
                  {formatDate(data.schedulers.accounting.lastRunAt)}
                </span>
              </HealthCard>
              <HealthCard title="Répertoires d’upload" status={data.uploads.status}>
                {data.uploads.directories.map((directory) => (
                  <span key={directory.name}>
                    {directory.name} : <StatusBadge status={directory.status} />
                  </span>
                ))}
              </HealthCard>
            </div>
            <section
              style={{
                marginTop: 20,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: 12,
                padding: 20,
              }}
            >
              <h2 style={{ margin: '0 0 12px', fontSize: 15 }}>Dernières erreurs</h2>
              {data.recentErrors.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucune erreur récente enregistrée.
                </p>
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
                      <strong>{entry.source}</strong> — {formatDate(entry.occurredAt)}
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
