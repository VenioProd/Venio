import { useState } from 'react'
import { apiDownload } from '../../../../lib/api'
import { useI18n } from '../../../../context/I18nContext'
import { formatMoney, parseMoney } from './money'
import {
  ACCOUNTING,
  ActionForm,
  dateLabel,
  errorText,
  Field,
  labelFor,
  methodOptions,
  text,
  today,
  write,
} from './shared'
import type { Invoice, Payment } from './types'
import InvoicePaymentLink from './InvoicePaymentLink'

function ReceiptForm({ invoice, onSaved }: { invoice: Invoice; onSaved: () => Promise<void> }) {
  const { t } = useI18n()
  return (
    <ActionForm
      label={t('accProjects.invoices.saveReceipt')}
      onSaved={onSaved}
      submit={(data, key) => {
        const amountTtcCents = parseMoney(text(data, 'amount'))
        if (amountTtcCents > invoice.remainingTtcCents) throw new Error(t('accProjects.invoices.amountOverRemaining'))
        return write(
          `${ACCOUNTING}/invoices/${invoice._id}/payments`,
          'POST',
          {
            amountTtcCents,
            method: text(data, 'method'),
            receivedAt: text(data, 'date'),
            reference: text(data, 'reference'),
          },
          key,
        )
      }}
    >
      <div className="pf-grid">
        <Field label={t('accProjects.common.amountTtcEur')}>
          <input name="amount" required inputMode="decimal" defaultValue={String(invoice.remainingTtcCents / 100)} />
        </Field>
        <Field label={t('accProjects.invoices.method')}>
          <select name="method">
            {methodOptions.map((method) => (
              <option key={method} value={method}>
                {labelFor(t, method)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('accProjects.invoices.receiptDate')}>
          <input name="date" type="date" max={today()} required defaultValue={today()} />
        </Field>
        <Field label={t('accProjects.invoices.reference')}>
          <input name="reference" />
        </Field>
      </div>
    </ActionForm>
  )
}

function RefundForm({
  payment,
  remaining,
  onSaved,
}: {
  payment: Payment
  remaining: number
  onSaved: () => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <ActionForm
      label={t('accProjects.invoices.saveRefund')}
      onSaved={onSaved}
      submit={(data, key) => {
        const amountTtcCents = parseMoney(text(data, 'amount'))
        if (amountTtcCents > remaining) throw new Error(t('accProjects.invoices.amountOverRefundable'))
        return write(
          `${ACCOUNTING}/payments/${payment._id}/refunds`,
          'POST',
          { amountTtcCents, receivedAt: text(data, 'date'), reason: text(data, 'reason') },
          key,
        )
      }}
    >
      <p>
        {t('accProjects.invoices.refundContext', {
          date: dateLabel(payment.receivedAt),
          amount: formatMoney(payment.amountTtcCents),
          refundable: formatMoney(remaining),
        })}
      </p>
      <div className="pf-grid">
        <Field label={t('accProjects.common.amountTtcEur')}>
          <input name="amount" required inputMode="decimal" defaultValue={String(remaining / 100)} />
        </Field>
        <Field label={t('accProjects.invoices.refundDate')}>
          <input name="date" type="date" max={today()} required defaultValue={today()} />
        </Field>
        <Field label={t('accProjects.cols.reason')}>
          <textarea name="reason" required />
        </Field>
      </div>
    </ActionForm>
  )
}

function CreditForm({ invoice, onSaved }: { invoice: Invoice; onSaved: () => Promise<void> }) {
  const { t } = useI18n()
  const [partial, setPartial] = useState(false)
  return (
    <ActionForm
      label={t('accProjects.invoices.createCredit')}
      retryable={false}
      onSaved={onSaved}
      submit={(data, key) =>
        write(
          `${ACCOUNTING}/invoices/${invoice._id}/credit-notes`,
          'POST',
          {
            reason: text(data, 'reason'),
            ...(partial ? { amountHtCents: parseMoney(text(data, 'amount')) } : {}),
          },
          key,
        )
      }
    >
      <p>{t('accProjects.invoices.creditDraftNote')}</p>
      <div className="pf-grid">
        <Field label={t('accProjects.invoices.creditType')}>
          <select
            value={partial ? 'partial' : 'total'}
            onChange={(event) => setPartial(event.target.value === 'partial')}
          >
            <option value="total">{t('accProjects.invoices.creditTotal')}</option>
            <option value="partial">{t('accProjects.invoices.creditPartial')}</option>
          </select>
        </Field>
        {partial && (
          <Field label={t('accProjects.common.amountHtEur')}>
            <input name="amount" required inputMode="decimal" />
          </Field>
        )}
        <Field label={t('accProjects.cols.reason')}>
          <textarea name="reason" required />
        </Field>
      </div>
    </ActionForm>
  )
}

export default function FinanceInvoices({
  invoices,
  payments,
  canManage,
  canIssue,
  canDownload,
  onSaved,
}: {
  invoices: Invoice[]
  payments: Payment[]
  canManage: boolean
  canIssue: boolean
  canDownload: boolean
  onSaved: () => Promise<void>
}) {
  const { t } = useI18n()
  const [action, setAction] = useState<{ kind: string; id: string } | null>(null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const saved = async () => {
    setAction(null)
    await onSaved()
  }
  const download = async (invoice: Invoice) => {
    setError('')
    try {
      const { blob, filename } = await apiDownload(`/api/admin/billing/${invoice._id}/pdf`)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename || `${invoice.number}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setError(errorText(error))
    }
  }
  return (
    <section className="accounting-card">
      <h2>{t('accProjects.invoices.title')}</h2>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {warning && <p role="status">{warning}</p>}
      {!invoices.length && <p>{t('accProjects.invoices.empty')}</p>}
      {invoices.map((invoice) => {
        const receipts = payments.filter((payment) => payment.invoice === invoice._id)
        const received = receipts.reduce((sum, payment) => sum + payment.amountTtcCents, 0)
        const issued = !['DRAFT', 'CANCELLED'].includes(invoice.status)
        const creditable = issued && !invoice.creditedInvoice && !invoice.historical && received === 0
        return (
          <article className="pf-record" id={`facture-${invoice._id}`} key={invoice._id}>
            <h3>
              {invoice.number}
              {invoice.creditedInvoice && ` · ${t('accProjects.invoices.creditNote')}`} · {labelFor(t, invoice.status)}
            </h3>
            <p>
              {t('accProjects.invoices.summary', {
                payer: invoice.payerName,
                total: formatMoney(invoice.totalTtcCents),
                due: dateLabel(invoice.dueAt),
              })}
            </p>
            {!invoice.creditedInvoice && (
              <p>
                {t('accProjects.invoices.remainingDue')}{' '}
                <strong>{t('accProjects.common.ttc', { amount: formatMoney(invoice.remainingTtcCents) })}</strong>
                {invoice.status === 'DRAFT' && ` · ${t('accProjects.invoices.draftForecast')}`}
              </p>
            )}
            {invoice.historical && <p className="pf-status">{t('accProjects.invoices.historicalNote')}</p>}
            <div className="pf-actions">
              {canDownload && issued && (
                <button className="portal-button secondary" onClick={() => void download(invoice)}>
                  {t('accProjects.invoices.downloadPdf')}
                </button>
              )}
              {canManage && invoice.status === 'DRAFT' && (
                <>
                  {canIssue && (
                    <ActionForm
                      label={t('accProjects.invoices.issue')}
                      submit={async (_, key) => {
                        const result = await write<{ accounting?: { warning?: string } }>(
                          `/api/admin/billing/${invoice._id}/generate-pdf`,
                          'POST',
                          {},
                          key,
                        )
                        setWarning(result.accounting?.warning || '')
                      }}
                      onSaved={saved}
                    />
                  )}
                  {!canIssue && <p className="pf-status">{t('accProjects.invoices.issueRightRequired')}</p>}
                </>
              )}
              {canManage &&
                issued &&
                !invoice.creditedInvoice &&
                !invoice.historical &&
                invoice.remainingTtcCents > 0 && (
                  <button className="portal-button" onClick={() => setAction({ kind: 'payment', id: invoice._id })}>
                    {t('accProjects.invoices.collect')}
                  </button>
                )}
              {canManage && creditable && (
                <button
                  className="portal-button secondary"
                  onClick={() => setAction({ kind: 'credit', id: invoice._id })}
                >
                  {t('accProjects.invoices.creditNote')}
                </button>
              )}
            </div>
            {canManage &&
              issued &&
              !invoice.creditedInvoice &&
              !invoice.historical &&
              invoice.remainingTtcCents > 0 && <InvoicePaymentLink invoiceId={invoice._id} />}
            {canManage && issued && !invoice.creditedInvoice && received > 0 && (
              <p className="pf-status">{t('accProjects.invoices.refundBeforeCredit')}</p>
            )}
            {canManage && action?.kind === 'payment' && action.id === invoice._id && (
              <ReceiptForm invoice={invoice} onSaved={saved} />
            )}
            {canManage && action?.kind === 'credit' && action.id === invoice._id && (
              <CreditForm invoice={invoice} onSaved={saved} />
            )}
            {receipts.map((payment) => {
              const refundable =
                payment.amountTtcCents +
                receipts
                  .filter((refund) => refund.refundOf === payment._id)
                  .reduce((sum, refund) => sum + refund.amountTtcCents, 0)
              return (
                <div className="pf-record" key={payment._id}>
                  <p>
                    {t(
                      payment.kind === 'REFUND'
                        ? 'accProjects.invoices.refundLine'
                        : 'accProjects.invoices.receiptLine',
                      {
                        date: dateLabel(payment.receivedAt),
                        ttc: formatMoney(payment.amountTtcCents),
                        ht: formatMoney(payment.htCents),
                        method: labelFor(t, payment.method),
                      },
                    )}
                  </p>
                  <p>
                    {payment.reference}
                    {payment.reason && ` · ${payment.reason}`}
                  </p>
                  {canManage && payment.kind === 'PAYMENT' && refundable > 0 && payment.source === 'STRIPE' && (
                    <p>{t('accProjects.invoices.stripeRefundNote')}</p>
                  )}
                  {canManage && payment.kind === 'PAYMENT' && refundable > 0 && payment.source !== 'STRIPE' && (
                    <button
                      className="portal-button secondary"
                      onClick={() => setAction({ kind: 'refund', id: payment._id })}
                    >
                      {t('accProjects.invoices.refundThisReceipt')}
                    </button>
                  )}
                  {canManage && action?.kind === 'refund' && action.id === payment._id && (
                    <RefundForm payment={payment} remaining={refundable} onSaved={saved} />
                  )}
                </div>
              )
            })}
          </article>
        )
      })}
    </section>
  )
}
