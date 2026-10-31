import FinanceExports from './FinanceExports'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../../../context/I18nContext'
import { formatMoney, formatPercent } from './money'
import {
  ACCOUNTING,
  ActionForm,
  dateLabel,
  Field,
  labelFor,
  projectHref,
  ShareMetrics,
  Table,
  text,
  write,
} from './shared'
import type { Statement } from './types'

export default function StatementView({
  statement,
  canManage = false,
  personal = false,
  onSaved,
}: {
  statement: Statement
  canManage?: boolean
  personal?: boolean
  onSaved?: () => Promise<void>
}) {
  const { t } = useI18n()
  const [reversing, setReversing] = useState<string | null>(null)
  const projectName = (project: { _id: string; name: string } | null) => {
    if (!project) return t('accProjects.statement.unattached')
    if (personal) return project.name
    return <Link to={projectHref(project._id)}>{project.name}</Link>
  }
  return (
    <>
      <FinanceExports
        statementPath={personal ? 'me/statement.pdf' : `beneficiaries/${statement.beneficiary._id}/statement.pdf`}
      />
      <ShareMetrics totals={statement} />
      <section className="accounting-card">
        <h2>{t('accProjects.statement.byProject')}</h2>
        {statement.projects.length === 0 && <p>{t('accProjects.statement.noMovement')}</p>}
        {!!statement.projects.length && (
          <Table
            headers={[
              t('accProjects.cols.project'),
              t('accProjects.cols.dueHt'),
              t('accProjects.cols.paidHt'),
              t('accProjects.cols.remainingHt'),
            ]}
          >
            {statement.projects.map((row) => (
              <tr key={row.project._id}>
                <td>{projectName(row.project)}</td>
                <td className="amount">{formatMoney(row.dueCents)}</td>
                <td className="amount">{formatMoney(row.paidCents)}</td>
                <td className="amount">{formatMoney(row.remainingCents)}</td>
              </tr>
            ))}
          </Table>
        )}
        <p>{t('accProjects.statement.unattachedPaid', { amount: formatMoney(statement.unattachedPaidCents) })}</p>
      </section>
      <section className="accounting-card">
        <h2>{t('accProjects.statement.allocations')}</h2>
        {!statement.allocations.length && <p>{t('accProjects.statement.noAllocation')}</p>}
        {!!statement.allocations.length && (
          <Table
            headers={[
              t('accProjects.cols.date'),
              t('accProjects.cols.project'),
              t('accProjects.cols.invoice'),
              t('accProjects.cols.baseHt'),
              t('accProjects.cols.share'),
              t('accProjects.cols.amountHt'),
            ]}
          >
            {statement.allocations.map((row) => (
              <tr key={row._id}>
                <td>{dateLabel(row.receivedAt)}</td>
                <td>{projectName(row.project)}</td>
                <td>{row.invoiceNumber}</td>
                <td className="amount">{formatMoney(row.paymentHtCents)}</td>
                <td>{formatPercent(row.bp)}</td>
                <td className="amount">{formatMoney(row.amountCents)}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
      <section className="accounting-card">
        <h2>{t('accProjects.statement.settlements')}</h2>
        {!statement.settlements.length && <p>{t('accProjects.statement.noSettlement')}</p>}
        {statement.settlements.map((row) => {
          const reversed = statement.settlements.some((other) => other.reversalOf === row._id)
          return (
            <div className="pf-record" key={row._id}>
              <h3>
                {row.kind === 'REVERSAL' ? t('accProjects.statement.reversal') : t('accProjects.statement.settlement')}{' '}
                · {dateLabel(row.paidAt)}
              </h3>
              <p>
                {t('accProjects.statement.settlementAmounts', {
                  ht: formatMoney(row.htCents),
                  vat: formatMoney(row.vatCents),
                })}{' '}
                · {labelFor(t, row.mode)} · {projectName(row.project)}
              </p>
              <p>
                {t('accProjects.statement.reference')} {row.invoiceRef}
                {row.note && ` · ${row.note}`}
                {reversed && ` · ${t('accProjects.statement.reversed')}`}
              </p>
              {canManage && onSaved && row.kind === 'SETTLEMENT' && !reversed && (
                <>
                  <button className="portal-button secondary" onClick={() => setReversing(row._id)}>
                    {t('accProjects.statement.cancelSettlement')}
                  </button>
                  {reversing === row._id && (
                    <ActionForm
                      label={t('accProjects.statement.confirmCancel')}
                      submit={(data, key) =>
                        write(
                          `${ACCOUNTING}/settlements/${row._id}/reversal`,
                          'POST',
                          { reason: text(data, 'reason') },
                          key,
                        )
                      }
                      onSaved={async () => {
                        setReversing(null)
                        await onSaved()
                      }}
                    >
                      <Field label={t('accProjects.statement.cancelReason')}>
                        <textarea name="reason" required />
                      </Field>
                      <p>{t('accProjects.statement.reversalNote')}</p>
                    </ActionForm>
                  )}
                </>
              )}
            </div>
          )
        })}
      </section>
    </>
  )
}
