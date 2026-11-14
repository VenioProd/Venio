import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../../../context/I18nContext'
import { translate } from '../../../../i18n'
import { fetchPilotage } from '../../../../services/pilotage'
import { apiFetch } from '../../../../lib/api'
import type { PilotagePeriod, PilotageResponse } from '../../../../types/pilotage.types'
import type { AdminUser } from '../../../../types/crm.types'
import FunnelChart from './FunnelChart'
import VelocityPanel from './VelocityPanel'
import LossPanel from './LossPanel'
import PerformanceTable from './PerformanceTable'
import CoverageNotice from './CoverageNotice'
import PipelinePanel from './PipelinePanel'
import { PILOTAGE_PERIODS, displayKey } from './constants'
import { CRM_ENTITIES } from '../../crm-board/constants'
import { CrmPageHead } from '../../../../components/admin/crm-ui'
import './PilotageSection.css'
import './crmPilotScreen.css'

/**
 * Pilotage commercial. Tout ce qui est affiché ici porte sur la **cohorte** des
 * leads créés dans la période : c'est la seule façon de dire quelque chose d'un
 * taux de passage.
 */
const PilotageSection: React.FC<{ crmEntities?: string[] }> = ({ crmEntities }) => {
  const { t } = useI18n()
  const [period, setPeriod] = useState<PilotagePeriod>('90d')
  // Entité du groupe ('' : tout le périmètre de l'utilisateur).
  const [entity, setEntity] = useState<string>('')
  const [data, setData] = useState<PilotageResponse | null>(null)
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await (entity ? fetchPilotage(period, entity) : fetchPilotage(period)))
      setError('')
    } catch (err) {
      setError((err as Error).message || translate('adminTech.pilotage.loadError'))
    } finally {
      setLoading(false)
    }
  }, [period, entity])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    apiFetch<{ users?: AdminUser[] }>('/api/admin/admins')
      .then((response) => setAdmins(response.users ?? []))
      .catch(() => setAdmins([]))
  }, [])

  const resolveOwner = useMemo(() => {
    const byId = new Map(admins.map((admin) => [admin._id, admin.name]))
    return (key: string) =>
      byId.get(key) ??
      (key === 'NON_RENSEIGNE' ? displayKey(key) : `${t('crmRich.analytics.externalRep')} ${key.slice(-4)}`)
  }, [admins, t])

  return (
    <div className="pilotage-section crm-pilot-screen">
      <CrmPageHead title={t('crmPilot.fc.title')} lede={t('crmPilot.fc.lede')} />

      <section className="crm-pilot-toolbar" aria-labelledby="crm-pilot-cohort">
        <div className="crm-pilot-toolbar__text">
          <h2 id="crm-pilot-cohort" className="crm-pilot-toolbar__title">
            {t('adminTech.pilotage.title')}
          </h2>
          <p className="pilotage-subtext">{t('adminTech.pilotage.subtext')}</p>
        </div>
        <label className="pilotage-entity">
          <span className="pilotage-subtext">{t('adminTech.pilotage.entityLabel')}</span>
          <select
            aria-label={t('adminTech.pilotage.entityLabel')}
            value={entity}
            onChange={(event) => setEntity(event.target.value)}
          >
            <option value="">{t('crm.filters.allEntities')}</option>
            {CRM_ENTITIES.filter((option) => !crmEntities?.length || crmEntities.includes(option.key)).map((option) => (
              <option key={option.key} value={option.key}>
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </label>
        <div className="pilotage-periods" role="group" aria-label={t('adminTech.pilotage.periodLabel')}>
          {PILOTAGE_PERIODS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={period === option.key ? 'active' : ''}
              aria-pressed={period === option.key}
              onClick={() => setPeriod(option.key)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="admin-error">{error}</div>}

      {loading && !data ? (
        <div className="admin-loading">{t('adminTech.pilotage.loading')}</div>
      ) : data ? (
        <div className="pilotage-grid">
          <section className="crm-ui-card pilotage-block" aria-labelledby="crm-pilot-funnel">
            <h3 id="crm-pilot-funnel" className="pilotage-subtitle">
              {t('adminTech.pilotage.funnelTitle', { count: data.funnel.total })}
            </h3>
            <FunnelChart stages={data.funnel.stages} total={data.funnel.total} />
            <CoverageNotice coverage={data.coverage} />
          </section>

          <section className="crm-ui-card pilotage-block" aria-labelledby="crm-pilot-velocity">
            <h3 id="crm-pilot-velocity" className="pilotage-subtitle">
              {t('adminTech.pilotage.velocityTitle')}
            </h3>
            <VelocityPanel velocity={data.velocity} />
          </section>

          <section className="crm-ui-card pilotage-block pilotage-block-wide" aria-labelledby="crm-pilot-revenue">
            <h3 id="crm-pilot-revenue" className="pilotage-subtitle">
              {t('adminTech.pilotage.revenueTitle')}
            </h3>
            <PipelinePanel pipeline={data.pipeline} revenue={data.revenue} />
          </section>

          <section className="crm-ui-card pilotage-block pilotage-block-wide" aria-labelledby="crm-pilot-losses">
            <h3 id="crm-pilot-losses" className="pilotage-subtitle">
              {t('adminTech.pilotage.lossesTitle', { count: data.losses.total })}
            </h3>
            <LossPanel losses={data.losses} />
          </section>

          <section className="crm-ui-card pilotage-block pilotage-block-wide" aria-labelledby="crm-pilot-source">
            <h3 id="crm-pilot-source" className="pilotage-subtitle">
              {t('adminTech.pilotage.bySource')}
            </h3>
            <PerformanceTable rows={data.bySource} emptyLabel={t('adminTech.pilotage.noLeads')} />
          </section>

          {data.byOwner && (
            <section className="crm-ui-card pilotage-block pilotage-block-wide" aria-labelledby="crm-pilot-owner">
              <h3 id="crm-pilot-owner" className="pilotage-subtitle">
                {t('adminTech.pilotage.byOwner')}
              </h3>
              <PerformanceTable
                rows={data.byOwner}
                resolveLabel={resolveOwner}
                emptyLabel={t('adminTech.pilotage.noLeads')}
              />
            </section>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default PilotageSection
