import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '../../lib/api'
import CustomSelect from '../../components/admin/CustomSelect'
import '../espace-client/ClientPortal.css'
import './AdminPortal.css'

interface AuditEntry {
  _id: string
  userId?: { _id: string; name: string; email: string; role: string } | null
  email: string
  action: string
  ip: string
  userAgent: string
  metadata?: Record<string, unknown>
  createdAt: string
}

const actionLabels: Record<string, string> = {
  LOGIN_SUCCESS: 'Connexion réussie',
  LOGIN_FAILED: 'Échec de connexion',
  LOGOUT: 'Déconnexion',
  PASSWORD_CHANGED: 'Mot de passe modifié',
  PROFILE_UPDATED: 'Profil mis à jour',
}

const actionColors: Record<string, string> = {
  LOGIN_SUCCESS: '#10b981',
  LOGIN_FAILED: '#ef4444',
  LOGOUT: '#6b7280',
  PASSWORD_CHANGED: '#f59e0b',
  PROFILE_UPDATED: '#3b82f6',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function shortenUA(ua: string): string {
  if (!ua) return '—'
  if (ua.includes('Chrome')) return 'Chrome'
  if (ua.includes('Firefox')) return 'Firefox'
  if (ua.includes('Safari')) return 'Safari'
  if (ua.includes('Edge')) return 'Edge'
  return ua.substring(0, 30)
}

const AuditLog = () => {
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState('')
  const [filterEmail, setFilterEmail] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (filterAction) params.set('action', filterAction)
      if (filterEmail) params.set('email', filterEmail)
      const data = await apiFetch<{ logs: AuditEntry[]; total: number; page: number; pages: number }>(`/api/admin/audit?${params}`)
      setLogs(data.logs || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [page, filterAction, filterEmail])

  useEffect(() => {
    load()
  }, [load])

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    load()
  }

  return (
    <section className="admin-portal" style={{ paddingTop: '120px', minHeight: '100vh' }}>
      <div className="admin-container">
        <div className="admin-header">
          <h1>Audit des connexions</h1>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{total} entrée{total > 1 ? 's' : ''}</span>
        </div>

        <form onSubmit={handleFilterSubmit} style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <CustomSelect
            value={filterAction}
            onChange={(v) => { setFilterAction(v); setPage(1) }}
            options={[
              { value: '', label: 'Toutes les actions' },
              { value: 'LOGIN_SUCCESS', label: 'Connexions réussies' },
              { value: 'LOGIN_FAILED', label: 'Échecs de connexion' },
              { value: 'PASSWORD_CHANGED', label: 'Changements de mot de passe' },
            ]}
          />
          <input
            type="text"
            placeholder="Filtrer par email..."
            value={filterEmail}
            onChange={(e) => setFilterEmail(e.target.value)}
            className="portal-input" style={{ padding: '8px 12px', minWidth: '200px' }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '8px 16px' }}>Filtrer</button>
        </form>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Chargement...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Aucune entrée</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #333)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Date</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Action</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Utilisateur</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Email</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>IP</th>
                  <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: 500 }}>Navigateur</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id} style={{ borderBottom: '1px solid var(--border-color, #222)' }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>{formatDate(log.createdAt)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        background: `${actionColors[log.action] || '#666'}22`,
                        color: actionColors[log.action] || '#888',
                        border: `1px solid ${actionColors[log.action] || '#666'}44`,
                      }}>
                        {actionLabels[log.action] || log.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-primary)' }}>{log.userId?.name || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{log.email}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.ip || '—'}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{shortenUA(log.userAgent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="btn-secondary"
              style={{ padding: '6px 14px', opacity: page <= 1 ? 0.4 : 1 }}
            >
              Précédent
            </button>
            <span style={{ padding: '6px 14px', color: 'var(--text-muted)' }}>
              {page} / {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="btn-secondary"
              style={{ padding: '6px 14px', opacity: page >= pages ? 0.4 : 1 }}
            >
              Suivant
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

export default AuditLog
