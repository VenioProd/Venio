import { useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import { formatMoney, formatPercent } from './money'
import {
  ACCOUNTING,
  ActionForm,
  dateInput,
  dateLabel,
  Field,
  InvoiceLink,
  labelFor,
  Table,
  text,
  write,
} from './shared'
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
  const { t } = useI18n()
  const [warning, setWarning] = useState('')
  const finance = data.finance
  if (!finance) return null
  const payerLabel = (id: string) => {
    const payer = finance.payers.find((payer) => payer._id === id)
    if (payer?.billingContact?.name) return payer.billingContact.name
    if (payer?.kind === 'CLIENT') return t('accProjects.schedule.projectClient')
    return payer?.isPrincipal ? t('accProjects.schedule.principalPayer') : t('accProjects.schedule.payer')
  }
  if (finance.mode === 'ABONNEMENT')
    return (
      <section className="accounting-card">
        <h2>{t('accProjects.schedule.subscriptionPeriods')}</h2>
        {warning && <p role="status">{warning}</p>}
        <p>
          {t('accProjects.schedule.nextPeriod', {
            value: data.subscriptionState?.nextPeriodStart
              ? dateLabel(data.subscriptionState.nextPeriodStart)
              : t('accProjects.schedule.subscriptionEnded'),
          })}
        </p>
        {canManage && data.subscriptionState?.nextPeriodStart && (
          <ActionForm
            label={t('accProjects.schedule.generateDue')}
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
        {!data.subscriptionState?.periods.length && <p>{t('accProjects.schedule.noPeriod')}</p>}
        {data.subscriptionState?.periods.map((period) => (
          <div className="pf-record" key={period.periodStart}>
            <h3>
              {t('accProjects.schedule.periodRange', {
                start: dateLabel(period.periodStart),
                end: dateLabel(period.periodEnd),
              })}
            </h3>
            <Table
              headers={[
                t('accProjects.cols.payer'),
                t('accProjects.cols.invoice'),
                t('accProjects.cols.status'),
                t('accProjects.cols.amountTtc'),
              ]}
            >
              {period.invoices.map((invoice) => (
                <tr key={invoice._id}>
                  <td>{payerLabel(invoice.payer?.payerId || '')}</td>
                  <td>
                    <InvoiceLink id={invoice._id} number={invoice.number} projectId={projectId} />
                  </td>
                  <td>{labelFor(t, invoice.status)}</td>
                  <td className="amount">{formatMoney(Math.round(invoice.total * 100))}</td>
                </tr>
              ))}
            </Table>
            {canManage && period.invoices.every((invoice) => invoice.status === 'CANCELLED') && (
              <ActionForm
                label={t('accProjects.schedule.regenerate')}
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
            <summary>{t('accProjects.schedule.generateSpecific')}</summary>
            <ActionForm
              label={t('accProjects.schedule.generateThisPeriod')}
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
              <p>{t('accProjects.schedule.specificHelp')}</p>
              <Field label={t('accProjects.schedule.periodStart')}>
                <input name="periodStart" type="date" required />
              </Field>
            </ActionForm>
          </details>
        )}
      </section>
    )
  return (
    <section className="accounting-card">
      <h2>{labelFor(t, 'ECHEANCIER')}</h2>
      {data.schedule.map((item) => (
        <div className="pf-record" key={item._id}>
          <h3>
            {item.label} · {formatPercent(item.percentBp)} · {labelFor(t, item.status)}
          </h3>
          <p>
            {t('accProjects.common.ht', { amount: formatMoney(item.htCents) })} ·{' '}
            {item.trigger.kind === 'DATE'
              ? dateLabel(item.trigger.dueDate)
              : t('accProjects.schedule.milestone', { phase: item.trigger.phase ?? '' })}
          </p>
          <Table
            headers={[
              t('accProjects.cols.payer'),
              t('accProjects.cols.ht'),
              t('accProjects.cols.vat'),
              t('accProjects.cols.ttc'),
              t('accProjects.cols.invoice'),
            ]}
          >
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
                        {labelFor(t, invoice.status)}
                      </>
                    ) : (
                      t('accProjects.schedule.toGenerate')
                    )}
                  </td>
                </tr>
              )
            })}
          </Table>
          {canManage && item.status !== 'FACTUREE' && (
            <ActionForm
              label={t('accProjects.schedule.generateInvoices')}
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
