import { useEffect, useState } from 'react'
import { useI18n } from '../../context/I18nContext'
import { formatNumber } from '../../i18n/format'
import {
  commercialApi,
  formatCents,
  formatDay,
  type CommissionTotals,
  type RepClient,
  type RepCommission,
} from '../../services/externalSales'

export const CommercialClients = () => {
  const { t } = useI18n()
  const [clients, setClients] = useState<RepClient[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    commercialApi
      .clients()
      .then((data) => setClients(data.clients))
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error) return <div className="admin-error">{error}</div>
  if (!clients) return <div className="admin-loading">{t('commercial.loading')}</div>
  if (clients.length === 0) {
    return (
      <div className="admin-empty-state">
        <p className="admin-empty-state-text">{t('commercial.clients.empty')}</p>
      </div>
    )
  }
  return (
    <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t('commercial.clients.colClient')}</th>
            <th>{t('commercial.clients.colContact')}</th>
            <th>{t('commercial.clients.colSigned')}</th>
            <th className="commercial-amount">{t('commercial.clients.colCollected')}</th>
            <th className="commercial-amount">{t('commercial.clients.colCommission')}</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => (
            <tr key={client._id}>
              <td>{client.companyName || client.lead.company || client.name}</td>
              <td>
                {client.name}
                <div className="commercial-muted">{client.email}</div>
              </td>
              <td>{formatDay(client.signedAt)}</td>
              <td className="commercial-amount">{formatCents(client.collectedHtCents)}</td>
              <td className="commercial-amount">{formatCents(client.commissionCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const CommercialCommissions = () => {
  const { t } = useI18n()
  const [data, setData] = useState<{ rateBp: number; totals: CommissionTotals; commissions: RepCommission[] } | null>(
    null,
  )
  const [error, setError] = useState('')

  useEffect(() => {
    commercialApi
      .commissions()
      .then(setData)
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error) return <div className="admin-error">{error}</div>
  if (!data) return <div className="admin-loading">{t('commercial.loading')}</div>
  return (
    <>
      <div className="commercial-stats">
        <div className="commercial-stat">
          <span className="commercial-muted">{t('commercial.commissions.collected')}</span>
          <span className="commercial-stat-value">{formatCents(data.totals.collectedHtCents)}</span>
        </div>
        <div className="commercial-stat">
          <span className="commercial-muted">{t('commercial.commissions.due')}</span>
          <span className="commercial-stat-value">{formatCents(data.totals.dueCents)}</span>
        </div>
        <div className="commercial-stat">
          <span className="commercial-muted">{t('commercial.commissions.paid')}</span>
          <span className="commercial-stat-value">{formatCents(data.totals.paidCents)}</span>
        </div>
      </div>
      <p className="commercial-muted">{t('commercial.commissions.rule', { rate: formatNumber(data.rateBp / 100) })}</p>
      {data.commissions.length === 0 ? (
        <div className="admin-empty-state">
          <p className="admin-empty-state-text">{t('commercial.commissions.empty')}</p>
        </div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('commercial.commissions.colDate')}</th>
                <th>{t('commercial.commissions.colInvoice')}</th>
                <th className="commercial-amount">{t('commercial.commissions.colCollected')}</th>
                <th className="commercial-amount">{t('commercial.commissions.colAmount')}</th>
                <th>{t('commercial.commissions.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {data.commissions.map((line) => (
                <tr key={line._id}>
                  <td>{formatDay(line.receivedAt)}</td>
                  <td>
                    {line.clientName}
                    <div className="commercial-muted">
                      {line.invoiceNumber}
                      {line.kind === 'REFUND' && ` · ${t('commercial.commissions.refund')}`}
                    </div>
                  </td>
                  <td className="commercial-amount">{formatCents(line.baseHtCents)}</td>
                  <td className="commercial-amount">{formatCents(line.amountCents)}</td>
                  <td>
                    {line.status === 'PAID' ? (
                      <span className="admin-badge status-termine">
                        {t('commercial.commissions.paidOn', { date: formatDay(line.paidAt) })}
                      </span>
                    ) : (
                      <span className="admin-badge status-en-attente">{t('commercial.commissions.toPay')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
