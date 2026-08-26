import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listChangeRequests } from '../../services/changeRequests'
import type { ClientChangeRequest } from '../../types/changeRequest.types'
import {
  CLIENT_STATUS_CONFIG,
  CLIENT_STATUS_GROUPS,
  PRIORITY_LABELS,
  formatChangeRequestDate,
} from './changeRequestStatus'
import './ClientPortal.css'

const ClientChangeRequests = () => {
  const [changeRequests, setChangeRequests] = useState<ClientChangeRequest[]>([])
  const [group, setGroup] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listChangeRequests()
      .then((data) => setChangeRequests(data.changeRequests || []))
      .catch((err: Error) => setError(err.message || 'Chargement impossible'))
      .finally(() => setLoading(false))
  }, [])

  const counts = useMemo(() => {
    const result: Record<string, number> = {}
    for (const entry of CLIENT_STATUS_GROUPS) {
      result[entry.key] = entry.statuses
        ? changeRequests.filter((request) => entry.statuses!.includes(request.status)).length
        : changeRequests.length
    }
    return result
  }, [changeRequests])

  const visible = useMemo(() => {
    const entry = CLIENT_STATUS_GROUPS.find((candidate) => candidate.key === group)
    if (!entry?.statuses) return changeRequests
    return changeRequests.filter((request) => entry.statuses!.includes(request.status))
  }, [changeRequests, group])

  return (
    <div className="portal-container">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16 }}
      >
        <div>
          <span
            style={{
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontSize: '0.7rem',
            }}
          >
            Espace client
          </span>
          <h1 style={{ margin: '6px 0 0' }}>Vos demandes</h1>
        </div>
        <Link to="/espace-client/demandes/nouvelle" className="portal-badge" style={{ padding: '10px 18px' }}>
          + Nouvelle demande
        </Link>
      </div>

      {error && <p role="alert">{error}</p>}
      {loading && <div className="portal-spinner" />}

      {!loading && changeRequests.length === 0 && (
        <div className="client-dashboard-empty" style={{ marginTop: 32 }}>
          <div className="client-dashboard-empty-icon">✳</div>
          <h3>Aucune demande pour le moment</h3>
          <p>Une retouche, une évolution ? Décrivez-la, nous la qualifions sous 48 h ouvrées.</p>
        </div>
      )}

      {!loading && changeRequests.length > 0 && (
        <>
          <nav aria-label="Filtrer par état" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '24px 0' }}>
            {CLIENT_STATUS_GROUPS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className="portal-badge"
                aria-pressed={group === entry.key}
                onClick={() => setGroup(entry.key)}
                style={{ padding: '8px 14px', opacity: group === entry.key ? 1 : 0.6 }}
              >
                {entry.label} · {counts[entry.key] ?? 0}
              </button>
            ))}
          </nav>

          <div className="portal-list">
            {visible.map((request) => {
              const status = CLIENT_STATUS_CONFIG[request.status]
              return (
                <Link
                  key={request._id}
                  to={`/espace-client/demandes/${request._id}`}
                  className="portal-card"
                  style={{ display: 'flex', gap: 16, alignItems: 'center', textDecoration: 'none' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{request.title}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {request.project ? request.project.name : 'Sans projet'} · soumise le{' '}
                      {formatChangeRequestDate(request.createdAt)}
                      {request.replyCount ? ` · ${request.replyCount} message(s)` : ''}
                    </div>
                  </div>
                  <span className="portal-badge">{PRIORITY_LABELS[request.priority]}</span>
                  <span className={`client-project-card-badge ${status.className}`}>{status.label}</span>
                </Link>
              )
            })}
          </div>
        </>
      )}

      <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 32, maxWidth: 720 }}>
        Une demande incluse dans votre maintenance est traitée sans frais. Les évolutions hors périmètre font l’objet
        d’un devis que vous signez en ligne avant tout démarrage.
      </p>
    </div>
  )
}

export default ClientChangeRequests
