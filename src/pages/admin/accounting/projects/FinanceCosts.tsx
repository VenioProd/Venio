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
  return (
    <section className="accounting-card">
      <h2>Coûts directs</h2>
      {!lines.length && <p>Aucun coût direct.</p>}
      {!!lines.length && (
        <Table headers={['Date', 'Compte', 'Libellé', 'Fournisseur', 'Coût HT', 'TVA']}>
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
          <summary>Ajouter un coût direct</summary>
          <ActionForm
            label="Enregistrer le coût"
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
              <Field label="Compte de classe 6">
                <input name="accountCode" pattern="6[0-9]*" required />
              </Field>
              <Field label="Libellé">
                <input name="label" required />
              </Field>
              <Field label="Fournisseur">
                <input name="supplier" required />
              </Field>
              <Field label="Montant HT (€)">
                <input name="ht" inputMode="decimal" required />
              </Field>
              <Field label="Montant de TVA (€)">
                <input name="vat" inputMode="decimal" defaultValue="0" required />
              </Field>
              <Field label="Date">
                <input name="date" type="date" defaultValue={today()} required />
              </Field>
            </div>
          </ActionForm>
        </details>
      )}
    </section>
  )
}
