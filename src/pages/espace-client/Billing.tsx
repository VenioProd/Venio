import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'
import { formatDate, formatMoney } from '../../i18n/format'
import type { MessageKey } from '../../i18n'
import { billingPdfUrl, listBillingDocuments } from '../../services/quotes'
import type { ClientBillingDocument } from '../../types/quote.types'
import './ClientPortal.css'

const TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  QUOTE: 'client.billing.typeQuote',
  INVOICE: 'client.billing.typeInvoice',
}

const ClientBilling = () => {
  const { t } = useI18n()
  const { projectId = '' } = useParams()
  const [documents, setDocuments] = useState<ClientBillingDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listBillingDocuments(projectId)
      .then((data) => setDocuments(data.documents))
      .catch((err: Error) => setError(err.message || t('client.billing.loadError')))
      .finally(() => setLoading(false))
  }, [projectId, t])

  if (loading)
    return (
      <div className="portal-container">
        <div className="portal-spinner" />
      </div>
    )
  if (error)
    return (
      <div className="portal-container">
        <p>{error}</p>
      </div>
    )

  return (
    <div className="portal-container">
      <h1>{t('client.billing.title')}</h1>
      {documents.length === 0 ? (
        <p>{t('client.billing.empty')}</p>
      ) : (
        <ul className="portal-list">
          {documents.map((document) => (
            <li key={document._id}>
              <strong>{document.number}</strong> —{' '}
              {TYPE_LABEL_KEYS[document.type] ? t(TYPE_LABEL_KEYS[document.type]) : document.type} —{' '}
              {formatMoney(document.total)}
              {document.issuedAt && ` — ${t('client.billing.issuedOn', { date: formatDate(document.issuedAt) })}`}
              <a href={billingPdfUrl(projectId, document._id)}>{t('client.billing.download')}</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ClientBilling
