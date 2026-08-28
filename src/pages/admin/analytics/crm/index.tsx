import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
import './PilotageSection.css'

/**
 * Pilotage commercial. Tout ce qui est affiché ici porte sur la **cohorte** des
 * leads créés dans la période : c'est la seule façon de dire quelque chose d'un
 * taux de passage.
 */
const PilotageSection: React.FC = () => {
  const [period, setPeriod] = useState<PilotagePeriod>('90d')
  const [data, setData] = useState<PilotageResponse | null>(null)
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchPilotage(period))
      setError('')
    } catch (err) {
      setError((err as Error).message || 'Impossible de charger le pilotage commercial')
    } finally {
      setLoading(false)
    }
  }, [period])

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
          <h3>Pilotage commercial</h3>
          <p className="pilotage-subtext">
            Sur les leads créés pendant la période — un taux mesuré sur deux populations différentes ne voudrait rien
            dire.
          </p>
        </div>
        <div className="pilotage-periods" role="group" aria-label="Période d'analyse">
          {PILOTAGE_PERIODS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={period === option.key ? 'active' : ''}
              onClick={() => setPeriod(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="admin-error">{error}</div>}

      {loading && !data ? (
        <div className="admin-loading">Chargement du pilotage…</div>
      ) : data ? (
        <div className="pilotage-grid">
          <div className="pilotage-block">
            <h4 className="pilotage-subtitle">Entonnoir — {data.funnel.total} leads</h4>
            <FunnelChart stages={data.funnel.stages} total={data.funnel.total} />
            <CoverageNotice coverage={data.coverage} />
          </div>

          <div className="pilotage-block">
            <h4 className="pilotage-subtitle">Vélocité</h4>
            <VelocityPanel velocity={data.velocity} />
          </div>

          <div className="pilotage-block pilotage-block-wide">
            <h4 className="pilotage-subtitle">Chiffre d'affaires</h4>
            <PipelinePanel pipeline={data.pipeline} revenue={data.revenue} />
          </div>

          <div className="pilotage-block pilotage-block-wide">
            <h4 className="pilotage-subtitle">Affaires perdues — {data.losses.total}</h4>
            <LossPanel losses={data.losses} />
          </div>

          <div className="pilotage-block pilotage-block-wide">
            <h4 className="pilotage-subtitle">Par source</h4>
            <PerformanceTable rows={data.bySource} emptyLabel="Aucun lead sur la période." />
          </div>

          {data.byOwner && (
            <div className="pilotage-block pilotage-block-wide">
              <h4 className="pilotage-subtitle">Par commercial</h4>
              <PerformanceTable
                rows={data.byOwner}
                resolveLabel={resolveOwner}
                emptyLabel="Aucun lead sur la période."
              />
            </div>
          )}
        </div>
      ) : null}
    </section>
  )
}

export default PilotageSection
