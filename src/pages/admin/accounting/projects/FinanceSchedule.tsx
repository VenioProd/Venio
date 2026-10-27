import { useState } from 'react'
import { formatMoney, formatPercent } from './money'
import { ACCOUNTING, ActionForm, dateInput, dateLabel, Field, InvoiceLink, labels, Table, text, write } from './shared'
import type { FinanceResponse } from './types'

export default function FinanceSchedule({
  data,
  projectId,
  canManage,
  onSaved,
}: {
  data: FinanceResponse
  projectId: string
  canManage: boolean
  onSaved: () => Promise<void>
}) {
  const [warning, setWarning] = useState('')
  const finance = data.finance
  if (!finance) return null
  const payerLabel = (id: string) => {
    const payer = finance.payers.find((payer) => payer._id === id)
    if (payer?.billingContact?.name) return payer.billingContact.name
    if (payer?.kind === 'CLIENT') return 'Client du projet'
    return payer?.isPrincipal ? 'Payeur principal' : 'Payeur'
  }
  if (finance.mode === 'ABONNEMENT')
    return (
      <section className="accounting-card">
        <h2>Périodes d’abonnement</h2>
        {warning && <p role="status">{warning}</p>}
        <p>
          Prochaine période :{' '}
          {data.subscriptionState?.nextPeriodStart
            ? dateLabel(data.subscriptionState.nextPeriodStart)
            : 'Abonnement terminé'}
          .
        </p>
        {canManage && data.subscriptionState?.nextPeriodStart && (
          <ActionForm
            label="Générer les factures des périodes échues"
            submit={async (_, key) => {
              const result = await write<{ warning?: string }>(
                `${ACCOUNTING}/projects/${projectId}/subscription/invoices`,
                'POST',
                {},
                key,
              )
              setWarning(result.warning || '')
            }}
            onSaved={onSaved}
          />
        )}
        {!data.subscriptionState?.periods.length && <p>Aucune période générée.</p>}
        {data.subscriptionState?.periods.map((period) => (
          <div className="pf-record" key={period.periodStart}>
            <h3>
              Du {dateLabel(period.periodStart)} au {dateLabel(period.periodEnd)}
            </h3>
            <Table headers={['Payeur', 'Facture', 'État', 'Montant TTC']}>
              {period.invoices.map((invoice) => (
                <tr key={invoice._id}>
                  <td>{payerLabel(invoice.payer?.payerId || '')}</td>
                  <td>
                    <InvoiceLink id={invoice._id} number={invoice.number} projectId={projectId} />
                  </td>
                  <td>{labels[invoice.status] || invoice.status}</td>
                  <td className="amount">{formatMoney(Math.round(invoice.total * 100))}</td>
                </tr>
              ))}
            </Table>
            {canManage && period.invoices.every((invoice) => invoice.status === 'CANCELLED') && (
              <ActionForm
                label="Régénérer cette période annulée"
                submit={(_, key) =>
                  write(
                    `${ACCOUNTING}/projects/${projectId}/subscription/periods/${dateInput(period.periodStart)}/invoices`,
                    'POST',
                    {},
                    key,
                  )
                }
                onSaved={onSaved}
              />
            )}
          </div>
        ))}
        {canManage && (
          <details>
            <summary>Générer une période précise</summary>
            <ActionForm
              label="Générer les factures de cette période"
              submit={(values, key) =>
                write(
                  `${ACCOUNTING}/projects/${projectId}/subscription/periods/${text(values, 'periodStart')}/invoices`,
                  'POST',
                  {},
                  key,
                )
              }
              onSaved={onSaved}
            >
              <p>
                Choisissez la date de début exacte d’une période de l’abonnement. Le serveur vérifie le calendrier et
                les factures existantes.
              </p>
              <Field label="Début de période">
                <input name="periodStart" type="date" required />
              </Field>
            </ActionForm>
          </details>
        )}
      </section>
    )
  return (
    <section className="accounting-card">
      <h2>Échéancier</h2>
      {data.schedule.map((item) => (
        <div className="pf-record" key={item._id}>
          <h3>
            {item.label} · {formatPercent(item.percentBp)} · {labels[item.status] || item.status}
          </h3>
          <p>
            {formatMoney(item.htCents)} HT ·{' '}
            {item.trigger.kind === 'DATE' ? dateLabel(item.trigger.dueDate) : `Jalon : ${item.trigger.phase}`}
          </p>
          <Table headers={['Payeur', 'HT', 'TVA', 'TTC', 'Facture']}>
            {item.payers.map((payer) => {
              const invoice = item.invoices.find((invoice) => invoice.payer?.payerId === payer.payerId)
              return (
                <tr key={payer.payerId}>
                  <td>{payerLabel(payer.payerId)}</td>
                  <td className="amount">{formatMoney(payer.htCents)}</td>
                  <td className="amount">{formatMoney(payer.vatCents)}</td>
                  <td className="amount">{formatMoney(payer.ttcCents)}</td>
                  <td>
                    {invoice ? (
                      <>
                        <InvoiceLink id={invoice._id} number={invoice.number} projectId={projectId} /> ·{' '}
                        {labels[invoice.status] || invoice.status}
                      </>
                    ) : (
                      'À générer'
                    )}
                  </td>
                </tr>
              )
            })}
          </Table>
          {canManage && item.status !== 'FACTUREE' && (
            <ActionForm
              label="Générer les factures"
              submit={(_, key) =>
                write(`${ACCOUNTING}/projects/${projectId}/installments/${item._id}/invoices`, 'POST', {}, key)
              }
              onSaved={onSaved}
            />
          )}
        </div>
      ))}
    </section>
  )
}
