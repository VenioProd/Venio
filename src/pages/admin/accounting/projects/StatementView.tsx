import FinanceExports from './FinanceExports'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatMoney, formatPercent } from './money'
import {
  ACCOUNTING,
  ActionForm,
  dateLabel,
  Field,
  labels,
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
  const [reversing, setReversing] = useState<string | null>(null)
  const projectName = (project: { _id: string; name: string } | null) => {
    if (!project) return 'Sans rattachement'
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
        <h2>Détail par projet</h2>
        {statement.projects.length === 0 && <p>Aucun mouvement.</p>}
        {!!statement.projects.length && (
          <Table headers={['Projet', 'Dû HT', 'Versé HT', 'Restant HT']}>
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
        <p>
          Versements sans rattachement : {formatMoney(statement.unattachedPaidCents)} HT. Ils sont déduits du restant
          global.
        </p>
      </section>
      <section className="accounting-card">
        <h2>Parts et régularisations</h2>
        {!statement.allocations.length && <p>Aucune part calculée.</p>}
        {!!statement.allocations.length && (
          <Table headers={['Date', 'Projet', 'Facture', 'Base HT', 'Part', 'Montant HT']}>
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
        <h2>Versements</h2>
        {!statement.settlements.length && <p>Aucun versement.</p>}
        {statement.settlements.map((row) => {
          const reversed = statement.settlements.some((other) => other.reversalOf === row._id)
          return (
            <div className="pf-record" key={row._id}>
              <h3>
                {row.kind === 'REVERSAL' ? 'Annulation' : 'Versement'} · {dateLabel(row.paidAt)}
              </h3>
              <p>
                {formatMoney(row.htCents)} HT + {formatMoney(row.vatCents)} de TVA · {labels[row.mode] || row.mode} ·{' '}
                {projectName(row.project)}
              </p>
              <p>
                Référence : {row.invoiceRef}
                {row.note && ` · ${row.note}`}
                {reversed && ' · Annulé'}
              </p>
              {canManage && onSaved && row.kind === 'SETTLEMENT' && !reversed && (
                <>
                  <button className="portal-button secondary" onClick={() => setReversing(row._id)}>
                    Annuler ce versement
                  </button>
                  {reversing === row._id && (
                    <ActionForm
                      label="Confirmer l’annulation"
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
                      <Field label="Motif de l’annulation">
                        <textarea name="reason" required />
                      </Field>
                      <p>Une contre-passation intégrale sera enregistrée à la date du jour.</p>
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
