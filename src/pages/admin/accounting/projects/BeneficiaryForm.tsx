import { useI18n } from '../../../../context/I18nContext'
import { ACCOUNTING, ActionForm, Field, labelFor, text, write } from './shared'
import type { Beneficiary } from './types'

export default function BeneficiaryForm({
  beneficiary,
  onSaved,
}: {
  beneficiary?: Beneficiary
  onSaved: () => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <ActionForm
      retryable={!!beneficiary}
      label={beneficiary ? t('accProjects.beneficiaryForm.save') : t('accProjects.beneficiaryForm.create')}
      onSaved={onSaved}
      submit={(data, key) =>
        write(
          `${ACCOUNTING}/beneficiaries${beneficiary ? `/${beneficiary._id}` : ''}`,
          beneficiary ? 'PATCH' : 'POST',
          {
            displayName: text(data, 'displayName'),
            kind: text(data, 'kind'),
            user: text(data, 'user') || null,
            email: text(data, 'email'),
            siret: text(data, 'siret'),
            vatRegistered: data.get('vatRegistered') === 'on',
            defaultAccountCode: text(data, 'defaultAccountCode'),
            settlementMode: text(data, 'settlementMode'),
          },
          key,
        )
      }
    >
      <div className="pf-grid">
        <Field label={t('accProjects.cols.name')}>
          <input name="displayName" required defaultValue={beneficiary?.displayName || ''} />
        </Field>
        <Field label={t('accProjects.cols.type')}>
          <select name="kind" defaultValue={beneficiary?.kind || 'FREELANCE'}>
            {['ASSOCIE', 'COMMERCIAL', 'FREELANCE', 'APPORTEUR'].map((kind) => (
              <option key={kind} value={kind}>
                {labelFor(t, kind)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('accProjects.cols.email')}>
          <input name="email" type="email" defaultValue={beneficiary?.email || ''} />
        </Field>
        <Field label="SIRET">
          <input name="siret" defaultValue={beneficiary?.siret || ''} />
        </Field>
        <Field label={t('accProjects.beneficiaryForm.userId')}>
          <input name="user" pattern="[a-fA-F0-9]{24}" defaultValue={beneficiary?.user || ''} />
        </Field>
        <Field label={t('accProjects.beneficiaryForm.defaultAccount')}>
          <input name="defaultAccountCode" required defaultValue={beneficiary?.defaultAccountCode || '604000'} />
        </Field>
        <Field label={t('accProjects.beneficiaryForm.settlementMode')}>
          <select name="settlementMode" defaultValue={beneficiary?.settlementMode || 'BANQUE'}>
            <option value="BANQUE">{labelFor(t, 'BANQUE')}</option>
            <option value="PAIE">{labelFor(t, 'PAIE')}</option>
          </select>
        </Field>
        <Field label={t('accProjects.beneficiaryForm.vatRegistered')}>
          <input name="vatRegistered" type="checkbox" defaultChecked={beneficiary?.vatRegistered || false} />
        </Field>
      </div>
    </ActionForm>
  )
}
