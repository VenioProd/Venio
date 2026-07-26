import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { billingPdfUrl, listBillingDocuments } from '../../services/quotes'
import type { ClientBillingDocument } from '../../types/quote.types'
import './ClientPortal.css'

const euros = (value: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)

const TYPE_LABELS: Record<string, string> = { QUOTE: 'Devis', INVOICE: 'Facture' }

const ClientBilling = () => {
  const { projectId = '' } = useParams()
  const [documents, setDocuments] = useState<ClientBillingDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listBillingDocuments(projectId)
      .then((data) => setDocuments(data.documents))
      .catch((err: Error) => setError(err.message || 'Chargement impossible'))
      .finally(() => setLoading(false))
  }, [projectId])

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
      <h1>Devis et factures</h1>
      {documents.length === 0 ? (
        <p>Aucun document disponible pour le moment.</p>
      ) : (
        <ul className="portal-list">
          {documents.map((document) => (
            <li key={document._id}>
              <strong>{document.number}</strong> — {TYPE_LABELS[document.type] ?? document.type} —{' '}
              {euros(document.total)}
              {document.issuedAt && ` — émis le ${new Date(document.issuedAt).toLocaleDateString('fr-FR')}`}
              <a href={billingPdfUrl(projectId, document._id)}>Télécharger</a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ClientBilling
