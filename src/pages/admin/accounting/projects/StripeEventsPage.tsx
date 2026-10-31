import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../../context/AuthContext'
import { useI18n } from '../../../../context/I18nContext'
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions'
import { apiFetch } from '../../../../lib/api'
import AccountingLayout from '../AccountingLayout'
import { ACCOUNTING, ActionForm, dateLabel, errorText, Table } from './shared'

interface StripeEvent {
  _id: string
  type: string
  status: string
  reason: string
  createdAt: string
  invoice: { _id: string; number: string } | null
}
export default function StripeEventsPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)
  const [events, setEvents] = useState<StripeEvent[] | null>(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('NEEDS_REVIEW')
  const load = useCallback(
    () =>
      apiFetch<{ events: StripeEvent[] }>(`${ACCOUNTING}/stripe/events?status=${status}`).then((data) => {
        setEvents(data.events)
        setError('')
      }),
    [status],
  )
  useEffect(() => {
    void load().catch((error) => setError(errorText(error)))
  }, [load])
  return (
    <AccountingLayout title="Stripe" subtitle={t('accProjects.stripe.subtitle')}>
      <section className="accounting-card">
        <label>
          {t('accProjects.stripe.show')}{' '}
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="NEEDS_REVIEW">{t('accProjects.stripe.needsReview')}</option>
            <option value="PROCESSED">{t('accProjects.stripe.processed')}</option>
            <option value="IGNORED">{t('accProjects.stripe.ignored')}</option>
          </select>
        </label>
        <button
          className="portal-button secondary"
          onClick={() => void load().catch((error) => setError(errorText(error)))}
        >
          {t('accProjects.common.refresh')}
        </button>
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        {!events && !error && <p role="status">{t('accProjects.stripe.loading')}</p>}
        {events?.length === 0 && <p>{t('accProjects.stripe.empty')}</p>}
        {!!events?.length && (
          <Table
            headers={[
              t('accProjects.cols.date'),
              t('accProjects.cols.event'),
              t('accProjects.cols.invoice'),
              t('accProjects.cols.reason'),
              t('accProjects.cols.action'),
            ]}
          >
            {events.map((event) => (
              <tr key={event._id}>
                <td>{dateLabel(event.createdAt)}</td>
                <td>{event.type}</td>
                <td>{event.invoice?.number || '—'}</td>
                <td>{event.reason || '—'}</td>
                <td>
                  {canManage && event.status === 'NEEDS_REVIEW' && (
                    <ActionForm
                      label={t('accProjects.stripe.retry')}
                      submit={() => apiFetch(`${ACCOUNTING}/stripe/events/${event._id}/retry`, { method: 'POST' })}
                      onSaved={load}
                    />
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </AccountingLayout>
  )
}
