import React, { useEffect, useState, useCallback } from 'react'
import { fetchSystemHealth, type SystemHealth as SystemHealthData } from '../../services/activityCenter'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

function StatusBadge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
        color: ok ? '#22c55e' : '#ef4444',
        border: `1px solid ${ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
      }}
    >
      {ok ? '✓' : '✗'} {label ?? (ok ? 'OK' : 'KO')}
    </span>
  )
}

function HealthCard({
  title,
  children,
  accent,
}: {
  title: string
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1.5px solid var(--border-color)',
        borderLeft: `3px solid ${accent ?? '#6366f1'}`,
        borderRadius: 14,
        padding: '20px 24px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      {children}
    </div>
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
      const result = await fetchSystemHealth()
      setData(result)
    } catch {
      setError('Impossible de charger les données de santé système.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function formatDate(iso: string) {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso))
  }

  return (
    <div className="portal-container">
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 32,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Sante systeme
            </h1>
            {data && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Derniere verification : {formatDate(data.checkedAt)}
              </p>
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            style={{
              padding: '8px 18px',
              borderRadius: 8,
              border: '1.5px solid var(--accent)',
              background: 'transparent',
              color: 'var(--accent)',
              fontSize: 13,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Chargement...' : 'Rafraichir'}
          </button>
        </div>

        {error && (
          <div
            style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              padding: '14px 18px',
              color: '#ef4444',
              fontSize: 13,
              marginBottom: 24,
            }}
          >
            {error}
          </div>
        )}

        {loading && !data && (
          <div style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', padding: 40 }}>
            Chargement...
          </div>
        )}

        {data && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 20,
            }}
          >
            {/* MongoDB */}
            <HealthCard title="Base de donnees" accent={data.mongo.ok ? '#22c55e' : '#ef4444'}>
              <Row label="Etat">
                <StatusBadge ok={data.mongo.ok} label={data.mongo.label} />
              </Row>
              <Row label="Code">
                <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {data.mongo.state}
                </span>
              </Row>
            </HealthCard>

            {/* Email */}
            <HealthCard title="Email (SMTP)" accent={data.email.configured ? '#22c55e' : '#f59e0b'}>
              <Row label="Configuration">
                <StatusBadge
                  ok={data.email.configured}
                  label={data.email.configured ? 'Configure' : 'Manquant'}
                />
              </Row>
            </HealthCard>

            {/* Push */}
            <HealthCard title="Notifications push (VAPID)" accent={data.push.configured ? '#22c55e' : '#f59e0b'}>
              <Row label="Configuration">
                <StatusBadge
                  ok={data.push.configured}
                  label={data.push.configured ? 'Configure' : 'Manquant'}
                />
              </Row>
            </HealthCard>

            {/* Uploads */}
            <HealthCard
              title="Stockage (uploads/)"
              accent={data.uploads.accessible && data.uploads.writable ? '#22c55e' : '#ef4444'}
            >
              <Row label="Accessible">
                <StatusBadge ok={data.uploads.accessible} />
              </Row>
              <Row label="Ecriture">
                <StatusBadge ok={data.uploads.writable} />
              </Row>
              <Row label="Chemin">
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                    maxWidth: 180,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                  }}
                  title={data.uploads.path}
                >
                  {data.uploads.path}
                </span>
              </Row>
            </HealthCard>

            {/* Schedulers */}
            <HealthCard title="Schedulers" accent="#6366f1">
              <Row label="CRM (relances)">
                <StatusBadge ok={data.schedulers.crmLegacy} label="Actif" />
              </Row>
              <Row label="Moteur automation">
                <StatusBadge ok={data.schedulers.automationEngine} label="Actif" />
              </Row>
              <Row label="Auto-lock comptabilite">
                <StatusBadge ok={data.schedulers.accountingAutoLock} label="Actif" />
              </Row>
            </HealthCard>
          </div>
        )}
      </div>
    </div>
  )
}
