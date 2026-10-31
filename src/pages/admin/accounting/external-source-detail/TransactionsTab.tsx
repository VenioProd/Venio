import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { IExternalTransaction } from '../../../../types/accounting'
import type { TxFilters } from './types'
import { formatDateTime, TRANSACTION_STATUSES, txStatusClass } from './helpers'
import { replayExternalTransaction } from '../../../../services/accounting'
import { useI18n } from '../../../../context/I18nContext'

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
  const { t } = useI18n()
  const [txDetail, setTxDetail] = useState<IExternalTransaction | null>(null)

  const txTotalPages = Math.max(1, Math.ceil(txTotal / filters.limit))

  async function handleReplay(tx: IExternalTransaction) {
    if (!confirm(t('accVat.tx.confirmReplay', { id: tx.externalId ?? '—' }))) return
    try {
      await replayExternalTransaction(tx._id)
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : t('accVat.common.error'))
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
              {t(o.labelKey)}
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
          {t('accVat.tx.filter')}
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('accVat.common.loading')}</p>
      ) : transactions.length === 0 ? (
        <div className="accounting-empty">{t('accVat.tx.empty')}</div>
      ) : (
        <>
          <table className="accounting-table">
            <thead>
              <tr>
                <th>{t('accVat.tx.colReceivedAt')}</th>
                <th>External ID</th>
                <th>{t('accVat.src.colStatus')}</th>
                <th>{t('accVat.tx.colAutoValidated')}</th>
                <th>{t('accVat.tx.colEntry')}</th>
                <th>{t('accVat.src.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx._id}>
                  <td style={{ fontSize: '0.82rem' }}>{formatDateTime(tx.receivedAt)}</td>
                  <td className="code">{tx.externalId || '—'}</td>
                  <td>
                    <span className={`accounting-badge ${txStatusClass(tx.status)}`}>{tx.status}</span>
                    {tx.errorReason && (
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: '#fca5a5',
                          marginTop: 2,
                        }}
                      >
                        {tx.errorReason}
                      </div>
                    )}
                  </td>
                  <td>
                    {tx.autoValidated ? (
                      <span className="accounting-badge validated">{t('accVat.tx.yes')}</span>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>
                    )}
                  </td>
                  <td>
                    {tx.generatedEntry ? (
                      <Link
                        to={`/admin/comptabilite/ecritures/${
                          typeof tx.generatedEntry === 'object' ? tx.generatedEntry._id : tx.generatedEntry
                        }`}
                        className="code"
                      >
                        {t('accVat.tx.view')}
                      </Link>
                    ) : (
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <div className="accounting-row-actions">
                      <button type="button" onClick={() => setTxDetail(tx)}>
                        {t('accVat.tx.detail')}
                      </button>
                      {(tx.status === 'REJECTED' || tx.status === 'AWAITING_REVIEW') && (
                        <button type="button" onClick={() => handleReplay(tx)}>
                          {t('accVat.tx.replay')}
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
                {t('accVat.tx.previous')}
              </button>
              <span
                style={{
                  alignSelf: 'center',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                {t('accVat.tx.pageInfo', { page: filters.page, pages: txTotalPages, total: txTotal })}
              </span>
              <button
                className="portal-button secondary"
                disabled={filters.page >= txTotalPages}
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              >
                {t('accVat.tx.next')}
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
                  {t('accVat.tx.transaction')} <span className="code">{txDetail.externalId}</span>
                </h2>
                <div
                  style={{
                    fontSize: '0.82rem',
                    color: 'rgba(255,255,255,0.55)',
                    marginTop: 4,
                  }}
                >
                  {t('accVat.tx.receivedOn', { date: formatDateTime(txDetail.receivedAt) })}{' '}
                  <span className={`accounting-badge ${txStatusClass(txDetail.status)}`}>{txDetail.status}</span>
                  {txDetail.signatureVerified === false && (
                    <span className="accounting-badge draft" style={{ marginLeft: 8 }}>
                      ⚠ {t('accVat.tx.signatureUnverified')}
                    </span>
                  )}
                </div>
              </div>
              <button type="button" className="portal-button secondary" onClick={() => setTxDetail(null)}>
                {t('common.close')}
              </button>
            </div>

            {txDetail.errorReason && (
              <div className="accounting-message error" style={{ marginTop: 14 }}>
                {txDetail.errorReason}
              </div>
            )}

            {txDetail.matchedRule && (
              <div className="accounting-message info" style={{ marginTop: 14 }}>
                {t('accVat.tx.matchedRule')}{' '}
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
                {t('accVat.tx.rawPayload')}
              </h3>
              <pre
                style={{
                  background: 'rgba(15,15,20,0.85)',
                  border: '1px solid rgba(14, 165, 233, 0.2)',
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
                {t('accVat.tx.normalizedPayload')}
              </h3>
              <pre
                style={{
                  background: 'rgba(15,15,20,0.85)',
                  border: '1px solid rgba(14, 165, 233, 0.2)',
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
                  {t('accVat.tx.entry')}
                </h3>
                <Link
                  to={`/admin/comptabilite/ecritures/${
                    typeof txDetail.generatedEntry === 'object' ? txDetail.generatedEntry._id : txDetail.generatedEntry
                  }`}
                  className="portal-button secondary"
                >
                  {t('accVat.tx.viewEntry')}
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
              {t('accVat.tx.footer', { ip: txDetail.requestIp || '—', ua: txDetail.requestUserAgent || '—' })}{' '}
              <span className="code">{txDetail.idempotencyKey || '—'}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
