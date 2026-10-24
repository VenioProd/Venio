import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../../context/AuthContext'
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions'
import { apiFetch } from '../../../../lib/api'
import AccountingLayout from '../AccountingLayout'
import BeneficiaryForm from './BeneficiaryForm'
import { ACCOUNTING, errorText, labels, Table } from './shared'
import type { Beneficiary } from './types'

export default function BeneficiariesPage() {
  const { user } = useAuth()
  const canManage = hasPermission(user, PERMISSIONS.MANAGE_ACCOUNTING)
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(
    () =>
      apiFetch<{ beneficiaries: Beneficiary[] }>(`${ACCOUNTING}/beneficiaries`).then((data) => {
        setBeneficiaries(data.beneficiaries)
        setError('')
      }),
    [],
  )
  useEffect(() => {
    void load().catch((error) => setError(errorText(error)))
  }, [load])
  return (
    <AccountingLayout title="Bénéficiaires" subtitle="Associés, commerciaux, freelances et apporteurs.">
      <div className="pf-workspace">
        {error && (
          <p className="admin-error" role="alert">
            {error} <button onClick={() => void load().catch((error) => setError(errorText(error)))}>Actualiser</button>
          </p>
        )}
        {!beneficiaries && !error && <p role="status">Chargement des bénéficiaires…</p>}
        {canManage && (
          <button className="portal-button" onClick={() => setCreating(!creating)}>
            {creating ? 'Fermer le formulaire' : 'Nouveau bénéficiaire'}
          </button>
        )}
        {canManage && creating && (
          <section className="accounting-card">
            <h2>Nouveau bénéficiaire</h2>
            <BeneficiaryForm
              onSaved={async () => {
                setCreating(false)
                await load()
              }}
            />
          </section>
        )}
        {beneficiaries && (
          <section className="accounting-card">
            <h2>Liste des bénéficiaires</h2>
            {!beneficiaries.length && <p>Aucun bénéficiaire.</p>}
            {!!beneficiaries.length && (
              <Table headers={['Nom', 'Type', 'E-mail', 'Versement', 'État']}>
                {beneficiaries.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <Link to={`/admin/comptabilite/beneficiaires/${item._id}`}>{item.displayName}</Link>
                    </td>
                    <td>{labels[item.kind]}</td>
                    <td>{item.email || '—'}</td>
                    <td>{labels[item.settlementMode]}</td>
                    <td>{item.isActive ? 'Actif' : 'Archivé'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        )}
      </div>
    </AccountingLayout>
  )
}
