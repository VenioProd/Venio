import { useI18n } from '../../../../context/I18nContext'
import { formatMoney, parseMoney } from './money'
import { ACCOUNTING, ActionForm, dateLabel, Field, Table, text, today, write } from './shared'
import type { CostLine, ProjectCost } from './types'

export default function FinanceCosts({
  projectId,
  lines,
  costDetails,
  canManage,
  onSaved,
}: {
  projectId: string
  lines: CostLine[]
  costDetails: ProjectCost[]
  canManage: boolean
  onSaved: () => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <section className="accounting-card">
      <h2>{t('accProjects.costs.title')}</h2>
      {!lines.length && <p>{t('accProjects.costs.empty')}</p>}
      {!!lines.length && (
        <Table
          headers={[
            t('accProjects.cols.date'),
            t('accProjects.cols.account'),
            t('accProjects.cols.label'),
            t('accProjects.cols.supplier'),
            t('accProjects.cols.costHt'),
            t('accProjects.cols.vat'),
          ]}
        >
          {lines.map((line) => {
            const detail = costDetails.find((cost) => cost.entry === line.entry._id)
            return (
              <tr key={line._id}>
                <td>{dateLabel(line.entry.date)}</td>
                <td className="code">{line.accountCode}</td>
                <td>{line.label || line.entry.label}</td>
                <td>{detail?.supplier || '—'}</td>
                <td className="amount">{formatMoney(Math.round((line.debit - line.credit) * 100))}</td>
                <td className="amount">{detail ? formatMoney(detail.vatCents) : '—'}</td>
              </tr>
            )
          })}
        </Table>
      )}
      {canManage && (
        <details>
          <summary>{t('accProjects.costs.add')}</summary>
          <ActionForm
            label={t('accProjects.costs.save')}
            onSaved={onSaved}
            submit={(data, key) =>
              write(
                `${ACCOUNTING}/projects/${projectId}/costs`,
                'POST',
                {
                  accountCode: text(data, 'accountCode'),
                  label: text(data, 'label'),
                  supplier: text(data, 'supplier'),
                  htCents: parseMoney(text(data, 'ht')),
                  vatCents: parseMoney(text(data, 'vat'), true),
                  date: text(data, 'date'),
                },
                key,
              )
            }
          >
            <div className="pf-grid">
              <Field label={t('accProjects.costs.class6Account')}>
                <input name="accountCode" pattern="6[0-9]*" required />
              </Field>
              <Field label={t('accProjects.cols.label')}>
                <input name="label" required />
              </Field>
              <Field label={t('accProjects.cols.supplier')}>
                <input name="supplier" required />
              </Field>
              <Field label={t('accProjects.common.amountHtEur')}>
                <input name="ht" inputMode="decimal" required />
              </Field>
              <Field label={t('accProjects.common.vatAmountEur')}>
                <input name="vat" inputMode="decimal" defaultValue="0" required />
              </Field>
              <Field label={t('accProjects.cols.date')}>
                <input name="date" type="date" defaultValue={today()} required />
              </Field>
            </div>
          </ActionForm>
        </details>
      )}
    </section>
  )
}
