import FinanceExports from './FinanceExports'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../../../context/I18nContext'
import { formatDate } from '../../../../i18n/format'
import { apiFetch } from '../../../../lib/api'
import AccountingLayout from '../AccountingLayout'
import FinancialChart from '../../../../components/dashboard/FinancialChart'
import '../../../../components/dashboard/dashboard.css'
import { formatMoney } from './money'
import { ACCOUNTING, dateLabel, errorText, InvoiceLink, labelFor, Metrics, projectHref, Table } from './shared'
import type { Dashboard } from './types'

export default function ProjectsDashboard() {
  const { t } = useI18n()
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(
    () =>
      apiFetch<Dashboard>(`${ACCOUNTING}/project-finance/dashboard`)
        .then((data) => {
          setData(data)
          setError('')
        })
        .catch((error) => setError(errorText(error))),
    [],
  )
  useEffect(() => {
    void load()
  }, [load])
  return (
    <AccountingLayout title={t('accProjects.dashboard.title')} subtitle={t('accProjects.dashboard.subtitle')}>
      <div className="pf-workspace">
        {error && (
          <p className="admin-error" role="alert">
            {error}{' '}
            <button className="portal-button secondary" onClick={load}>
              {t('accProjects.common.refresh')}
            </button>
          </p>
        )}
        {!data && !error && <p role="status">{t('accProjects.dashboard.loading')}</p>}
        {data && (
          <>
            <FinanceExports />
            <Metrics summary={data.totals} />
            <section className="accounting-card pf-chart">
              <h2>{t('accProjects.dashboard.forecastTitle')}</h2>
              <p className="pf-status">{t('accProjects.dashboard.forecastNote')}</p>
              <FinancialChart
                timeline
                height={280}
                label={t('accProjects.dashboard.expectedCash')}
                formatValue={formatMoney}
                currentValue={formatMoney(data.cashForecast.reduce((sum, row) => sum + row.expectedTtcCents, 0))}
                data={data.cashForecast.map((row) => ({
                  ts: formatDate(new Date(`${row.month}-01T00:00:00Z`), {
                    month: 'short',
                    year: '2-digit',
                    timeZone: 'UTC',
                  }),
                  value: row.expectedTtcCents,
                  volume: row.volume,
                }))}
              />
              <details>
                <summary>{t('accProjects.dashboard.monthlyAmounts')}</summary>
                <Table
                  headers={[
                    t('accProjects.cols.month'),
                    t('accProjects.cols.expectedTtc'),
                    t('accProjects.cols.volume'),
                  ]}
                >
                  {data.cashForecast.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td className="amount">{formatMoney(row.expectedTtcCents)}</td>
                      <td>{row.volume}</td>
                    </tr>
                  ))}
                </Table>
              </details>
            </section>
            <section className="accounting-card">
              <h2>{t('accProjects.dashboard.overdue')}</h2>
              {!data.overdueInvoices.length && <p>{t('accProjects.dashboard.noOverdue')}</p>}
              {!!data.overdueInvoices.length && (
                <Table
                  headers={[
                    t('accProjects.cols.invoice'),
                    t('accProjects.cols.project'),
                    t('accProjects.cols.payer'),
                    t('accProjects.cols.remainingDueTtc'),
                    t('accProjects.cols.dueDate'),
                  ]}
                >
                  {data.overdueInvoices.map((invoice) => (
                    <tr key={invoice._id}>
                      <td>
                        <InvoiceLink id={invoice._id} number={invoice.number} projectId={invoice.project._id} />
                      </td>
                      <td>
                        <Link to={projectHref(invoice.project._id)}>{invoice.project.name}</Link>
                      </td>
                      <td>{invoice.payerName}</td>
                      <td className="amount">{formatMoney(invoice.remainingTtcCents)}</td>
                      <td>{dateLabel(invoice.dueAt)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </section>
            <section className="accounting-card">
              <h2>{labelFor(t, 'A_FACTURER')}</h2>
              {!data.toInvoice.length && <p>{t('accProjects.dashboard.nothingToInvoice')}</p>}
              {!!data.toInvoice.length && (
                <Table
                  headers={[
                    t('accProjects.cols.project'),
                    t('accProjects.cols.installmentOrDraft'),
                    t('accProjects.cols.date'),
                    t('accProjects.cols.ttc'),
                  ]}
                >
                  {data.toInvoice.map((row) => (
                    <tr key={`${row.project._id}-${row.installmentId || row.invoiceId}`}>
                      <td>
                        <Link to={projectHref(row.project._id)}>{row.project.name}</Link>
                      </td>
                      <td>
                        {row.label}{' '}
                        {row.kind === 'SUBSCRIPTION_DRAFT' && (
                          <span className="pf-status">· {t('accProjects.dashboard.subscriptionDraft')}</span>
                        )}
                      </td>
                      <td>{dateLabel(row.date)}</td>
                      <td className="amount">{formatMoney(row.ttcCents)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </section>
            <section className="accounting-card">
              <h2>{t('accProjects.dashboard.remainingByBeneficiary')}</h2>
              {!data.beneficiaries.length && <p>{t('accProjects.dashboard.noBeneficiary')}</p>}
              {!!data.beneficiaries.length && (
                <Table
                  headers={[
                    t('accProjects.cols.beneficiary'),
                    t('accProjects.cols.dueHt'),
                    t('accProjects.cols.paidHt'),
                    t('accProjects.cols.remainingHt'),
                  ]}
                >
                  {data.beneficiaries.map((row) => (
                    <tr key={row._id}>
                      <td>
                        <Link to={`/admin/comptabilite/beneficiaires/${row._id}`}>{row.displayName}</Link>
                        {!row.isActive && ` · ${t('accProjects.common.archived')}`}
                      </td>
                      <td className="amount">{formatMoney(row.dueCents)}</td>
                      <td className="amount">{formatMoney(row.paidCents)}</td>
                      <td className="amount">{formatMoney(row.remainingCents)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </section>
            <section className="accounting-card">
              <h2>{t('accProjects.dashboard.projects')}</h2>
              {!data.projects.length && <p>{t('accProjects.dashboard.noProject')}</p>}
              {!!data.projects.length && (
                <Table
                  headers={[
                    t('accProjects.cols.project'),
                    t('accProjects.cols.mode'),
                    t('accProjects.cols.invoicedHt'),
                    t('accProjects.cols.receivedTtc'),
                    t('accProjects.cols.remainingTtc'),
                    t('accProjects.cols.receivedHt'),
                    t('accProjects.cols.costsHt'),
                    t('accProjects.cols.marginHt'),
                  ]}
                >
                  {data.projects.map((row) => (
                    <tr key={row.project._id}>
                      <td>
                        <Link to={projectHref(row.project._id)}>{row.project.name}</Link>
                      </td>
                      <td>{labelFor(t, row.mode)}</td>
                      {[
                        row.invoicedHtCents,
                        row.receivedTtcCents,
                        row.remainingTtcCents,
                        row.receivedHtCents,
                        row.directCostsCents,
                        row.marginCents,
                      ].map((amount, index) => (
                        <td key={index} className="amount">
                          {formatMoney(amount)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Table>
              )}
            </section>
          </>
        )}
      </div>
    </AccountingLayout>
  )
}
