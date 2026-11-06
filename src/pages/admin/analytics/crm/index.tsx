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
import './PilotageSection.css'

/**
 * Pilotage commercial. Tout ce qui est affiché ici porte sur la **cohorte** des
 * leads créés dans la période : c'est la seule façon de dire quelque chose d'un
 * taux de passage.
 */
const PilotageSection: React.FC = () => {
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
    return (key: string) => byId.get(key) ?? displayKey(key)
  }, [admins])

  return (
    <section className="analytics-chart-card pilotage-section" style={{ marginTop: 24 }}>
      <div className="pilotage-header">
        <div>
          <h3>{t('adminTech.pilotage.title')}</h3>
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
            {CRM_ENTITIES.map((option) => (
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
              onClick={() => setPeriod(option.key)}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {loading && !data ? (
        <div className="admin-loading">{t('adminTech.pilotage.loading')}</div>
      ) : data ? (
        <div className="pilotage-grid">
          <div className="pilotage-block">
            <h4 className="pilotage-subtitle">{t('adminTech.pilotage.funnelTitle', { count: data.funnel.total })}</h4>
            <FunnelChart stages={data.funnel.stages} total={data.funnel.total} />
            <CoverageNotice coverage={data.coverage} />
          </div>

          <div className="pilotage-block">
            <h4 className="pilotage-subtitle">{t('adminTech.pilotage.velocityTitle')}</h4>
            <VelocityPanel velocity={data.velocity} />
          </div>

          <div className="pilotage-block pilotage-block-wide">
            <h4 className="pilotage-subtitle">{t('adminTech.pilotage.revenueTitle')}</h4>
            <PipelinePanel pipeline={data.pipeline} revenue={data.revenue} />
          </div>

          <div className="pilotage-block pilotage-block-wide">
            <h4 className="pilotage-subtitle">{t('adminTech.pilotage.lossesTitle', { count: data.losses.total })}</h4>
            <LossPanel losses={data.losses} />
          </div>

          <div className="pilotage-block pilotage-block-wide">
            <h4 className="pilotage-subtitle">{t('adminTech.pilotage.bySource')}</h4>
            <PerformanceTable rows={data.bySource} emptyLabel={t('adminTech.pilotage.noLeads')} />
          </div>

          {data.byOwner && (
            <div className="pilotage-block pilotage-block-wide">
              <h4 className="pilotage-subtitle">{t('adminTech.pilotage.byOwner')}</h4>
              <PerformanceTable
                rows={data.byOwner}
                resolveLabel={resolveOwner}
                emptyLabel={t('adminTech.pilotage.noLeads')}
              />
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

export default PilotageSection
