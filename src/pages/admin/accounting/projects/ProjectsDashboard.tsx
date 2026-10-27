import FinanceExports from './FinanceExports'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../../../lib/api'
import AccountingLayout from '../AccountingLayout'
import FinancialChart from '../../../../components/dashboard/FinancialChart'
import '../../../../components/dashboard/dashboard.css'
import { formatMoney } from './money'
import { ACCOUNTING, dateLabel, errorText, InvoiceLink, labels, Metrics, projectHref, Table } from './shared'
import type { Dashboard } from './types'

export default function ProjectsDashboard() {
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
    <AccountingLayout title="Comptabilité des projets" subtitle="Facturation, trésorerie et répartition par projet.">
      <div className="pf-workspace">
        {error && (
          <p className="admin-error" role="alert">
            {error}{' '}
            <button className="portal-button secondary" onClick={load}>
              Actualiser
            </button>
          </p>
        )}
        {!data && !error && <p role="status">Chargement de la comptabilité…</p>}
        {data && (
          <>
            <FinanceExports />
            <Metrics summary={data.totals} />
            <section className="accounting-card pf-chart">
              <h2>Prévisionnel de trésorerie · 12 mois</h2>
              <p className="pf-status">
                TTC attendu ; les retards sont reportés au mois courant. Les volumes indiquent le nombre d’éléments
                attendus.
              </p>
              <FinancialChart
                timeline
                height={280}
                label="Trésorerie attendue"
                formatValue={formatMoney}
                currentValue={formatMoney(data.cashForecast.reduce((sum, row) => sum + row.expectedTtcCents, 0))}
                data={data.cashForecast.map((row) => ({
                  ts: new Date(`${row.month}-01T00:00:00Z`).toLocaleDateString('fr-FR', {
                    month: 'short',
                    year: '2-digit',
                    timeZone: 'UTC',
                  }),
                  value: row.expectedTtcCents,
                  volume: row.volume,
                }))}
              />
              <details>
                <summary>Voir les montants mensuels</summary>
                <Table headers={['Mois', 'TTC attendu', 'Volume']}>
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
              <h2>Factures en retard</h2>
              {!data.overdueInvoices.length && <p>Aucune facture en retard.</p>}
              {!!data.overdueInvoices.length && (
                <Table headers={['Facture', 'Projet', 'Payeur', 'Reste dû TTC', 'Échéance']}>
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
              <h2>À facturer</h2>
              {!data.toInvoice.length && <p>Aucune échéance due ni brouillon d’abonnement.</p>}
              {!!data.toInvoice.length && (
                <Table headers={['Projet', 'Échéance ou brouillon', 'Date', 'TTC']}>
                  {data.toInvoice.map((row) => (
                    <tr key={`${row.project._id}-${row.installmentId || row.invoiceId}`}>
                      <td>
                        <Link to={projectHref(row.project._id)}>{row.project.name}</Link>
                      </td>
                      <td>
                        {row.label}{' '}
                        {row.kind === 'SUBSCRIPTION_DRAFT' && (
                          <span className="pf-status">· Brouillon d’abonnement</span>
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
              <h2>Restant dû par bénéficiaire</h2>
              {!data.beneficiaries.length && <p>Aucun bénéficiaire.</p>}
              {!!data.beneficiaries.length && (
                <Table headers={['Bénéficiaire', 'Dû HT', 'Versé HT', 'Restant HT']}>
                  {data.beneficiaries.map((row) => (
                    <tr key={row._id}>
                      <td>
                        <Link to={`/admin/comptabilite/beneficiaires/${row._id}`}>{row.displayName}</Link>
                        {!row.isActive && ' · Archivé'}
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
              <h2>Projets</h2>
              {!data.projects.length && (
                <p>Aucun projet configuré. Ouvrez l’onglet Comptabilité d’un projet pour le configurer.</p>
              )}
              {!!data.projects.length && (
                <Table
                  headers={[
                    'Projet',
                    'Mode',
                    'Facturé HT',
                    'Encaissé TTC',
                    'Reste TTC',
                    'HT encaissé',
                    'Coûts HT',
                    'Marge HT',
                  ]}
                >
                  {data.projects.map((row) => (
                    <tr key={row.project._id}>
                      <td>
                        <Link to={projectHref(row.project._id)}>{row.project.name}</Link>
                      </td>
                      <td>{labels[row.mode]}</td>
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
