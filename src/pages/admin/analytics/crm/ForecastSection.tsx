import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../../context/AuthContext'
import { useI18n } from '../../../../context/I18nContext'
import { apiFetch } from '../../../../lib/api'
import { fetchForecast, fetchPilotage } from '../../../../services/pilotage'
import type { ForecastResponse } from '../../../../types/pilotage.types'
import type { AdminUser } from '../../../../types/crm.types'
import { CRM_ENTITIES } from '../../crm-board/constants'
import ForecastBars from './ForecastBars'
import GoalsManager from './GoalsManager'
import { formatAmount, formatMonth, formatPercent } from './constants'
import './PilotageSection.css'

const HORIZONS = [3, 6, 12]

/**
 * Prévisions : clôtures prévues par mois, avec réalisé et objectif. Les
 * montants sont des budgets de leads (EUR) ; la définition du pondéré est unique
 * et vit côté serveur (lib/crmRevenue.ts).
 */
const ForecastSection: React.FC = () => {
  const { t } = useI18n()
  const { user } = useAuth()
  const administers = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'
  const [months, setMonths] = useState(6)
  const [entity, setEntity] = useState('')
  const [reliability, setReliability] = useState<{ reliable: boolean; cohortSize: number } | null>(null)
  useEffect(() => {
    let active = true
    setReliability(null)
    const loadReliability = async () => {
      try {
        const result = await fetchPilotage('90d', entity || undefined)
        if (active) setReliability(result.pipeline)
      } catch {
        if (active) setReliability(null)
      }
    }
    void loadReliability()
    return () => {
      active = false
    }
  }, [entity, t])
  const [data, setData] = useState<ForecastResponse | null>(null)
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchForecast(entity ? { months, entity } : { months }))
      setError('')
    } catch (err) {
      setError((err as Error).message || t('adminTech.forecast.loadError'))
    } finally {
      setLoading(false)
    }
  }, [months, entity, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!administers) return
    apiFetch<{ users?: AdminUser[] }>('/api/admin/admins')
      .then((response) => setAdmins(response.users ?? []))
      .catch(() => setAdmins([]))
  }, [administers])

  const currency = data?.currency ?? 'EUR'

  return (
    <section className="analytics-chart-card pilotage-section forecast-section" style={{ marginTop: 24 }}>
      <div className="pilotage-header">
        <div>
          <h3>{t('adminTech.forecast.title')}</h3>
          <p className="pilotage-subtext">{t('adminTech.forecast.subtext')}</p>
        </div>
        <label className="pilotage-entity">
          <span className="pilotage-subtext">{t('adminTech.pilotage.entityLabel')}</span>
          <select
            aria-label={t('adminTech.forecast.title') + ' — ' + t('adminTech.pilotage.entityLabel')}
            value={entity}
            onChange={(event) => setEntity(event.target.value)}
          >
            <option value="">{t('crm.filters.allEntities')}</option>
            {CRM_ENTITIES.filter((option) => !user?.crmEntities?.length || user.crmEntities.includes(option.key)).map(
              (option) => (
                <option key={option.key} value={option.key}>
                  {t(option.labelKey)}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="pilotage-periods" role="group" aria-label={t('adminTech.forecast.horizonLabel')}>
          {HORIZONS.map((count) => (
            <button
              key={count}
              type="button"
              className={months === count ? 'active' : ''}
              onClick={() => setMonths(count)}
            >
              {t('adminTech.forecast.horizonOption', { count })}
            </button>
          ))}
        </div>
      </div>

      {reliability?.reliable === false && (
        <p role="note" className="pilotage-coverage">
          {t('adminTech.pilotage.unreliable', { count: reliability.cohortSize })}
        </p>
      )}
      {error && <div className="admin-error">{error}</div>}

      {loading && !data ? (
        <div className="admin-loading">{t('adminTech.forecast.loading')}</div>
      ) : data ? (
        <>
          <div className="pilotage-table-scroll">
            <table className="pilotage-table forecast-table">
              <thead>
                <tr>
                  <th>{t('adminTech.forecast.colMonth')}</th>
                  <th>{t('adminTech.forecast.colOpen')}</th>
                  <th>{t('adminTech.forecast.colGross')}</th>
                  <th>{t('adminTech.forecast.colWeighted')}</th>
                  <th>{t('adminTech.forecast.colCommitted')}</th>
                  <th>{t('adminTech.forecast.colProbable')}</th>
                  <th>{t('adminTech.forecast.colPipeline')}</th>
                  <th>{t('adminTech.forecast.colRealised')}</th>
                  <th>{t('adminTech.forecast.colGoal')}</th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((row) => (
                  <tr key={row.month}>
                    <td>{formatMonth(row.month)}</td>
                    <td className="is-muted">{row.openCount}</td>
                    <td className="is-muted">{formatAmount(row.gross, currency)}</td>
                    <td className="is-strong">{formatAmount(row.weighted, currency)}</td>
                    <td className="is-muted">{formatAmount(row.categories.committed.weighted, currency)}</td>
                    <td className="is-muted">{formatAmount(row.categories.probable.weighted, currency)}</td>
                    <td className="is-muted">{formatAmount(row.categories.pipeline.weighted, currency)}</td>
                    <td className="is-strong">
                      {formatAmount(row.wonAmount, currency)}
                      <span className="pilotage-money-sub"> ({row.wonCount})</span>
                    </td>
                    <td className="is-muted">
                      {row.goal ? (
                        <>
                          {t('adminTech.forecast.goalProgress', {
                            percent: formatPercent(row.goal.amountProgress),
                            target: formatAmount(row.goal.amountTarget, currency),
                          })}
                          {row.goal.wonCountTarget > 0 && (
                            <span className="pilotage-money-sub">
                              {' '}
                              {t('adminTech.forecast.goalCount', {
                                won: row.wonCount,
                                target: row.goal.wonCountTarget,
                              })}
                            </span>
                          )}
                        </>
                      ) : (
                        t('adminTech.forecast.noGoal')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="pilotage-note">{t('adminTech.forecast.categoriesHint')}</p>
          {data.totals.openCount === 0 && data.totals.wonCount === 0 && (
            <p className="pilotage-empty">{t('adminTech.forecast.empty')}</p>
          )}

          <ForecastBars months={data.months} />

          {data.overdue.count > 0 && (
            <p className="pilotage-coverage">
              {t('adminTech.forecast.overdue', {
                count: data.overdue.count,
                amount: formatAmount(data.overdue.weighted, currency),
              })}
            </p>
          )}
          {data.unscheduled.count > 0 && (
            <p className="pilotage-note">
              {t('adminTech.forecast.unscheduled', {
                count: data.unscheduled.count,
                amount: formatAmount(data.unscheduled.weighted, currency),
              })}
            </p>
          )}

          {administers && (
            <GoalsManager from={data.from} months={months} admins={admins} onChanged={() => void load()} />
          )}
        </>
      ) : null}
    </section>
  )
}

export default ForecastSection
