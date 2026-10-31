import { useEffect, useState } from 'react'
import {
  commercialApi,
  formatCents,
  formatDate,
  type CommissionTotals,
  type RepClient,
  type RepCommission,
} from '../../services/externalSales'

export const CommercialClients = () => {
  const [clients, setClients] = useState<RepClient[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    commercialApi
      .clients()
      .then((data) => setClients(data.clients))
      .catch((err: Error) => setError(err.message))
  }, [])

  if (error) return <div className="admin-error">{error}</div>
  if (!clients) return <div className="admin-loading">Chargement…</div>
  if (clients.length === 0) {
    return (
      <div className="admin-empty-state">
        <p className="admin-empty-state-text">
          Vos clients apparaîtront ici dès qu’un de vos leads transmis sera signé.
        </p>
      </div>
    )
  }
  return (
    <div className="admin-table-wrapper">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Contact</th>
            <th>Signé le</th>
            <th className="commercial-amount">Encaissé HT</th>
            <th className="commercial-amount">Votre commission</th>
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
              <td>{formatDate(client.signedAt)}</td>
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
  if (!data) return <div className="admin-loading">Chargement…</div>
  return (
    <>
      <div className="commercial-stats">
        <div className="commercial-stat">
          <span className="commercial-muted">Encaissé HT sur vos clients</span>
          <span className="commercial-stat-value">{formatCents(data.totals.collectedHtCents)}</span>
        </div>
        <div className="commercial-stat">
          <span className="commercial-muted">Commissions à percevoir</span>
          <span className="commercial-stat-value">{formatCents(data.totals.dueCents)}</span>
        </div>
        <div className="commercial-stat">
          <span className="commercial-muted">Commissions versées</span>
          <span className="commercial-stat-value">{formatCents(data.totals.paidCents)}</span>
        </div>
      </div>
      <p className="commercial-muted">
        {data.rateBp / 100} % du HT réellement encaissé. Un remboursement au client réduit la commission d’autant.
      </p>
      {data.commissions.length === 0 ? (
        <div className="admin-empty-state">
          <p className="admin-empty-state-text">Aucune commission pour l’instant.</p>
        </div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Client · facture</th>
                <th className="commercial-amount">Encaissé HT</th>
                <th className="commercial-amount">Commission</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.commissions.map((line) => (
                <tr key={line._id}>
                  <td>{formatDate(line.receivedAt)}</td>
                  <td>
                    {line.clientName}
                    <div className="commercial-muted">
                      {line.invoiceNumber}
                      {line.kind === 'REFUND' && ' · remboursement'}
                    </div>
                  </td>
                  <td className="commercial-amount">{formatCents(line.baseHtCents)}</td>
                  <td className="commercial-amount">{formatCents(line.amountCents)}</td>
                  <td>
                    {line.status === 'PAID' ? (
                      <span className="admin-badge status-termine">Versée le {formatDate(line.paidAt)}</span>
                    ) : (
                      <span className="admin-badge status-en-attente">À verser</span>
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
