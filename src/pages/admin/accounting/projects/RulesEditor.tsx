import { Field } from './shared'
import { parseMoney, formatPercent } from './money'
import type { Beneficiary, ShareRule } from './types'

export interface RuleDraft {
  beneficiary: string
  percent: string
}
export const ruleDrafts = (rules: ShareRule[]) =>
  rules.map((rule) => ({ beneficiary: rule.beneficiary, percent: String(rule.bp / 100) }))
export function rulesPayload(rows: RuleDraft[]): ShareRule[] {
  const rules = rows.map((row) => ({ beneficiary: row.beneficiary, bp: parseMoney(row.percent, true) }))
  if (rules.some((rule) => !rule.beneficiary) || new Set(rules.map((rule) => rule.beneficiary)).size !== rules.length) {
    throw new Error('Choisissez chaque bénéficiaire une seule fois.')
  }
  if (rules.reduce((sum, rule) => sum + rule.bp, 0) > 10000)
    throw new Error('La somme des parts ne peut pas dépasser 100 %.')
  return rules
}

export default function RulesEditor({
  rows,
  onChange,
  beneficiaries,
}: {
  rows: RuleDraft[]
  onChange: (rows: RuleDraft[]) => void
  beneficiaries: Beneficiary[]
}) {
  let sum: number | null = null
  try {
    sum = rows.reduce((total, row) => total + parseMoney(row.percent, true), 0)
  } catch {
    /* La saisie est encore incomplète. */
  }
  return (
    <div>
      {rows.map((row, index) => (
        <div className="pf-record" key={index}>
          <div className="pf-grid">
            <Field label="Bénéficiaire">
              <select
                required
                value={row.beneficiary}
                onChange={(event) =>
                  onChange(rows.map((item, i) => (i === index ? { ...item, beneficiary: event.target.value } : item)))
                }
              >
                <option value="">Choisir un bénéficiaire</option>
                {beneficiaries
                  .filter((item) => item.isActive || item._id === row.beneficiary)
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.displayName}
                      {!item.isActive && ' (archivé)'}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Part (%)">
              <input
                inputMode="decimal"
                required
                value={row.percent}
                onChange={(event) =>
                  onChange(rows.map((item, i) => (i === index ? { ...item, percent: event.target.value } : item)))
                }
              />
            </Field>
          </div>
          <button
            className="portal-button secondary"
            type="button"
            onClick={() => onChange(rows.filter((_, i) => i !== index))}
          >
            Retirer cette part
          </button>
        </div>
      ))}
      <p aria-live="polite">
        {sum === null
          ? 'Pourcentages à compléter.'
          : `Total des bénéficiaires : ${formatPercent(sum)} · Part de la société : ${formatPercent(10000 - sum)}`}
      </p>
      <button
        className="portal-button secondary"
        type="button"
        onClick={() => onChange([...rows, { beneficiary: '', percent: '' }])}
      >
        Ajouter une part
      </button>
    </div>
  )
}
