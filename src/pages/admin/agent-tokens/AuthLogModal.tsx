import type { AgentToken, AgentAuthLogEvent } from './types'
import { formatDate } from './types'

interface Props {
  token: AgentToken
  events: AgentAuthLogEvent[]
  loading: boolean
  onClose: () => void
}

export default function AuthLogModal({ token, events, loading, onClose }: Props) {
  return (
    <div className="confirm-modal-overlay" onClick={onClose}>
      <div
        className="confirm-modal"
        style={{ maxWidth: 760, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="confirm-modal__header">
          <h2 className="confirm-modal__title">Journal token : {token.name}</h2>
          <button
            type="button"
            className="confirm-modal__close"
            onClick={onClose}
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>
        <div className="confirm-modal__body">
          <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
            Connexions réussies/refusées liées au préfixe {token.prefix}…
          </p>
          {loading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Chargement…</p>
          ) : events.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              Aucun événement de connexion enregistré pour ce token.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
              {events.map((event) => {
                const success = event.action === 'AGENT_AUTH_SUCCESS'
                return (
                  <div
                    key={event._id}
                    style={{
                      border: `1px solid ${success ? 'rgba(16,185,129,0.28)' : 'rgba(248,113,113,0.32)'}`,
                      borderRadius: 8,
                      padding: 12,
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                        marginBottom: 6,
                      }}
                    >
                      <strong style={{ color: success ? '#6ee7b7' : '#f87171' }}>
                        {success ? 'Connexion réussie' : 'Connexion refusée'}
                      </strong>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {formatDate(event.createdAt)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gap: 4,
                        color: 'var(--text-secondary)',
                        fontSize: '0.85rem',
                        lineHeight: 1.45,
                      }}
                    >
                      <span>
                        <strong>Route :</strong> {event.metadata?.method || '—'}{' '}
                        {event.metadata?.path || '—'}
                      </span>
                      <span>
                        <strong>IP :</strong> {event.ip || '—'}
                      </span>
                      {event.metadata?.reason && (
                        <span>
                          <strong>Raison :</strong> {event.metadata.reason}
                        </span>
                      )}
                      <span style={{ wordBreak: 'break-word' }}>
                        <strong>User-agent :</strong> {event.userAgent || '—'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        <div className="confirm-modal__footer">
          <button
            type="button"
            className="confirm-modal__btn confirm-modal__btn--confirm confirm-modal__btn--info"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
