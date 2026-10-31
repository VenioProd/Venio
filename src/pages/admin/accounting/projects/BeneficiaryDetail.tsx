import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../../../context/AuthContext'
import { useI18n } from '../../../../context/I18nContext'
import { translate } from '../../../../i18n'
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions'
import { apiFetch } from '../../../../lib/api'
import AccountingLayout from '../AccountingLayout'
import BeneficiaryForm from './BeneficiaryForm'
import StatementView from './StatementView'
import { formatMoney, parseMoney } from './money'
import { ACCOUNTING, ActionForm, errorText, Field, labelFor, text, today, write } from './shared'
import type { Beneficiary, Statement } from './types'

function SettlementForm({
  statement,
  beneficiary,
  onSaved,
}: {
  statement: Statement
  beneficiary: Beneficiary
  onSaved: () => Promise<void>
}) {
  const { t } = useI18n()
  const [projectId, setProjectId] = useState('')
  let remaining = statement.remainingCents
  if (projectId)
    remaining = Math.min(
      remaining,
      statement.projects.find((row) => row.project._id === projectId)?.remainingCents ?? 0,
    )
  return (
    <ActionForm
      label={t('accProjects.settlement.save')}
      onSaved={onSaved}
      submit={async (data, key) => {
        const htCents = parseMoney(text(data, 'ht'))
        let maximum = statement.remainingCents
        if (projectId)
          maximum = Math.min(
            maximum,
            statement.projects.find((row) => row.project._id === projectId)?.remainingCents ?? 0,
          )
        if (htCents > maximum)
          throw new Error(t('accProjects.settlement.overRemaining', { amount: formatMoney(maximum) }))
        return write(
          `${ACCOUNTING}/beneficiaries/${beneficiary._id}/settlements`,
          'POST',
          {
            projectId: projectId || null,
            htCents,
            vatCents: parseMoney(text(data, 'vat'), true),
            paidAt: text(data, 'paidAt'),
            invoiceRef: text(data, 'invoiceRef'),
            note: text(data, 'note'),
          },
          key,
        )
      }}
    >
      <p aria-live="polite">
        {t('accProjects.settlement.available')}{' '}
        <strong>{t('accProjects.common.ht', { amount: formatMoney(remaining) })}</strong>{' '}
        {t('accProjects.settlement.modeLine', {
          mode: beneficiary.settlementMode === 'PAIE' ? t('accProjects.settlement.modePayroll') : labelFor(t, 'BANQUE'),
        })}
      </p>
      {remaining <= 0 && <p>{t('accProjects.settlement.none')}</p>}
      <div className="pf-grid">
        <Field label={t('accProjects.settlement.projectOptional')}>
          <select name="projectId" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">{t('accProjects.statement.unattached')}</option>
            {statement.projects.map((row) => (
              <option key={row.project._id} value={row.project._id}>
                {t('accProjects.settlement.projectOption', {
                  name: row.project.name,
                  amount: formatMoney(row.remainingCents),
                })}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('accProjects.common.amountHtEur')}>
          <input name="ht" inputMode="decimal" required />
        </Field>
        <Field label={t('accProjects.common.vatAmountEur')}>
          <input name="vat" inputMode="decimal" required defaultValue="0" readOnly={!beneficiary.vatRegistered} />
        </Field>
        <Field label={t('accProjects.settlement.date')}>
          <input name="paidAt" type="date" required max={today()} defaultValue={today()} />
        </Field>
        <Field label={t('accProjects.settlement.invoiceRef')}>
          <input name="invoiceRef" required />
        </Field>
        <Field label={t('accProjects.settlement.note')}>
          <input name="note" />
        </Field>
      </div>
    </ActionForm>
  )
}

export default function BeneficiaryDetail() {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)
  const [data, setData] = useState<{ beneficiary: Beneficiary; statement: Statement } | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [settling, setSettling] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const load = useCallback(
    () =>
      Promise.all([
        apiFetch<{ beneficiaries: Beneficiary[] }>(`${ACCOUNTING}/beneficiaries`),
        apiFetch<Statement>(`${ACCOUNTING}/beneficiaries/${id}/statement`),
      ]).then(([list, statement]) => {
        const beneficiary = list.beneficiaries.find((item) => item._id === id)
        if (!beneficiary) throw new Error(translate('accProjects.detail.notFound'))
        setData({ beneficiary, statement })
        setError('')
      }),
    [id],
  )
  useEffect(() => {
    void load().catch((error) => setError(errorText(error)))
  }, [load])
  const saved = async () => {
    setEditing(false)
    setSettling(false)
    setArchiving(false)
    await load()
  }
  return (
    <AccountingLayout
      title={data?.beneficiary.displayName || t('accProjects.cols.beneficiary')}
      subtitle={<Link to="/admin/comptabilite/beneficiaires">{t('accProjects.detail.allBeneficiaries')}</Link>}
    >
      <div className="pf-workspace">
        {error && (
          <p className="admin-error" role="alert">
            {error}{' '}
            <button onClick={() => void load().catch((error) => setError(errorText(error)))}>
              {t('accProjects.common.refresh')}
            </button>
          </p>
        )}
        {!data && !error && <p role="status">{t('accProjects.statement.loading')}</p>}
        {data && (
          <>
            <section className="accounting-card">
              <h2>{t('accProjects.detail.contactTitle')}</h2>
              <p>
                {labelFor(t, data.beneficiary.kind)} · {data.beneficiary.email || t('accProjects.detail.noEmail')} ·{' '}
                {t('accProjects.detail.siret')} {data.beneficiary.siret || t('accProjects.detail.notProvided')}
              </p>
              <p>
                {data.beneficiary.vatRegistered
                  ? t('accProjects.beneficiaryForm.vatRegistered')
                  : t('accProjects.detail.notVatRegistered')}{' '}
                · {t('accProjects.detail.account', { code: data.beneficiary.defaultAccountCode })} ·{' '}
                {t('accProjects.detail.mode', { mode: labelFor(t, data.beneficiary.settlementMode) })}
              </p>
            </section>
            {!data.beneficiary.isActive && <p>{t('accProjects.detail.archivedNote')}</p>}
            {canManage && (
              <div className="pf-actions">
                <button className="portal-button secondary" onClick={() => setEditing(!editing)}>
                  {t('accProjects.common.edit')}
                </button>
                <button className="portal-button" onClick={() => setSettling(!settling)}>
                  {t('accProjects.detail.pay')}
                </button>
                {data.beneficiary.isActive && (
                  <button className="portal-button secondary" onClick={() => setArchiving(!archiving)}>
                    {t('accProjects.common.archive')}
                  </button>
                )}
              </div>
            )}
            {canManage && archiving && (
              <section className="accounting-card">
                <h2>{t('accProjects.detail.archiveTitle')}</h2>
                <p>{t('accProjects.detail.archiveNote')}</p>
                <ActionForm
                  label={t('accProjects.detail.confirmArchive')}
                  submit={(_, key) => write(`${ACCOUNTING}/beneficiaries/${id}/archive`, 'POST', {}, key)}
                  onSaved={saved}
                />
              </section>
            )}
            {canManage && editing && (
              <section className="accounting-card">
                <h2>{t('accProjects.detail.editTitle')}</h2>
                <BeneficiaryForm key={data.beneficiary._id} beneficiary={data.beneficiary} onSaved={saved} />
              </section>
            )}
            {canManage && settling && (
              <section className="accounting-card">
                <h2>{t('accProjects.detail.payTitle')}</h2>
                <SettlementForm statement={data.statement} beneficiary={data.beneficiary} onSaved={saved} />
              </section>
            )}
            <StatementView statement={data.statement} canManage={canManage} onSaved={load} />
          </>
        )}
      </div>
    </AccountingLayout>
  )
}
