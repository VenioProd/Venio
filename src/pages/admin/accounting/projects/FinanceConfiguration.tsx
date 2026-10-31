import { useEffect, useState } from 'react'
import { apiFetch } from '../../../../lib/api'
import { useI18n } from '../../../../context/I18nContext'
import { translate, type MessageKey } from '../../../../i18n'
import { parseMoney } from './money'
import { ACCOUNTING, ActionForm, dateInput, errorText, Field, labelFor, methodOptions, today, write } from './shared'
import SearchSelect from './SearchSelect'
import type { BillingContact, Finance, Installment, Payer } from './types'

interface PayerDraft extends Omit<Payer, 'shareBp'> {
  percent: string
}
interface InstallmentDraft extends Omit<Installment, 'percentBp'> {
  percent: string
}
interface FinanceOptions {
  clients: { _id: string; name: string; email: string; companyName?: string }[]
  subsidiaries: { _id: string; name: string }[]
  phases: { _id: string; title: string; order: number }[]
}
const contactFields: [keyof BillingContact, MessageKey][] = [
  ['name', 'accProjects.config.contactName'],
  ['email', 'accProjects.config.contactEmail'],
  ['addressLine1', 'accProjects.config.contactAddress'],
  ['addressLine2', 'accProjects.config.contactAddress2'],
  ['postalCode', 'accProjects.config.contactPostalCode'],
  ['city', 'accProjects.config.contactCity'],
  ['country', 'accProjects.config.contactCountry'],
  ['siret', 'accProjects.config.contactSiret'],
  ['vatNumber', 'accProjects.config.contactVatNumber'],
]
const newInstallment = (): InstallmentDraft => ({
  label: translate('accProjects.config.defaultInstallmentLabel'),
  percent: '100',
  trigger: { kind: 'DATE', dueDate: today(), phase: null },
})
const newPayer = (clientId?: string): PayerDraft => ({
  kind: clientId ? 'CLIENT' : 'THIRD_PARTY',
  user: clientId || null,
  subsidiary: null,
  percent: '100',
  isPrincipal: true,
  paymentMethod: 'VIREMENT',
  billingContact: {},
})
function percentage(value: string) {
  const bp = parseMoney(value, true)
  if (bp > 10000) throw new Error(translate('accProjects.config.percentTooHigh'))
  return bp
}

