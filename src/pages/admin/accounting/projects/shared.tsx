import { useRef, useState, type ReactNode, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, apiFetch } from '../../../../lib/api'
import { useI18n } from '../../../../context/I18nContext'
import { translate, type MessageKey, type MessageParams } from '../../../../i18n'
import { formatDate } from '../../../../i18n/format'
import { formatMoney } from './money'
import type { FinanceSummary, ShareTotals } from './types'
import './ProjectAccounting.css'

export const ACCOUNTING = '/api/admin/accounting'
export const projectHref = (id: string) => `/admin/projets/${id}?tab=accounting`
export const invoiceHref = (id: string, projectId: string) => `${projectHref(projectId)}#facture-${id}`
export const dateLabel = (date?: string | null) => (date ? formatDate(date, { timeZone: 'UTC' }) : '—')
export const dateInput = (date?: string | null) => date?.slice(0, 10) || ''
export const today = () => new Date().toISOString().slice(0, 10)
export const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim()
export const errorText = (error: unknown) =>
  error instanceof Error ? error.message : translate('accProjects.common.genericError')
export const methodOptions = ['VIREMENT', 'CB', 'PRELEVEMENT', 'STRIPE']
type Translate = (key: MessageKey, params?: MessageParams) => string
const LABEL_KEYS = {
  FORFAIT: 'accProjects.label.forfait',
  ECHEANCIER: 'accProjects.label.echeancier',
  ABONNEMENT: 'accProjects.label.abonnement',
  DRAFT: 'accProjects.label.draft',
  ISSUED: 'accProjects.label.issued',
  SENT: 'accProjects.label.sent',
  PARTIALLY_PAID: 'accProjects.label.partiallyPaid',
  PAID: 'accProjects.label.paid',
  CANCELLED: 'accProjects.label.cancelled',
  PLANIFIEE: 'accProjects.label.planifiee',
  A_FACTURER: 'accProjects.label.aFacturer',
  FACTUREE: 'accProjects.label.facturee',
  VIREMENT: 'accProjects.label.virement',
  CB: 'accProjects.label.cb',
  PRELEVEMENT: 'accProjects.label.prelevement',
  STRIPE: 'accProjects.label.stripe',
  ASSOCIE: 'accProjects.label.associe',
  COMMERCIAL: 'accProjects.label.commercial',
  FREELANCE: 'accProjects.label.freelance',
  APPORTEUR: 'accProjects.label.apporteur',
  BANQUE: 'accProjects.label.banque',
  PAIE: 'accProjects.label.paie',
  MONTHLY: 'accProjects.label.monthly',
  QUARTERLY: 'accProjects.label.quarterly',
  YEARLY: 'accProjects.label.yearly',
} as const satisfies Record<string, MessageKey>
/** Libellé d’une valeur d’énumération ; une valeur inconnue est affichée telle quelle. */
export function labelFor(t: Translate, value?: string | null): string {
  if (!value) return ''
  return Object.prototype.hasOwnProperty.call(LABEL_KEYS, value)
    ? t(LABEL_KEYS[value as keyof typeof LABEL_KEYS])
    : value
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
  const { t } = useI18n()
  const items: [MessageKey, number][] = [
    ['accProjects.cols.invoicedHt', summary.invoicedHtCents],
    ['accProjects.cols.receivedTtc', summary.receivedTtcCents],
    ['accProjects.metrics.remainingToCollectTtc', summary.remainingTtcCents],
  ]
  if (full)
    items.push(
      ['accProjects.metrics.receivedHtNet', summary.receivedHtCents],
      ['accProjects.metrics.directCostsHt', summary.directCostsCents],
    )
  items.push(['accProjects.cols.marginHt', summary.marginCents])
  return (
    <div className="pf-metrics">
      {items.map(([label, value]) => (
        <div className="accounting-card pf-metric" key={label}>
          <span>{t(label)}</span>
          <strong>{formatMoney(value)}</strong>
        </div>
      ))}
    </div>
  )
}
export function ShareMetrics({ totals }: { totals: ShareTotals }) {
  const { t } = useI18n()
  return (
    <div className="pf-metrics">
      {(
        [
          ['accProjects.cols.dueHt', totals.dueCents],
          ['accProjects.cols.paidHt', totals.paidCents],
          ['accProjects.cols.remainingHt', totals.remainingCents],
        ] as const
      ).map(([label, value]) => (
        <div className="accounting-card pf-metric" key={label}>
          <span>{t(label)}</span>
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
  const { t } = useI18n()
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
    setSuccess(t('accProjects.common.saved'))
    try {
      await onSaved()
    } catch (error) {
      setError(t('accProjects.common.refreshFailed', { error: errorText(error) }))
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
      {uncertain && retryable && <p role="status">{t('accProjects.common.unconfirmed')}</p>}
      {uncertain && !retryable && (
        <>
          <p role="status">{t('accProjects.common.unconfirmedRefresh')}</p>
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
            {t('accProjects.common.refreshToCheck')}
          </button>
        </>
      )}
      {success && <p role="status">{success}</p>}
      <button className="portal-button" disabled={pending || !!success || (uncertain && !retryable)} type="submit">
        {pending ? t('accProjects.common.saving') : label}
      </button>
    </form>
  )
}
