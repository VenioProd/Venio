import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { fetchActivitySummary, type ActivitySummary } from '../../services/activityCenter'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

interface KpiCardProps {
  label: string
  value: number | null
  accent: string
  to: string
  description: string
  loading?: boolean
}

function KpiCard({ label, value, accent, to, description, loading }: KpiCardProps) {
  return (
    <Link
      to={to}
      style={{ textDecoration: 'none', color: 'inherit' }}
    >
      <div
        className="admin-stat-card"
        style={{
          borderLeft: `3px solid ${accent}`,
          cursor: 'pointer',
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
      >
        <div
          className="admin-stat-label"
          style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}
        >
          {label}
        </div>
        <div
          className="admin-stat-value"
          style={{ fontSize: 36, fontWeight: 800, color: accent, lineHeight: 1 }}
        >
          {loading ? (
            <span style={{ fontSize: 20, color: 'var(--text-muted)' }}>...</span>
          ) : value === null ? (
            <span style={{ fontSize: 20, color: 'var(--text-muted)' }}>-</span>
          ) : (
            value
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>{description}</div>
      </div>
    </Link>
  )
}

export default function ActivityCenter() {
  const [data, setData] = useState<ActivitySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchActivitySummary()
      setData(result)
    } catch {
      setError('Impossible de charger le centre d\'activite.')
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
              Centre d'activite
            </h1>
            {data && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                Mis a jour : {formatDate(data.checkedAt)}
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

        <div className="admin-stats-grid">
          <KpiCard
            label="Tickets ouverts"
            value={data?.openTickets ?? null}
            accent="#ef4444"
            to="/admin/tickets"
            description="Statut OUVERT ou EN_COURS"
            loading={loading && !data}
          />
          <KpiCard
            label="Messages non lus"
            value={data?.unreadMessages ?? null}
            accent="#8b5cf6"
            to="/admin/messages"
            description="Messages recus non lus"
            loading={loading && !data}
          />
          <KpiCard
            label="Leads en retard"
            value={data?.overdueLeads ?? null}
            accent="#f59e0b"
            to="/admin/crm"
            description="Prochaine action depassee"
            loading={loading && !data}
          />
          <KpiCard
            label="Factures impayees"
            value={data?.overdueBilling ?? null}
            accent="#ff0080"
            to="/admin/comptabilite"
            description="Echeance depassee"
            loading={loading && !data}
          />
        </div>
      </div>
    </div>
  )
}