export default function FinanceConfiguration({
  projectId,
  finance,
  clientId,
  canManage,
  onSaved,
}: {
  projectId: string
  finance: Finance | null
  clientId?: string
  canManage: boolean
  onSaved: () => Promise<void>
}) {
  const { t } = useI18n()
  const [options, setOptions] = useState<FinanceOptions | null>(null)
  const [optionsError, setOptionsError] = useState('')
  useEffect(() => {
    let cancelled = false
    void apiFetch<FinanceOptions>(`${ACCOUNTING}/projects/${projectId}/finance/options`)
      .then((result) => {
        if (!cancelled) {
          setOptions(result)
          setOptionsError('')
        }
      })
      .catch((error) => {
        if (!cancelled) setOptionsError(errorText(error))
      })
    return () => {
      cancelled = true
    }
  }, [projectId])
  const optionsStatus = optionsError
    ? t('accProjects.config.optionsError', { error: optionsError })
    : !options
      ? t('accProjects.config.optionsLoading')
      : undefined
  const clientOptions =
    options?.clients.map((client) => ({
      value: client._id,
      label: client.name,
      hint: client.companyName || client.email,
    })) || []
  const subsidiaryOptions =
    options?.subsidiaries.map((subsidiary) => ({
      value: subsidiary._id,
      label: subsidiary.name,
    })) || []
  const phaseOptions =
    options?.phases.map((phase) => ({
      value: phase._id,
      label: phase.title,
      hint: t('accProjects.config.phaseRank', { rank: phase.order + 1 }),
    })) || []
  const [mode, setMode] = useState(finance?.mode || 'FORFAIT')
  const [contract, setContract] = useState(
    finance?.contractHtCents == null ? '' : String(finance.contractHtCents / 100),
  )
  const [vat, setVat] = useState(String((finance?.vatRateBp ?? 2000) / 100))
  const [activation, setActivation] = useState(dateInput(finance?.shareActivationDate))
  const [installments, setInstallments] = useState<InstallmentDraft[]>(() =>
    finance?.installments.length
      ? finance.installments.map(({ percentBp, ...item }) => ({
          ...item,
          trigger: { ...item.trigger },
          percent: String(percentBp / 100),
        }))
      : [newInstallment()],
  )
  const [payers, setPayers] = useState<PayerDraft[]>(() =>
    finance?.payers.length
      ? finance.payers.map(({ shareBp, ...payer }) => ({
          ...payer,
          billingContact: { ...payer.billingContact },
          percent: String(shareBp / 100),
        }))
      : [newPayer(clientId)],
  )
  const [subscription, setSubscription] = useState({
    amount: finance?.subscription ? String(finance.subscription.amountHtCents / 100) : '',
    period: finance?.subscription?.period || 'MONTHLY',
    startDate: dateInput(finance?.subscription?.startDate) || today(),
    endDate: dateInput(finance?.subscription?.endDate),
  })
  const updatePayer = (index: number, patch: Partial<PayerDraft>) =>
    setPayers(payers.map((payer, i) => (i === index ? { ...payer, ...patch } : payer)))
  const updateInstallment = (index: number, patch: Partial<InstallmentDraft>) =>
    setInstallments(installments.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const fields = (
    <>
      <div className="pf-grid">
        <Field label={t('accProjects.cols.mode')}>
          <select
            value={mode}
            onChange={(event) => {
              const next = event.target.value
              setMode(next)
              if (next === 'FORFAIT') setInstallments([{ ...(installments[0] || newInstallment()), percent: '100' }])
              if (next === 'ECHEANCIER' && installments.length < 2)
                setInstallments([
                  { ...(installments[0] || newInstallment()), percent: '50' },
                  { ...newInstallment(), percent: '50' },
                ])
            }}
          >
            <option value="FORFAIT">{labelFor(t, 'FORFAIT')}</option>
            <option value="ECHEANCIER">{labelFor(t, 'ECHEANCIER')}</option>
            <option value="ABONNEMENT">{labelFor(t, 'ABONNEMENT')}</option>
          </select>
        </Field>
        {mode !== 'ABONNEMENT' && (
          <Field label={t('accProjects.config.contractTotal')}>
            <input
              required
              inputMode="decimal"
              value={contract}
              onChange={(event) => setContract(event.target.value)}
            />
          </Field>
        )}
        <Field label={t('accProjects.config.vatPercent')}>
          <input required inputMode="decimal" value={vat} onChange={(event) => setVat(event.target.value)} />
        </Field>
        <Field label={t('accProjects.config.shareActivation')}>
          <input type="date" value={activation} onChange={(event) => setActivation(event.target.value)} />
        </Field>
      </div>
      {mode !== 'ABONNEMENT' && (
        <div>
          <h3>{t('accProjects.config.installments')}</h3>
          {installments.map((item, index) => (
            <div className="pf-record" key={item._id || `new-${index}`}>
              <div className="pf-grid">
                <Field label={t('accProjects.cols.label')}>
                  <input
                    required
                    value={item.label}
                    onChange={(event) => updateInstallment(index, { label: event.target.value })}
                  />
                </Field>
                <Field label={t('accProjects.config.contractShare')}>
                  <input
                    required
                    inputMode="decimal"
                    value={item.percent}
                    onChange={(event) => updateInstallment(index, { percent: event.target.value })}
                    readOnly={mode === 'FORFAIT'}
                  />
                </Field>
                <Field label={t('accProjects.config.trigger')}>
                  <select
                    value={item.trigger.kind}
                    onChange={(event) =>
                      updateInstallment(index, { trigger: { kind: event.target.value, dueDate: null, phase: null } })
                    }
                  >
                    <option value="DATE">{t('accProjects.cols.date')}</option>
                    <option value="MILESTONE">{t('accProjects.config.triggerMilestone')}</option>
                  </select>
                </Field>
                {item.trigger.kind === 'DATE' && (
                  <Field label={t('accProjects.config.triggerDate')}>
                    <input
                      type="date"
                      required
                      value={dateInput(item.trigger.dueDate)}
                      onChange={(event) =>
                        updateInstallment(index, { trigger: { ...item.trigger, dueDate: event.target.value } })
                      }
                    />
                  </Field>
                )}
                {item.trigger.kind === 'MILESTONE' && (
                  <SearchSelect
                    label={t('accProjects.config.projectMilestone')}
                    required
                    disabled={!canManage}
                    status={optionsStatus}
                    options={phaseOptions}
                    value={item.trigger.phase || ''}
                    onChange={(phase) => updateInstallment(index, { trigger: { ...item.trigger, phase } })}
                  />
                )}
              </div>
              {canManage && mode === 'ECHEANCIER' && (
                <button
                  type="button"
                  className="portal-button secondary"
                  onClick={() => setInstallments(installments.filter((_, i) => i !== index))}
                >
                  {t('accProjects.config.removeInstallment')}
                </button>
              )}
            </div>
          ))}
          {canManage && mode === 'ECHEANCIER' && (
            <button
              type="button"
              className="portal-button secondary"
              onClick={() => setInstallments([...installments, { ...newInstallment(), label: '', percent: '' }])}
            >
              {t('accProjects.config.addInstallment')}
            </button>
          )}
        </div>
      )}
      {mode === 'ABONNEMENT' && (
        <div>
          <h3>{labelFor(t, 'ABONNEMENT')}</h3>
          <div className="pf-grid">
            <Field label={t('accProjects.config.amountPerPeriod')}>
              <input
                required
                inputMode="decimal"
                value={subscription.amount}
                onChange={(event) => setSubscription({ ...subscription, amount: event.target.value })}
              />
            </Field>
            <Field label={t('accProjects.config.periodicity')}>
              <select
                value={subscription.period}
                onChange={(event) => setSubscription({ ...subscription, period: event.target.value })}
              >
                {['MONTHLY', 'QUARTERLY', 'YEARLY'].map((period) => (
                  <option key={period} value={period}>
                    {labelFor(t, period)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('accProjects.config.startDate')}>
              <input
                type="date"
                required
                value={subscription.startDate}
                onChange={(event) => setSubscription({ ...subscription, startDate: event.target.value })}
              />
            </Field>
            <Field label={t('accProjects.config.endDate')}>
              <input
                type="date"
                value={subscription.endDate}
                onChange={(event) => setSubscription({ ...subscription, endDate: event.target.value })}
              />
            </Field>
          </div>
        </div>
      )}
      <div>
        <h3>{t('accProjects.config.payers')}</h3>
        {payers.map((payer, index) => (
          <div className="pf-record" key={payer._id || `new-${index}`}>
            <h4>{t('accProjects.config.payerN', { n: index + 1 })}</h4>
            <div className="pf-grid">
              <Field label={t('accProjects.cols.type')}>
                <select
                  value={payer.kind}
                  onChange={(event) => updatePayer(index, { kind: event.target.value, user: null, subsidiary: null })}
                >
                  <option value="CLIENT">{t('accProjects.config.payerClient')}</option>
                  <option value="THIRD_PARTY">{t('accProjects.config.payerThirdParty')}</option>
                  <option value="SUBSIDIARY">{t('accProjects.config.payerSubsidiary')}</option>
                </select>
              </Field>
              {payer.kind === 'CLIENT' && (
                <SearchSelect
                  label={t('accProjects.config.payerClientSelect')}
                  required
                  disabled={!canManage}
                  status={optionsStatus}
                  options={clientOptions}
                  value={payer.user || ''}
                  onChange={(user) => updatePayer(index, { user })}
                />
              )}
              {payer.kind === 'SUBSIDIARY' && (
                <SearchSelect
                  label={t('accProjects.config.payerSubsidiarySelect')}
                  required
                  disabled={!canManage}
                  status={optionsStatus}
                  options={subsidiaryOptions}
                  value={payer.subsidiary || ''}
                  onChange={(subsidiary) => updatePayer(index, { subsidiary })}
                />
              )}
              <Field label={t('accProjects.config.payerShare')}>
                <input
                  required
                  inputMode="decimal"
                  value={payer.percent}
                  onChange={(event) => updatePayer(index, { percent: event.target.value })}
                />
              </Field>
              <Field label={t('accProjects.config.payerPrincipal')}>
                <input
                  type="radio"
                  name="principal"
                  checked={payer.isPrincipal}
                  onChange={() => setPayers(payers.map((item, i) => ({ ...item, isPrincipal: i === index })))}
                />
              </Field>
              <Field label={t('accProjects.config.paymentMethod')}>
                <select
                  value={payer.paymentMethod}
                  onChange={(event) => updatePayer(index, { paymentMethod: event.target.value })}
                >
                  {methodOptions.map((method) => (
                    <option key={method} value={method}>
                      {labelFor(t, method)}
                    </option>
                  ))}
                </select>
              </Field>
              {contactFields.map(([field, label]) => (
                <Field label={t(label)} key={field}>
                  <input
                    type={field === 'email' ? 'email' : 'text'}
                    required={payer.kind === 'THIRD_PARTY' && field === 'name'}
                    value={payer.billingContact?.[field] || ''}
                    onChange={(event) =>
                      updatePayer(index, { billingContact: { ...payer.billingContact, [field]: event.target.value } })
                    }
                  />
                </Field>
              ))}
            </div>
            {canManage && (
              <button
                className="portal-button secondary"
                type="button"
                onClick={() => setPayers(payers.filter((_, i) => i !== index))}
              >
                {t('accProjects.config.removePayer')}
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <button
            className="portal-button secondary"
            type="button"
            onClick={() => setPayers([...payers, { ...newPayer(), isPrincipal: false, percent: '' }])}
          >
            {t('accProjects.config.addPayer')}
          </button>
        )}
      </div>
    </>
  )
  return (
    <section className="accounting-card">
      <h2>{t('accProjects.config.title')}</h2>
      <p className="pf-status">{t('accProjects.config.intro')}</p>
      {!canManage && (
        <fieldset disabled className="pf-readonly">
          {fields}
        </fieldset>
      )}
      {canManage && (
        <ActionForm
          label={t('accProjects.config.save')}
          onSaved={onSaved}
          submit={(_, key) => {
            const parsedPayers = payers.map(({ percent, ...payer }) => ({ ...payer, shareBp: percentage(percent) }))
            if (parsedPayers.reduce((sum, payer) => sum + payer.shareBp, 0) !== 10000)
              throw new Error(t('accProjects.config.payerSharesTotal'))
            if (parsedPayers.filter((payer) => payer.isPrincipal).length !== 1)
              throw new Error(t('accProjects.config.onePrincipal'))
            let parsedInstallments: Installment[] = []
            if (mode !== 'ABONNEMENT') {
              parsedInstallments = installments.map(({ percent, ...item }) => ({
                ...item,
                percentBp: percentage(percent),
              }))
              if (parsedInstallments.reduce((sum, item) => sum + item.percentBp, 0) !== 10000)
                throw new Error(t('accProjects.config.installmentsTotal'))
              if (mode === 'ECHEANCIER' && parsedInstallments.length < 2)
                throw new Error(t('accProjects.config.scheduleMinTwo'))
            }
            return write(
              `${ACCOUNTING}/projects/${projectId}/finance`,
              'PUT',
              {
                mode,
                contractHtCents: mode === 'ABONNEMENT' ? null : parseMoney(contract),
                vatRateBp: percentage(vat),
                shareActivationDate: activation || null,
                payers: parsedPayers,
                installments: parsedInstallments,
                subscription:
                  mode === 'ABONNEMENT'
                    ? {
                        amountHtCents: parseMoney(subscription.amount),
                        period: subscription.period,
                        startDate: subscription.startDate,
                        endDate: subscription.endDate || null,
                      }
                    : null,
              },
              key,
            )
          }}
        >
          {fields}
        </ActionForm>
      )}
    </section>
  )
}
