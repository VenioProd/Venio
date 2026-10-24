import { ACCOUNTING, ActionForm, Field, labels, text, write } from './shared'
import type { Beneficiary } from './types'

export default function BeneficiaryForm({
  beneficiary,
  onSaved,
}: {
  beneficiary?: Beneficiary
  onSaved: () => Promise<void>
}) {
  return (
    <ActionForm
      retryable={!!beneficiary}
      label={beneficiary ? 'Enregistrer le bénéficiaire' : 'Créer le bénéficiaire'}
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
        <Field label="Nom">
          <input name="displayName" required defaultValue={beneficiary?.displayName || ''} />
        </Field>
        <Field label="Type">
          <select name="kind" defaultValue={beneficiary?.kind || 'FREELANCE'}>
            {['ASSOCIE', 'COMMERCIAL', 'FREELANCE', 'APPORTEUR'].map((kind) => (
              <option key={kind} value={kind}>
                {labels[kind]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="E-mail">
          <input name="email" type="email" defaultValue={beneficiary?.email || ''} />
        </Field>
        <Field label="SIRET">
          <input name="siret" defaultValue={beneficiary?.siret || ''} />
        </Field>
        <Field label="Identifiant de l’utilisateur interne (facultatif)">
          <input name="user" pattern="[a-fA-F0-9]{24}" defaultValue={beneficiary?.user || ''} />
        </Field>
        <Field label="Compte de charge par défaut">
          <input name="defaultAccountCode" required defaultValue={beneficiary?.defaultAccountCode || '604000'} />
        </Field>
        <Field label="Mode de versement">
          <select name="settlementMode" defaultValue={beneficiary?.settlementMode || 'BANQUE'}>
            <option value="BANQUE">Banque</option>
            <option value="PAIE">Paie</option>
          </select>
        </Field>
        <Field label="Assujetti à la TVA">
          <input name="vatRegistered" type="checkbox" defaultChecked={beneficiary?.vatRegistered || false} />
        </Field>
      </div>
    </ActionForm>
  )
}
