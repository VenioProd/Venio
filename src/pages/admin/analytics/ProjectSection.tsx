import React from 'react'
import { useI18n } from '../../../context/I18nContext'
import type { MessageKey } from '../../../i18n'
import BarChart from './BarChart'
import {
  MONTH_LABEL_KEYS,
  PRIORITY_COLORS,
  PRIORITY_LABEL_KEYS,
  STATUS_COLORS,
  STATUS_LABEL_KEYS,
  formatEur,
  type AnalyticsData,
} from './types'

interface ProjectSectionProps {
  data: AnalyticsData
}

/** Blocs projets, tâches et revenus, repris tels quels de l'ancienne page. */
const ProjectSection: React.FC<ProjectSectionProps> = ({ data }) => {
  const { t } = useI18n()
  const translateKeys = (keys: Record<string, MessageKey>): Record<string, string> =>
    Object.fromEntries(Object.entries(keys).map(([key, messageKey]) => [key, t(messageKey)]))
  const statusLabels = translateKeys(STATUS_LABEL_KEYS)
  const priorityLabels = translateKeys(PRIORITY_LABEL_KEYS)
  const totalProjects = Object.values(data.projectsByStatus).reduce((a, b) => a + b, 0)
  const totalTasks = Object.values(data.tasksByStatus).reduce((a, b) => a + b, 0)
  // Les montants sont retirés en amont pour qui n'a pas accès à la facturation.
  // On masque alors les tuiles concernées : afficher « 0 € » laisserait croire
  // à un chiffre d'affaires nul plutôt qu'à une information non accessible.
  const canSeeAmounts = data.totalRevenue !== null
  const revenueChange =
    data.lastMonthRevenue !== null && data.lastMonthRevenue > 0 && data.monthlyRevenue !== null
      ? Math.round(((data.monthlyRevenue - data.lastMonthRevenue) / data.lastMonthRevenue) * 100)
      : 0

  return (
    <>
      {/* KPI Cards */}
      <div className="analytics-kpis">
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">{t('adminTech.analytics.projects')}</span>
          <span className="analytics-kpi-value">{totalProjects}</span>
          <span className="analytics-kpi-sub">
            {t('adminTech.analytics.inProgressCount', { count: data.projectsByStatus['EN_COURS'] || 0 })}
          </span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">{t('adminTech.analytics.tasks')}</span>
          <span className="analytics-kpi-value">{totalTasks}</span>
          <span className="analytics-kpi-sub" style={data.overdueTaskCount > 0 ? { color: '#ef4444' } : {}}>
            {t('adminTech.analytics.overdueCount', { count: data.overdueTaskCount })}
          </span>
        </div>
        {canSeeAmounts && (
          <div className="analytics-kpi">
            <span className="analytics-kpi-label">{t('adminTech.analytics.totalRevenue')}</span>
            <span className="analytics-kpi-value">{formatEur(data.totalRevenue ?? 0)}</span>
            <span className="analytics-kpi-sub">
              {t('adminTech.analytics.thisMonth', { amount: formatEur(data.monthlyRevenue ?? 0) })}
              {revenueChange !== 0 && (
                <span style={{ color: revenueChange > 0 ? '#22c55e' : '#ef4444', marginLeft: 6 }}>
                  {revenueChange > 0 ? '+' : ''}
                  {revenueChange}%
                </span>
              )}
            </span>
          </div>
        )}
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">{t('adminTech.analytics.clients')}</span>
          <span className="analytics-kpi-value">{data.clientCount}</span>
          <span className="analytics-kpi-sub">
            {t('adminTech.analytics.activeCount', { count: data.activeClientCount })}
          </span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">{t('adminTech.analytics.leads')}</span>
          <span className="analytics-kpi-value">{data.leadStats.total}</span>
          {/* Le taux de conversion vit dans la section Pilotage, où il est
              mesuré sur les affaires conclues. En afficher un second, calculé
              sur le total, mettrait deux chiffres contradictoires à l'écran. */}
          <span className="analytics-kpi-sub">
            {t('adminTech.analytics.activeCount', { count: data.leadStats.active })}
          </span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">{t('adminTech.analytics.pipeline')}</span>
          <span className="analytics-kpi-value">{formatEur(data.leadStats.pipelineValue)}</span>
          {data.totalBudget !== null && (
            <span className="analytics-kpi-sub">
              {t('adminTech.analytics.totalBudget', { amount: formatEur(data.totalBudget) })}
            </span>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="analytics-charts">
        <div className="analytics-chart-card">
          <h3>{t('adminTech.analytics.projectsByStatus')}</h3>
          <BarChart data={data.projectsByStatus} labels={statusLabels} colors={STATUS_COLORS} />
        </div>
        <div className="analytics-chart-card">
          <h3>{t('adminTech.analytics.projectsByPriority')}</h3>
          <BarChart data={data.projectsByPriority} labels={priorityLabels} colors={PRIORITY_COLORS} />
        </div>
        <div className="analytics-chart-card">
          <h3>{t('adminTech.analytics.tasksByStatus')}</h3>
          <BarChart data={data.tasksByStatus} labels={statusLabels} colors={STATUS_COLORS} />
        </div>
        <div className="analytics-chart-card">
          <h3>{t('adminTech.analytics.tasksByPriority')}</h3>
          <BarChart data={data.tasksByPriority} labels={priorityLabels} colors={PRIORITY_COLORS} />
        </div>
      </div>

      {/* Projects per month */}
      {data.projectsPerMonth.length > 0 && (
        <div className="analytics-chart-card" style={{ marginTop: 24 }}>
          <h3>{t('adminTech.analytics.projectsPerMonth')}</h3>
          <div className="analytics-month-chart">
            {data.projectsPerMonth.map((m) => {
              const max = Math.max(...data.projectsPerMonth.map((p) => p.count), 1)
              return (
                <div key={`${m._id.year}-${m._id.month}`} className="analytics-month-bar">
                  <div className="analytics-month-bar-inner" style={{ height: `${(m.count / max) * 100}%` }} />
                  <span className="analytics-month-label">{t(MONTH_LABEL_KEYS[m._id.month - 1])}</span>
                  <span className="analytics-month-count">{m.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

export default ProjectSection
