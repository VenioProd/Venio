import { formatPercent } from './money'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions'
import { apiFetch } from '../../../../lib/api'
import AccountingLayout from '../AccountingLayout'
import RulesEditor, { ruleDrafts, rulesPayload, type RuleDraft } from './RulesEditor'
import { ACCOUNTING, ActionForm, errorText, Field, Table, text, write } from './shared'
import type { Beneficiary, ShareTemplate } from './types'

function TemplateForm({
  template,
  beneficiaries,
  onSaved,
}: {
  template?: ShareTemplate
  beneficiaries: Beneficiary[]
  onSaved: () => Promise<void>
}) {
  const [rows, setRows] = useState<RuleDraft[]>(() => ruleDrafts(template?.rules || []))
  return (
    <ActionForm
      retryable={!!template}
      label={template ? 'Enregistrer le modèle' : 'Créer le modèle'}
      onSaved={onSaved}
      submit={(data, key) =>
        write(
          `${ACCOUNTING}/share-templates${template ? `/${template._id}` : ''}`,
          template ? 'PATCH' : 'POST',
          { name: text(data, 'name'), rules: rulesPayload(rows) },
          key,
        )
      }
    >
      <Field label="Nom du modèle">
        <input name="name" required defaultValue={template?.name || ''} />
      </Field>
      <RulesEditor rows={rows} onChange={setRows} beneficiaries={beneficiaries} />
    </ActionForm>
  )
}

export default function ShareTemplatesPage() {
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)
  const [data, setData] = useState<{ templates: ShareTemplate[]; beneficiaries: Beneficiary[] } | null>(null)
  const [editing, setEditing] = useState<ShareTemplate | 'new' | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const load = useCallback(
    () =>
      Promise.all([
        apiFetch<{ templates: ShareTemplate[] }>(`${ACCOUNTING}/share-templates`),
        apiFetch<{ beneficiaries: Beneficiary[] }>(`${ACCOUNTING}/beneficiaries`),
      ]).then(([templates, beneficiaries]) => {
        setData({ ...templates, ...beneficiaries })
        setError('')
      }),
    [],
  )
  useEffect(() => {
    void load().catch((error) => setError(errorText(error)))
  }, [load])
  const saved = async () => {
    setEditing(null)
    setDeleting(null)
    await load()
  }
  return (
    <AccountingLayout title="Modèles de répartition">
      <div className="pf-workspace">
        {error && (
          <p role="alert" className="admin-error">
            {error} <button onClick={() => void load().catch((error) => setError(errorText(error)))}>Actualiser</button>
          </p>
        )}
        {!data && !error && <p role="status">Chargement des modèles…</p>}
        {data && (
          <>
            {canManage && (
              <button className="portal-button" onClick={() => setEditing('new')}>
                Nouveau modèle
              </button>
            )}
            <section className="accounting-card">
              <h2>Modèles</h2>
              {!data.templates.length && <p>Aucun modèle de répartition.</p>}
              {data.templates.map((template) => (
                <div className="pf-record" key={template._id}>
                  <h3>{template.name}</h3>
                  <Table headers={['Bénéficiaire', 'Part']}>
                    {template.rules.map((rule) => (
                      <tr key={rule.beneficiary}>
                        <td>
                          {data.beneficiaries.find((item) => item._id === rule.beneficiary)?.displayName ||
                            'Bénéficiaire indisponible'}
                        </td>
                        <td>{formatPercent(rule.bp)}</td>
                      </tr>
                    ))}
                  </Table>
                  <p>
                    Part de la société : {formatPercent(10000 - template.rules.reduce((sum, rule) => sum + rule.bp, 0))}
                  </p>
                  {canManage && (
                    <div className="pf-actions">
                      <button className="portal-button secondary" onClick={() => setEditing(template)}>
                        Modifier
                      </button>
                      <button className="portal-button secondary" onClick={() => setDeleting(template._id)}>
                        Supprimer
                      </button>
                    </div>
                  )}
                  {canManage && deleting === template._id && (
                    <div>
                      <p>Supprimer le modèle « {template.name} » ? Les versions de projet restent conservées.</p>
                      <ActionForm
                        label="Confirmer la suppression"
                        submit={(_, key) => write(`${ACCOUNTING}/share-templates/${template._id}`, 'DELETE', {}, key)}
                        onSaved={saved}
                      />
                      <button className="portal-button secondary" onClick={() => setDeleting(null)}>
                        Annuler
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </section>
            {canManage && editing && (
              <section className="accounting-card">
                <h2>{editing === 'new' ? 'Nouveau modèle' : 'Modifier le modèle'}</h2>
                <TemplateForm
                  key={editing === 'new' ? 'new' : editing._id}
                  template={editing === 'new' ? undefined : editing}
                  beneficiaries={data.beneficiaries}
                  onSaved={saved}
                />
                <button className="portal-button secondary" onClick={() => setEditing(null)}>
                  Fermer
                </button>
              </section>
            )}
          </>
        )}
      </div>
    </AccountingLayout>
  )
}
