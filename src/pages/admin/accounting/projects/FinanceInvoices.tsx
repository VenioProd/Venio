import { useState } from 'react'
import { apiDownload } from '../../../../lib/api'
import { formatMoney, parseMoney } from './money'
import {
  ACCOUNTING,
  ActionForm,
  dateLabel,
  errorText,
  Field,
  labels,
  methodOptions,
  text,
  today,
  write,
} from './shared'
import type { Invoice, Payment } from './types'

function ReceiptForm({ invoice, onSaved }: { invoice: Invoice; onSaved: () => Promise<void> }) {
  return (
    <ActionForm
      label="Enregistrer l’encaissement"
      onSaved={onSaved}
      submit={(data, key) => {
        const amountTtcCents = parseMoney(text(data, 'amount'))
        if (amountTtcCents > invoice.remainingTtcCents) throw new Error('Le montant dépasse le reste dû de la facture.')
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
        <Field label="Montant TTC (€)">
          <input name="amount" required inputMode="decimal" defaultValue={String(invoice.remainingTtcCents / 100)} />
        </Field>
        <Field label="Moyen">
          <select name="method">
            {methodOptions.map((method) => (
              <option key={method} value={method}>
                {labels[method]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date d’encaissement">
          <input name="date" type="date" max={today()} required defaultValue={today()} />
        </Field>
        <Field label="Référence">
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
  return (
    <ActionForm
      label="Enregistrer le remboursement"
      onSaved={onSaved}
      submit={(data, key) => {
        const amountTtcCents = parseMoney(text(data, 'amount'))
        if (amountTtcCents > remaining) throw new Error('Le montant dépasse le solde remboursable de cet encaissement.')
        return write(
          `${ACCOUNTING}/payments/${payment._id}/refunds`,
          'POST',
          { amountTtcCents, receivedAt: text(data, 'date'), reason: text(data, 'reason') },
          key,
        )
      }}
    >
      <p>
        Encaissement du {dateLabel(payment.receivedAt)} · {formatMoney(payment.amountTtcCents)} TTC · Remboursable :{' '}
        {formatMoney(remaining)} TTC.
      </p>
      <div className="pf-grid">
        <Field label="Montant TTC (€)">
          <input name="amount" required inputMode="decimal" defaultValue={String(remaining / 100)} />
        </Field>
        <Field label="Date de remboursement">
          <input name="date" type="date" max={today()} required defaultValue={today()} />
        </Field>
        <Field label="Motif">
          <textarea name="reason" required />
        </Field>
      </div>
    </ActionForm>
  )
}

function CreditForm({ invoice, onSaved }: { invoice: Invoice; onSaved: () => Promise<void> }) {
  const [partial, setPartial] = useState(false)
  return (
    <ActionForm
      label="Créer l’avoir brouillon"
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
      <p>L’avoir créé est un brouillon. Il devra être émis pour réduire le facturé.</p>
      <div className="pf-grid">
        <Field label="Type d’avoir">
          <select
            value={partial ? 'partial' : 'total'}
            onChange={(event) => setPartial(event.target.value === 'partial')}
          >
            <option value="total">Total de la facture (sans avoir antérieur)</option>
            <option value="partial">Partiel en HT</option>
          </select>
        </Field>
        {partial && (
          <Field label="Montant HT (€)">
            <input name="amount" required inputMode="decimal" />
          </Field>
        )}
        <Field label="Motif">
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
      <h2>Factures et encaissements</h2>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {warning && <p role="status">{warning}</p>}
      {!invoices.length && <p>Aucune facture pour ce projet.</p>}
      {invoices.map((invoice) => {
        const receipts = payments.filter((payment) => payment.invoice === invoice._id)
        const received = receipts.reduce((sum, payment) => sum + payment.amountTtcCents, 0)
        const issued = !['DRAFT', 'CANCELLED'].includes(invoice.status)
        const creditable = issued && !invoice.creditedInvoice && !invoice.historical && received === 0
        return (
          <article className="pf-record" id={`facture-${invoice._id}`} key={invoice._id}>
            <h3>
              {invoice.number}
              {invoice.creditedInvoice && ' · Avoir'} · {labels[invoice.status] || invoice.status}
            </h3>
            <p>
              {invoice.payerName} · {formatMoney(invoice.totalTtcCents)} TTC · Échéance : {dateLabel(invoice.dueAt)}
            </p>
            {!invoice.creditedInvoice && (
              <p>
                Reste dû : <strong>{formatMoney(invoice.remainingTtcCents)} TTC</strong>
                {invoice.status === 'DRAFT' && ' · Montant prévisionnel du brouillon'}
              </p>
            )}
            {invoice.historical && (
              <p className="pf-status">
                Facture réglée avant le suivi détaillé : toute correction passe par une écriture manuelle.
              </p>
            )}
            <div className="pf-actions">
              {canDownload && issued && (
                <button className="portal-button secondary" onClick={() => void download(invoice)}>
                  Télécharger le PDF
                </button>
              )}
              {canManage && invoice.status === 'DRAFT' && (
                <>
                  {canIssue && (
                    <ActionForm
                      label="Émettre"
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
                  {!canIssue && (
                    <p className="pf-status">Le droit de gestion de la facturation est requis pour émettre.</p>
                  )}
                </>
              )}
              {canManage &&
                issued &&
                !invoice.creditedInvoice &&
                !invoice.historical &&
                invoice.remainingTtcCents > 0 && (
                  <button className="portal-button" onClick={() => setAction({ kind: 'payment', id: invoice._id })}>
                    Encaisser
                  </button>
                )}
              {canManage && creditable && (
                <button
                  className="portal-button secondary"
                  onClick={() => setAction({ kind: 'credit', id: invoice._id })}
                >
                  Avoir
                </button>
              )}
            </div>
            {canManage && issued && !invoice.creditedInvoice && received > 0 && (
              <p className="pf-status">Remboursez les encaissements avant de créer un avoir.</p>
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
                    {payment.kind === 'REFUND' ? 'Remboursement' : 'Encaissement'} du {dateLabel(payment.receivedAt)} ·{' '}
                    {formatMoney(payment.amountTtcCents)} TTC · {formatMoney(payment.htCents)} HT ·{' '}
                    {labels[payment.method] || payment.method}
                  </p>
                  <p>
                    {payment.reference}
                    {payment.reason && ` · ${payment.reason}`}
                  </p>
                  {canManage && payment.kind === 'PAYMENT' && refundable > 0 && (
                    <button
                      className="portal-button secondary"
                      onClick={() => setAction({ kind: 'refund', id: payment._id })}
                    >
                      Rembourser cet encaissement
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
