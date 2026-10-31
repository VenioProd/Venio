import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../../context/AuthContext'
import { useI18n } from '../../../../context/I18nContext'
import { hasPermission, PERMISSIONS } from '../../../../lib/permissions'
import { apiFetch } from '../../../../lib/api'
import AccountingLayout from '../AccountingLayout'
import BeneficiaryForm from './BeneficiaryForm'
import { ACCOUNTING, errorText, labelFor, Table } from './shared'
import type { Beneficiary } from './types'

export default function BeneficiariesPage() {
  const { t } = useI18n()
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
    <AccountingLayout title={t('accProjects.beneficiaries.title')} subtitle={t('accProjects.beneficiaries.subtitle')}>
      <div className="pf-workspace">
        {error && (
          <p className="admin-error" role="alert">
            {error}{' '}
            <button onClick={() => void load().catch((error) => setError(errorText(error)))}>
              {t('accProjects.common.refresh')}
            </button>
          </p>
        )}
        {!beneficiaries && !error && <p role="status">{t('accProjects.beneficiaries.loading')}</p>}
        {canManage && (
          <button className="portal-button" onClick={() => setCreating(!creating)}>
            {creating ? t('accProjects.beneficiaries.closeForm') : t('accProjects.beneficiaries.new')}
          </button>
        )}
        {canManage && creating && (
          <section className="accounting-card">
            <h2>{t('accProjects.beneficiaries.new')}</h2>
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
            <h2>{t('accProjects.beneficiaries.list')}</h2>
            {!beneficiaries.length && <p>{t('accProjects.dashboard.noBeneficiary')}</p>}
            {!!beneficiaries.length && (
              <Table
                headers={[
                  t('accProjects.cols.name'),
                  t('accProjects.cols.type'),
                  t('accProjects.cols.email'),
                  t('accProjects.cols.settlement'),
                  t('accProjects.cols.status'),
                ]}
              >
                {beneficiaries.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <Link to={`/admin/comptabilite/beneficiaires/${item._id}`}>{item.displayName}</Link>
                    </td>
                    <td>{labelFor(t, item.kind)}</td>
                    <td>{item.email || '—'}</td>
                    <td>{labelFor(t, item.settlementMode)}</td>
                    <td>{item.isActive ? t('accProjects.beneficiaries.active') : t('accProjects.common.archived')}</td>
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
