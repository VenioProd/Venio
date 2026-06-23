import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { IExternalTransaction } from '../../../../types/accounting'
import type { TxFilters } from './types'
import { formatDateTime, TRANSACTION_STATUSES, txStatusClass } from './helpers'
import { replayExternalTransaction } from '../../../../services/accounting'

interface TransactionsTabProps {
  transactions: IExternalTransaction[]
  txTotal: number
  filters: TxFilters
  setFilters: (f: TxFilters) => void
  loading: boolean
  onReload: () => void
  onError: (msg: string) => void
}

export default function TransactionsTab({
  transactions,
  txTotal,
  filters,
  setFilters,
  loading,
  onReload,
  onError,
}: TransactionsTabProps) {
  const [txDetail, setTxDetail] = useState<IExternalTransaction | null>(null)

  const txTotalPages = Math.max(1, Math.ceil(txTotal / filters.limit))

  async function handleReplay(tx: IExternalTransaction) {
    if (!confirm(`Rejouer la transaction ${tx.externalId} ?`)) return
    try {
      await replayExternalTransaction(tx._id)
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erreur')
    }
  }

  return (
    <section className="accounting-card">
      <div className="accounting-toolbar">
        <select
          className="portal-input"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
        >
          {TRANSACTION_STATUSES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className="portal-input"
          placeholder="External ID…"
          value={filters.externalId}
          onChange={(e) => setFilters({ ...filters, externalId: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && onReload()}
        />
        <input
          type="date"
          className="portal-input"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
        />
        <input
          type="date"
          className="portal-input"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
        />
        <button className="portal-button secondary" onClick={() => onReload()}>
          Filtrer
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>Chargement…</p>
      ) : transactions.length === 0 ? (
        <div className="accounting-empty">Aucune transaction reçue pour ces filtres.</div>
      ) : (
        <>
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Reçue le</th>
                <th>External ID</th>
                <th>Statut</th>
                <th>Auto-validée</th>
                <th>Écriture liée</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t._id}>
                  <td style={{ fontSize: '0.82rem' }}>{formatDateTime(t.receivedAt)}</td>
                  <td className="code">{t.externalId || '—'}</td>
                  <td>
                    <span className={`accounting-badge ${txStatusClass(t.status)}`}>{t.status}</span>
                    {t.errorReason && (
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: '#fca5a5',
                          marginTop: 2,
                        }}
                      >
                        {t.errorReason}
                      </div>
                    )}
                  </td>
                  <td>
                    {t.autoValidated ? (
                      <span className="accounting-badge validated">Oui</span>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {t.generatedEntry ? (
                      <Link
                        to={`/admin/comptabilite/ecritures/${
                          typeof t.generatedEntry === 'object' ? t.generatedEntry._id : t.generatedEntry
                        }`}
                        className="code"
                      >
                        Voir →
                      </Link>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <div className="accounting-row-actions">
                      <button type="button" onClick={() => setTxDetail(t)}>
                        Détail
                      </button>
                      {(t.status === 'REJECTED' || t.status === 'AWAITING_REVIEW') && (
                        <button type="button" onClick={() => handleReplay(t)}>
                          Rejouer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {txTotalPages > 1 && (
            <div className="accounting-pagination">
              <button
                className="portal-button secondary"
                disabled={filters.page <= 1}
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              >
                ← Précédent
              </button>
              <span
                style={{
                  alignSelf: 'center',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                Page {filters.page} / {txTotalPages} ({txTotal} total)
              </span>
              <button
                className="portal-button secondary"
                disabled={filters.page >= txTotalPages}
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              >
                Suivant →
              </button>
            </div>
          )}
        </>
      )}

      {txDetail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 16,
            backdropFilter: 'blur(6px)',
          }}
          onClick={() => setTxDetail(null)}
        >
          <div
            className="accounting-card"
            style={{
              maxWidth: 920,
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
                  Transaction <span className="code">{txDetail.externalId}</span>
                </h2>
                <div
                  style={{
                    fontSize: '0.82rem',
                    color: 'rgba(255,255,255,0.55)',
                    marginTop: 4,
                  }}
                >
                  Reçue le {formatDateTime(txDetail.receivedAt)} ·{' '}
                  <span className={`accounting-badge ${txStatusClass(txDetail.status)}`}>{txDetail.status}</span>
                  {txDetail.signatureVerified === false && (
                    <span className="accounting-badge draft" style={{ marginLeft: 8 }}>
                      ⚠ Signature non vérifiée
                    </span>
                  )}
                </div>
              </div>
              <button type="button" className="portal-button secondary" onClick={() => setTxDetail(null)}>
                Fermer
              </button>
            </div>

            {txDetail.errorReason && (
              <div className="accounting-message error" style={{ marginTop: 14 }}>
                {txDetail.errorReason}
              </div>
            )}

            {txDetail.matchedRule && (
              <div className="accounting-message info" style={{ marginTop: 14 }}>
                Règle matchée :{' '}
                <strong>
                  {typeof txDetail.matchedRule === 'object' ? txDetail.matchedRule.name : txDetail.matchedRule}
                </strong>
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <h3
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '0.85rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'var(--primary)',
                }}
              >
                Payload brut reçu
              </h3>
              <pre
                style={{
                  background: 'rgba(15,15,20,0.85)',
                  border: '1px solid rgba(204, 255, 0, 0.2)',
                  borderRadius: 10,
                  padding: 14,
                  fontSize: '0.78rem',
                  color: 'rgba(255,255,255,0.85)',
                  overflow: 'auto',
                  maxHeight: 280,
                  margin: 0,
                }}
              >
                {JSON.stringify(txDetail.rawPayload || {}, null, 2)}
              </pre>
            </div>

            <div style={{ marginTop: 18 }}>
              <h3
                style={{
                  margin: '0 0 8px 0',
                  fontSize: '0.85rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'var(--primary)',
                }}
              >
                Payload normalisé
              </h3>
              <pre
                style={{
                  background: 'rgba(15,15,20,0.85)',
                  border: '1px solid rgba(204, 255, 0, 0.2)',
                  borderRadius: 10,
                  padding: 14,
                  fontSize: '0.78rem',
                  color: 'rgba(255,255,255,0.85)',
                  overflow: 'auto',
                  maxHeight: 280,
                  margin: 0,
                }}
              >
                {JSON.stringify(txDetail.normalizedPayload || {}, null, 2)}
              </pre>
            </div>

            {txDetail.generatedEntry && (
              <div style={{ marginTop: 18 }}>
                <h3
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: 'rgba(74,222,128,0.85)',
                  }}
                >
                  Écriture comptable
                </h3>
                <Link
                  to={`/admin/comptabilite/ecritures/${
                    typeof txDetail.generatedEntry === 'object' ? txDetail.generatedEntry._id : txDetail.generatedEntry
                  }`}
                  className="portal-button secondary"
                >
                  Voir l'écriture →
                </Link>
              </div>
            )}

            <div
              style={{
                marginTop: 18,
                fontSize: '0.78rem',
                color: 'rgba(255,255,255,0.45)',
              }}
            >
              IP : {txDetail.requestIp || '—'} · UA : {txDetail.requestUserAgent || '—'} · Idempotency :{' '}
              <span className="code">{txDetail.idempotencyKey || '—'}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
