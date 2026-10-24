import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions'
import { apiFetch } from '../../../../lib/api'
import AccountingLayout from '../AccountingLayout'
import BeneficiaryForm from './BeneficiaryForm'
import StatementView from './StatementView'
import { formatMoney, parseMoney } from './money'
import { ACCOUNTING, ActionForm, errorText, Field, labels, text, today, write } from './shared'
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
  const [projectId, setProjectId] = useState('')
  let remaining = statement.remainingCents
  if (projectId)
    remaining = Math.min(
      remaining,
      statement.projects.find((row) => row.project._id === projectId)?.remainingCents ?? 0,
    )
  return (
    <ActionForm
      label="Enregistrer le versement"
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
          throw new Error(`Le versement dépasse le restant disponible : ${formatMoney(maximum)} HT.`)
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
        Restant disponible : <strong>{formatMoney(remaining)} HT</strong> · mode{' '}
        {beneficiary.settlementMode === 'PAIE' ? 'Paie (sans écriture bancaire)' : 'Banque'}.
      </p>
      {remaining <= 0 && <p>Aucun versement possible tant que le restant n’est pas positif.</p>}
      <div className="pf-grid">
        <Field label="Projet (facultatif)">
          <select name="projectId" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Sans rattachement</option>
            {statement.projects.map((row) => (
              <option key={row.project._id} value={row.project._id}>
                {row.project.name} · {formatMoney(row.remainingCents)} HT
              </option>
            ))}
          </select>
        </Field>
        <Field label="Montant HT (€)">
          <input name="ht" inputMode="decimal" required />
        </Field>
        <Field label="Montant de TVA (€)">
          <input name="vat" inputMode="decimal" required defaultValue="0" readOnly={!beneficiary.vatRegistered} />
        </Field>
        <Field label="Date du versement">
          <input name="paidAt" type="date" required max={today()} defaultValue={today()} />
        </Field>
        <Field label="Référence de sa facture">
          <input name="invoiceRef" required />
        </Field>
        <Field label="Note (facultative)">
          <input name="note" />
        </Field>
      </div>
    </ActionForm>
  )
}

export default function BeneficiaryDetail() {
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
        if (!beneficiary) throw new Error('Bénéficiaire introuvable.')
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
      title={data?.beneficiary.displayName || 'Bénéficiaire'}
      subtitle={<Link to="/admin/comptabilite/beneficiaires">Tous les bénéficiaires</Link>}
    >
      <div className="pf-workspace">
        {error && (
          <p className="admin-error" role="alert">
            {error} <button onClick={() => void load().catch((error) => setError(errorText(error)))}>Actualiser</button>
          </p>
        )}
        {!data && !error && <p role="status">Chargement du relevé…</p>}
        {data && (
          <>
            <section className="accounting-card">
              <h2>Coordonnées et versement</h2>
              <p>
                {labels[data.beneficiary.kind]} · {data.beneficiary.email || 'E-mail non renseigné'} · SIRET :{' '}
                {data.beneficiary.siret || 'Non renseigné'}
              </p>
              <p>
                {data.beneficiary.vatRegistered ? 'Assujetti à la TVA' : 'Non assujetti à la TVA'} · Compte{' '}
                {data.beneficiary.defaultAccountCode} · Mode {labels[data.beneficiary.settlementMode]}
              </p>
            </section>
            {!data.beneficiary.isActive && <p>Bénéficiaire archivé.</p>}
            {canManage && (
              <div className="pf-actions">
                <button className="portal-button secondary" onClick={() => setEditing(!editing)}>
                  Modifier
                </button>
                <button className="portal-button" onClick={() => setSettling(!settling)}>
                  Verser
                </button>
                {data.beneficiary.isActive && (
                  <button className="portal-button secondary" onClick={() => setArchiving(!archiving)}>
                    Archiver
                  </button>
                )}
              </div>
            )}
            {canManage && archiving && (
              <section className="accounting-card">
                <h2>Archiver ce bénéficiaire</h2>
                <p>Son historique sera conservé.</p>
                <ActionForm
                  label="Confirmer l’archivage"
                  submit={(_, key) => write(`${ACCOUNTING}/beneficiaries/${id}/archive`, 'POST', {}, key)}
                  onSaved={saved}
                />
              </section>
            )}
            {canManage && editing && (
              <section className="accounting-card">
                <h2>Modifier le bénéficiaire</h2>
                <BeneficiaryForm key={data.beneficiary._id} beneficiary={data.beneficiary} onSaved={saved} />
              </section>
            )}
            {canManage && settling && (
              <section className="accounting-card">
                <h2>Verser au bénéficiaire</h2>
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
