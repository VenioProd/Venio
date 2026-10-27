import { useRef, useState, type ReactNode, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, apiFetch } from '../../../../lib/api'
import { formatMoney } from './money'
import type { FinanceSummary, ShareTotals } from './types'
import './ProjectAccounting.css'

export const ACCOUNTING = '/api/admin/accounting'
export const projectHref = (id: string) => `/admin/projets/${id}?tab=accounting`
export const invoiceHref = (id: string, projectId: string) => `${projectHref(projectId)}#facture-${id}`
export const dateLabel = (date?: string | null) =>
  date ? new Date(date).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '—'
export const dateInput = (date?: string | null) => date?.slice(0, 10) || ''
export const today = () => new Date().toISOString().slice(0, 10)
export const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim()
export const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Une erreur est survenue.')
export const methodOptions = ['VIREMENT', 'CB', 'PRELEVEMENT', 'STRIPE']
export const labels: Record<string, string> = {
  FORFAIT: 'Forfait',
  ECHEANCIER: 'Échéancier',
  ABONNEMENT: 'Abonnement',
  DRAFT: 'Brouillon',
  ISSUED: 'Émise',
  SENT: 'Envoyée',
  PARTIALLY_PAID: 'Partiellement réglée',
  PAID: 'Réglée',
  CANCELLED: 'Annulée',
  PLANIFIEE: 'Planifiée',
  A_FACTURER: 'À facturer',
  FACTUREE: 'Facturée',
  VIREMENT: 'Virement',
  CB: 'Carte bancaire',
  PRELEVEMENT: 'Prélèvement',
  STRIPE: 'Stripe',
  ASSOCIE: 'Associé',
  COMMERCIAL: 'Commercial',
  FREELANCE: 'Freelance',
  APPORTEUR: 'Apporteur',
  BANQUE: 'Banque',
  PAIE: 'Paie',
  MONTHLY: 'Mensuelle',
  QUARTERLY: 'Trimestrielle',
  YEARLY: 'Annuelle',
}
export async function write<T = unknown>(path: string, method: string, body: object, idempotencyKey: string) {
  return apiFetch<T>(path, { method, body: JSON.stringify({ ...body, idempotencyKey }) })
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="pf-field">
      <span>{label}</span>
      {children}
    </label>
  )
}
export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="pf-table-scroll" tabIndex={0} role="region" aria-label={headers.join(', ')}>
      <table className="accounting-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
export function Metrics({ summary, full = false }: { summary: Omit<FinanceSummary, 'beneficiaries'>; full?: boolean }) {
  const items: [string, number][] = [
    ['Facturé HT', summary.invoicedHtCents],
    ['Encaissé TTC', summary.receivedTtcCents],
    ['Reste à encaisser TTC', summary.remainingTtcCents],
  ]
  if (full) items.push(['HT encaissé net', summary.receivedHtCents], ['Coûts directs HT', summary.directCostsCents])
  items.push(['Marge HT', summary.marginCents])
  return (
    <div className="pf-metrics">
      {items.map(([label, value]) => (
        <div className="accounting-card pf-metric" key={label}>
          <span>{label}</span>
          <strong>{formatMoney(value)}</strong>
        </div>
      ))}
    </div>
  )
}
export function ShareMetrics({ totals }: { totals: ShareTotals }) {
  return (
    <div className="pf-metrics">
      {(
        [
          ['Dû HT', totals.dueCents],
          ['Versé HT', totals.paidCents],
          ['Restant HT', totals.remainingCents],
        ] as const
      ).map(([label, value]) => (
        <div className="accounting-card pf-metric" key={label}>
          <span>{label}</span>
          <strong>{formatMoney(value)}</strong>
        </div>
      ))}
    </div>
  )
}
export function InvoiceLink({ id, number, projectId }: { id: string; number: string; projectId: string }) {
  return <Link to={invoiceHref(id, projectId)}>{number}</Link>
}
export function ActionForm({
  label,
  children,
  submit,
  onSaved,
  className = '',
  retryable = true,
}: {
  label: string
  children?: ReactNode
  className?: string
  retryable?: boolean
  submit: (data: FormData, key: string) => Promise<unknown>
  onSaved: () => void | Promise<void>
}) {
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [pending, setPending] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const locked = useRef(false)
  const snapshot = useRef<FormData | null>(null)
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (locked.current) return
    const form = event.currentTarget
    const values = snapshot.current ?? new FormData(form)
    locked.current = true
    setPending(true)
    setError('')
    setSuccess('')
    try {
      await submit(values, key)
    } catch (error) {
      const ambiguous = error instanceof TypeError || (error instanceof ApiError && error.status >= 500)
      snapshot.current = ambiguous ? values : null
      setUncertain(ambiguous)
      setError(errorText(error))
      locked.current = false
      setPending(false)
      return
    }
    snapshot.current = null
    setUncertain(false)
    setKey(crypto.randomUUID())
    setSuccess('Enregistré.')
    try {
      await onSaved()
    } catch (error) {
      setError(`L’écriture a été enregistrée, mais l’actualisation a échoué : ${errorText(error)}. Rechargez la page.`)
    } finally {
      setPending(false)
      locked.current = false
    }
  }
  return (
    <form className={`pf-action-form ${className}`} onSubmit={handleSubmit} onChange={() => setSuccess('')}>
      {children && <fieldset disabled={pending || uncertain}>{children}</fieldset>}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {uncertain && retryable && (
        <p role="status">La réponse n’a pas confirmé l’opération. Réessayez la même demande avec les mêmes données.</p>
      )}
      {uncertain && !retryable && (
        <>
          <p role="status">
            La réponse n’a pas confirmé l’opération. Actualisez les données pour vérifier si elle a été enregistrée
            avant toute nouvelle demande.
          </p>
          <button
            className="portal-button secondary"
            type="button"
            onClick={async () => {
              try {
                await onSaved()
              } catch (error) {
                setError(errorText(error))
              }
            }}
          >
            Actualiser pour vérifier
          </button>
        </>
      )}
      {success && <p role="status">{success}</p>}
      <button className="portal-button" disabled={pending || !!success || (uncertain && !retryable)} type="submit">
        {pending ? 'Enregistrement…' : label}
      </button>
    </form>
  )
}
