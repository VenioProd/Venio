import { useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
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
  const { t } = useI18n()
  const [rows, setRows] = useState<RuleDraft[]>(() => ruleDrafts(data.ruleVersion?.rules || []))
  const [creating, setCreating] = useState(false)
  const nameFor = (id: string | null) =>
    id
      ? beneficiaries.find((item) => item._id === id)?.displayName || t('accProjects.shares.beneficiaryUnavailable')
      : t('accProjects.shares.company')
  return (
    <section className="accounting-card">
      <h2>{t('accProjects.shares.title')}</h2>
      <p>
        {t('accProjects.shares.currentVersion', {
          value: data.ruleVersion
            ? t('accProjects.shares.versionSince', {
                version: data.ruleVersion.version,
                date: dateLabel(data.ruleVersion.effectiveFrom),
              })
            : t('accProjects.shares.noVersion'),
        })}
      </p>
      {data.ruleVersion && (
        <Table headers={[t('accProjects.cols.beneficiary'), t('accProjects.cols.share')]}>
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
          {t('accProjects.shares.companyShare', {
            value: formatPercent(10000 - data.ruleVersion.rules.reduce((sum, rule) => sum + rule.bp, 0)),
          })}
        </p>
      )}
      <h3>{t('accProjects.shares.projectShares')}</h3>
      <Table
        headers={[
          t('accProjects.cols.beneficiary'),
          t('accProjects.cols.dueHt'),
          t('accProjects.cols.paidHt'),
          t('accProjects.cols.remainingHt'),
        ]}
      >
        {data.summary.beneficiaries.map((row) => (
          <tr key={row.beneficiary || 'societe'}>
            <td>{nameFor(row.beneficiary)}</td>
            <td className="amount">{formatMoney(row.dueCents)}</td>
            <td className="amount">{formatMoney(row.paidCents)}</td>
            <td className="amount">{formatMoney(row.remainingCents)}</td>
          </tr>
        ))}
      </Table>
      <p className="pf-status">{t('accProjects.shares.unattachedNote')}</p>
      <details>
        <summary>{t('accProjects.shares.history', { count: versions.length })}</summary>
        {versions.map((version) => (
          <div className="pf-record" key={version._id}>
            <h3>
              {t('accProjects.shares.versionN', { version: version.version })} · {dateLabel(version.effectiveFrom)}
            </h3>
            <p>{version.reason || t('accProjects.shares.noReason')}</p>
            <Table headers={[t('accProjects.cols.beneficiary'), t('accProjects.cols.share')]}>
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
            {creating ? t('accProjects.shares.closeForm') : t('accProjects.shares.newVersion')}
          </button>
          {creating && (
            <ActionForm
              retryable={false}
              label={t('accProjects.shares.createVersion')}
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
              <Field label={t('accProjects.shares.prefill')}>
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const template = templates.find((template) => template._id === event.target.value)
                    if (template) setRows(ruleDrafts(template.rules))
                  }}
                >
                  <option value="">{t('accProjects.shares.chooseTemplate')}</option>
                  {templates.map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="pf-grid">
                <Field label={t('accProjects.shares.effectiveDate')}>
                  <input name="effectiveFrom" type="date" required defaultValue={today()} />
                </Field>
                <Field label={t('accProjects.cols.reason')}>
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
