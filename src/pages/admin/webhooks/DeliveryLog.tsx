import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '../../../context/ToastContext'
import { useI18n } from '../../../context/I18nContext'
import { translate } from '../../../i18n'
import { getDelivery, listDeliveries, replayDelivery } from '../../../services/webhooks'
import { eventTypeLabel, formatDateTime, statusLabel, type WebhookDelivery, type WebhookEndpoint } from './types'

interface Props {
  endpoints: WebhookEndpoint[]
  selected: WebhookEndpoint | null
  onSelect: (endpoint: WebhookEndpoint | null) => void
}

/**
 * Journal des livraisons d'un endpoint : filtres statut/type, pagination,
 * panneau de détail (payload figé + historique des tentatives) et rejeu.
 */
export default function DeliveryLog({ selected, onSelect }: Props) {
  const { showToast } = useToast()
  const { t } = useI18n()
  // Voir Webhooks.tsx : la fonction du contexte n'est pas garantie stable, on
  // la lit via une ref pour que `load` ne se recrée pas à chaque rendu.
  const toastRef = useRef(showToast)
  useEffect(() => {
    toastRef.current = showToast
  }, [showToast])

  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('')
  const [eventType, setEventType] = useState('')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<WebhookDelivery | null>(null)
  const [replayingId, setReplayingId] = useState<string | null>(null)

  const endpointId = selected?._id ?? null

  const load = useCallback(async () => {
    if (!endpointId) return
    setLoading(true)
    try {
      const data = await listDeliveries(endpointId, {
        page,
        ...(status ? { status } : {}),
        ...(eventType ? { eventType } : {}),
      })
      setDeliveries(data.deliveries || [])
      setPages(data.pages || 1)
      setTotal(data.total || 0)
    } catch (err) {
      toastRef.current((err as Error).message || translate('adminTech.webhooks.logLoadError'), 'error')
    } finally {
      setLoading(false)
    }
  }, [endpointId, page, status, eventType])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = async (delivery: WebhookDelivery) => {
    try {
      const data = await getDelivery(delivery._id)
      setDetail(data.delivery)
    } catch (err) {
      toastRef.current((err as Error).message || t('adminTech.webhooks.detailError'), 'error')
    }
  }

  const replay = async (delivery: WebhookDelivery) => {
    setReplayingId(delivery._id)
    try {
      const { outcome } = await replayDelivery(delivery._id)
      toastRef.current(
        outcome?.ok
          ? t('adminTech.webhooks.replayOk', { status: outcome.httpStatus ?? '' })
          : t('adminTech.webhooks.replayFailed'),
        outcome?.ok ? 'success' : 'error',
      )
      await load()
    } catch (err) {
      toastRef.current((err as Error).message || t('adminTech.webhooks.replayError'), 'error')
    } finally {
      setReplayingId(null)
    }
  }

  const availableTypes = Array.from(new Set(deliveries.map((delivery) => delivery.eventType))).sort()

  if (!selected) {
    return (
      <div style={{ marginTop: 32 }}>
        <h2>{t('adminTech.webhooks.deliveriesTitle')}</h2>
        <p style={{ color: 'var(--text-muted)' }}>{t('adminTech.webhooks.deliveriesHint')}</p>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div className="admin-header">
        <h2>{t('adminTech.webhooks.deliveriesFor', { name: selected.name })}</h2>
        <button type="button" className="admin-card-btn" onClick={() => onSelect(null)}>
          {t('adminTech.webhooks.closeLog')}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <label>
          <span style={{ marginRight: 6 }}>{t('adminTech.webhooks.filterStatus')}</span>
          <select
            className="portal-input"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <option value="">{t('adminTech.webhooks.filterAll')}</option>
            <option value="PENDING">{statusLabel('PENDING')}</option>
            <option value="DELIVERED">{statusLabel('DELIVERED')}</option>
            <option value="FAILED">{statusLabel('FAILED')}</option>
          </select>
        </label>
        <label>
          <span style={{ marginRight: 6 }}>{t('adminTech.webhooks.filterType')}</span>
          <select
            className="portal-input"
            value={eventType}
            onChange={(e) => {
              setEventType(e.target.value)
              setPage(1)
            }}
          >
            <option value="">{t('adminTech.webhooks.filterAll')}</option>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {eventTypeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <span style={{ alignSelf: 'center', color: 'var(--text-muted)' }}>
          {t('adminTech.webhooks.deliveryCount', { count: total })}
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
          {t('adminTech.webhooks.loading')}
        </div>
      ) : deliveries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
          {t('adminTech.webhooks.noDeliveries')}
        </div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>{t('adminTech.webhooks.colDate')}</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>{t('adminTech.webhooks.colEvent')}</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>{t('adminTech.webhooks.filterStatus')}</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>{t('adminTech.webhooks.attempts')}</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>{t('adminTech.webhooks.colDuration')}</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>{t('adminTech.webhooks.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => {
                const last = delivery.attempts[delivery.attempts.length - 1]
                return (
                  <tr key={delivery._id}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{formatDateTime(delivery.createdAt)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div>{eventTypeLabel(delivery.eventType)}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {delivery.eventId}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className="admin-badge">{statusLabel(delivery.status)}</span>
                      {delivery.status === 'PENDING' && delivery.nextRetryAt && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {t('adminTech.webhooks.retryAt', { date: formatDateTime(delivery.nextRetryAt) })}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{delivery.attempts.length}</td>
                    <td style={{ padding: '10px 12px' }}>{last ? `${last.durationMs} ms` : '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="button" className="admin-card-btn" onClick={() => void openDetail(delivery)}>
                          {t('adminTech.webhooks.detail')}
                        </button>
                        <button
                          type="button"
                          className="admin-card-btn"
                          disabled={replayingId === delivery._id}
                          onClick={() => void replay(delivery)}
                        >
                          {t('adminTech.webhooks.replay')}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
          <button
            type="button"
            className="admin-card-btn"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            {t('common.previous')}
          </button>
          <span style={{ padding: '6px 14px', color: 'var(--text-muted)' }}>
            {page} / {pages}
          </span>
          <button
            type="button"
            className="admin-card-btn"
            disabled={page >= pages}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('common.next')}
          </button>
        </div>
      )}

      {detail && (
        <div className="confirm-modal-overlay" onClick={() => setDetail(null)}>
          <div
            className="confirm-modal"
            style={{ maxWidth: 760, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="confirm-modal__header">
              <h2 className="confirm-modal__title">
                {eventTypeLabel(detail.eventType)} · {statusLabel(detail.status)}
              </h2>
              <button
                type="button"
                className="confirm-modal__close"
                onClick={() => setDetail(null)}
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
            <div className="confirm-modal__body">
              <h3 style={{ marginTop: 0 }}>{t('adminTech.webhooks.payloadSent')}</h3>
              <pre
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: 12,
                  overflowX: 'auto',
                  fontSize: '0.8rem',
                }}
              >
                {JSON.stringify(detail.payload ?? {}, null, 2)}
              </pre>

              <h3>{t('adminTech.webhooks.attempts')}</h3>
              {detail.attempts.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>{t('adminTech.webhooks.noAttempts')}</p>
              ) : (
                <ul style={{ paddingLeft: 18 }}>
                  {detail.attempts.map((attempt, index) => (
                    <li key={`${attempt.at}-${index}`}>
                      {formatDateTime(attempt.at)} —{' '}
                      {attempt.httpStatus
                        ? `HTTP ${attempt.httpStatus}`
                        : attempt.error || t('adminTech.webhooks.networkError')}{' '}
                      ({attempt.durationMs} ms)
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="confirm-modal__footer">
              <button type="button" className="confirm-modal__btn" onClick={() => setDetail(null)}>
                {t('common.close')}
              </button>
              <button
                type="button"
                className="confirm-modal__btn confirm-modal__btn--confirm"
                onClick={() => void replay(detail)}
              >
                {t('adminTech.webhooks.replay')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
