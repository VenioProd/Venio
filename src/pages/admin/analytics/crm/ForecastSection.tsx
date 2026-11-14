import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../../../context/AuthContext'
import { useI18n } from '../../../../context/I18nContext'
import { apiFetch } from '../../../../lib/api'
import { fetchForecast, fetchPilotage } from '../../../../services/pilotage'
import type { ForecastResponse } from '../../../../types/pilotage.types'
import type { AdminUser } from '../../../../types/crm.types'
import { CRM_ENTITIES } from '../../crm-board/constants'
import { CrmPageHead, CrmSectionHead } from '../../../../components/admin/crm-ui'
import FinancialChart from '../../../../components/dashboard/FinancialChart'
import ForecastBars from './ForecastBars'
import GoalsManager from './GoalsManager'
import { formatAmount, formatMonth, formatPercent } from './constants'
import './PilotageSection.css'
import './crmPilotScreen.css'

const HORIZONS = [3, 6, 12]

/**
 * Prévisions : clôtures prévues par mois, avec réalisé et objectif. Les
 * montants sont des budgets de leads (EUR) ; la définition du pondéré est unique
 * et vit côté serveur (lib/crmRevenue.ts).
 */
/** `head` : la section ouvre la page « Prévisions et objectifs » et en porte le titre. */
const ForecastSection: React.FC<{ head?: boolean }> = ({ head = false }) => {
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
  // Un point par mois : montant pondéré en courbe, leads ouverts en barres de volume.
  const chartData = (data?.months ?? []).map((row) => ({
    ts: formatMonth(row.month),
    value: row.weighted,
    volume: row.openCount,
  }))

  return (
    <section
      className="pilotage-section forecast-section crm-pilot-screen"
      style={head ? undefined : { marginTop: 24 }}
      aria-labelledby="crm-forecast-title"
    >
      {head && <CrmPageHead title={t('crmPilot.fc.title')} lede={t('crmPilot.fc.lede')} />}
      <div className="crm-pilot-toolbar">
        <div className="crm-pilot-toolbar__text">
          <h2 id="crm-forecast-title" className="crm-pilot-toolbar__title">
            {t('adminTech.forecast.title')}
          </h2>
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
              aria-pressed={months === count}
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
          <div className="crm-pilot-tiles" role="group" aria-label={t('crmPilot.fc.tilesAria')}>
            <div>
              <b>{formatAmount(data.totals.weighted, currency)}</b>
              <span>{t('crmPilot.fc.tile.weighted', { count: data.totals.openCount })}</span>
            </div>
            <div>
              <b>{formatAmount(data.totals.gross, currency)}</b>
              <span>{t('crmPilot.fc.tile.open')}</span>
            </div>
            <div>
              <b>{formatAmount(data.totals.wonAmount, currency)}</b>
              <span>{t('crmPilot.fc.tile.won', { count: data.totals.wonCount })}</span>
            </div>
            <div>
              <b>{formatAmount(data.overdue.weighted, currency)}</b>
              <span>{t('crmPilot.fc.tile.overdue', { count: data.overdue.count })}</span>
            </div>
          </div>

          <div className="crm-pilot-grid">
            <section className="crm-ui-card" aria-labelledby="crm-forecast-chart">
              <CrmSectionHead
                id="crm-forecast-chart"
                level={3}
                title={t('crmPilot.fc.chart.title')}
                sub={t('crmPilot.fc.chart.sub')}
              />
              <div role="img" aria-label={t('crmPilot.fc.chart.aria')} className="crm-pilot-chart">
                <FinancialChart
                  timeline
                  data={chartData}
                  label={t('crmPilot.fc.chart.label')}
                  currentValue={formatAmount(data.totals.weighted, currency)}
                  formatValue={(value) => formatAmount(value, currency)}
                  valueName={t('crmPilot.fc.chart.legendWeighted')}
                  volumeName={t('crmPilot.fc.chart.legendCount')}
                />
              </div>
              <div className="crm-pilot-legend">
                <span>
                  <span className="crm-ui-dot" data-tone="blue" aria-hidden="true" />
                  {t('crmPilot.fc.chart.legendWeighted')}
                </span>
                <span>
                  <span className="crm-ui-dot" data-tone="grey" aria-hidden="true" />
                  {t('crmPilot.fc.chart.legendCount')}
                </span>
              </div>
            </section>

            <aside className="crm-pilot-stack">
              <section className="crm-ui-card" aria-labelledby="crm-forecast-goals">
                <CrmSectionHead
                  id="crm-forecast-goals"
                  level={3}
                  title={t('crmPilot.fc.goals.title')}
                  sub={t('crmPilot.fc.goals.sub')}
                />
                <ForecastBars months={data.months} />
              </section>
              <section className="crm-ui-card" aria-labelledby="crm-forecast-mix">
                <CrmSectionHead id="crm-forecast-mix" level={3} title={t('crmPilot.fc.mix.title')} />
                <div
                  className="crm-pilot-mix"
                  role="img"
                  aria-label={t('crmPilot.fc.mix.aria', {
                    won: formatAmount(data.totals.wonAmount, currency),
                    weighted: formatAmount(data.totals.weighted, currency),
                  })}
                >
                  <i data-tone="green" style={{ flexGrow: Math.max(data.totals.wonAmount, 0), flexBasis: 0 }} />
                  <i data-tone="blue" style={{ flexGrow: Math.max(data.totals.weighted, 0), flexBasis: 0 }} />
                </div>
                <div className="crm-pilot-legend">
                  <span>
                    <span className="crm-ui-dot" data-tone="green" aria-hidden="true" />
                    {t('crmPilot.fc.mix.won', { amount: formatAmount(data.totals.wonAmount, currency) })}
                  </span>
                  <span>
                    <span className="crm-ui-dot" data-tone="blue" aria-hidden="true" />
                    {t('crmPilot.fc.mix.weighted', { amount: formatAmount(data.totals.weighted, currency) })}
                  </span>
                </div>
                <p className="pilotage-note">
                  {t('crmPilot.fc.mix.total', {
                    amount: formatAmount(data.totals.wonAmount + data.totals.weighted, currency),
                  })}
                </p>
              </section>
            </aside>
          </div>

          <section className="crm-ui-card crm-ui-card--flush" aria-labelledby="crm-forecast-table">
            <CrmSectionHead id="crm-forecast-table" level={3} title={t('crmPilot.fc.table.title')} />
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
            <p className="pilotage-note crm-pilot-card-note">{t('adminTech.forecast.categoriesHint')}</p>
          </section>
          {data.totals.openCount === 0 && data.totals.wonCount === 0 && (
            <p className="pilotage-empty">{t('adminTech.forecast.empty')}</p>
          )}

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
