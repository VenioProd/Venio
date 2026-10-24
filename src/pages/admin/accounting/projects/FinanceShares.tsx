import { useState } from 'react'
import { formatMoney, formatPercent } from './money'
import { ACCOUNTING, ActionForm, dateLabel, Field, Table, text, today, write } from './shared'
import RulesEditor, { ruleDrafts, rulesPayload, type RuleDraft } from './RulesEditor'
import type { Beneficiary, FinanceResponse, RuleVersion, ShareTemplate } from './types'

export default function FinanceShares({
  projectId,
  data,
  versions,
  templates,
  beneficiaries,
  canManage,
  onSaved,
}: {
  projectId: string
  data: FinanceResponse
  versions: RuleVersion[]
  templates: ShareTemplate[]
  beneficiaries: Beneficiary[]
  canManage: boolean
  onSaved: () => Promise<void>
}) {
  const [rows, setRows] = useState<RuleDraft[]>(() => ruleDrafts(data.ruleVersion?.rules || []))
  const [creating, setCreating] = useState(false)
  const nameFor = (id: string | null) =>
    id ? beneficiaries.find((item) => item._id === id)?.displayName || 'Bénéficiaire indisponible' : 'Société'
  return (
    <section className="accounting-card">
      <h2>Répartition</h2>
      <p>
        Version en vigueur :{' '}
        {data.ruleVersion
          ? `v${data.ruleVersion.version}, depuis le ${dateLabel(data.ruleVersion.effectiveFrom)}`
          : 'Aucune. La société conserve les encaissements sans règle applicable.'}
      </p>
      {data.ruleVersion && (
        <Table headers={['Bénéficiaire', 'Part']}>
          {data.ruleVersion.rules.map((rule) => (
            <tr key={rule.beneficiary}>
              <td>{nameFor(rule.beneficiary)}</td>
              <td>{formatPercent(rule.bp)}</td>
            </tr>
          ))}
        </Table>
      )}
      {data.ruleVersion && (
        <p>
          Part de la société : {formatPercent(10000 - data.ruleVersion.rules.reduce((sum, rule) => sum + rule.bp, 0))}
        </p>
      )}
      <h3>Parts sur ce projet</h3>
      <Table headers={['Bénéficiaire', 'Dû HT', 'Versé HT', 'Restant HT']}>
        {data.summary.beneficiaries.map((row) => (
          <tr key={row.beneficiary || 'societe'}>
            <td>{nameFor(row.beneficiary)}</td>
            <td className="amount">{formatMoney(row.dueCents)}</td>
            <td className="amount">{formatMoney(row.paidCents)}</td>
            <td className="amount">{formatMoney(row.remainingCents)}</td>
          </tr>
        ))}
      </Table>
      <p className="pf-status">Les versements sans projet sont déduits uniquement du restant global du bénéficiaire.</p>
      <details>
        <summary>Historique des versions ({versions.length})</summary>
        {versions.map((version) => (
          <div className="pf-record" key={version._id}>
            <h3>
              Version {version.version} · {dateLabel(version.effectiveFrom)}
            </h3>
            <p>{version.reason || 'Aucun motif renseigné'}</p>
            <Table headers={['Bénéficiaire', 'Part']}>
              {version.rules.map((rule) => (
                <tr key={rule.beneficiary}>
                  <td>{nameFor(rule.beneficiary)}</td>
                  <td>{formatPercent(rule.bp)}</td>
                </tr>
              ))}
            </Table>
          </div>
        ))}
      </details>
      {canManage && data.finance && (
        <>
          <button
            className="portal-button secondary"
            onClick={() => {
              setRows(ruleDrafts(data.ruleVersion?.rules || []))
              setCreating(!creating)
            }}
          >
            {creating ? 'Fermer le formulaire' : 'Nouvelle version'}
          </button>
          {creating && (
            <ActionForm
              retryable={false}
              label="Créer la version de répartition"
              onSaved={async () => {
                setCreating(false)
                await onSaved()
              }}
              submit={(values, key) =>
                write(
                  `${ACCOUNTING}/projects/${projectId}/share-rules`,
                  'POST',
                  {
                    effectiveFrom: text(values, 'effectiveFrom'),
                    reason: text(values, 'reason'),
                    rules: rulesPayload(rows),
                  },
                  key,
                )
              }
            >
              <Field label="Préremplir depuis un modèle">
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const template = templates.find((template) => template._id === event.target.value)
                    if (template) setRows(ruleDrafts(template.rules))
                  }}
                >
                  <option value="">Choisir un modèle</option>
                  {templates.map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="pf-grid">
                <Field label="Date d’effet">
                  <input name="effectiveFrom" type="date" required defaultValue={today()} />
                </Field>
                <Field label="Motif">
                  <input name="reason" required />
                </Field>
              </div>
              <RulesEditor rows={rows} onChange={setRows} beneficiaries={beneficiaries} />
            </ActionForm>
          )}
        </>
      )}
    </section>
  )
}
