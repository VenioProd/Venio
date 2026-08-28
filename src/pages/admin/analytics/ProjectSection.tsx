import React from 'react'
import BarChart from './BarChart'
import {
  MONTH_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  formatEur,
  type AnalyticsData,
} from './types'

interface ProjectSectionProps {
  data: AnalyticsData
}

/** Blocs projets, tâches et revenus, repris tels quels de l'ancienne page. */
const ProjectSection: React.FC<ProjectSectionProps> = ({ data }) => {
  const totalProjects = Object.values(data.projectsByStatus).reduce((a, b) => a + b, 0)
  const totalTasks = Object.values(data.tasksByStatus).reduce((a, b) => a + b, 0)
  const revenueChange =
    data.lastMonthRevenue > 0
      ? Math.round(((data.monthlyRevenue - data.lastMonthRevenue) / data.lastMonthRevenue) * 100)
      : 0

  return (
    <>
      {/* KPI Cards */}
      <div className="analytics-kpis">
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">Projets</span>
          <span className="analytics-kpi-value">{totalProjects}</span>
          <span className="analytics-kpi-sub">{data.projectsByStatus['EN_COURS'] || 0} en cours</span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">Taches</span>
          <span className="analytics-kpi-value">{totalTasks}</span>
          <span className="analytics-kpi-sub" style={data.overdueTaskCount > 0 ? { color: '#ef4444' } : {}}>
            {data.overdueTaskCount} en retard
          </span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">CA Total</span>
          <span className="analytics-kpi-value">{formatEur(data.totalRevenue)}</span>
          <span className="analytics-kpi-sub">
            Ce mois: {formatEur(data.monthlyRevenue)}
            {revenueChange !== 0 && (
              <span style={{ color: revenueChange > 0 ? '#22c55e' : '#ef4444', marginLeft: 6 }}>
                {revenueChange > 0 ? '+' : ''}
                {revenueChange}%
              </span>
            )}
          </span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">Clients</span>
          <span className="analytics-kpi-value">{data.clientCount}</span>
          <span className="analytics-kpi-sub">{data.activeClientCount} actifs</span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">Leads</span>
          <span className="analytics-kpi-value">{data.leadStats.total}</span>
          {/* Le taux de conversion vit dans la section Pilotage, où il est
              mesuré sur les affaires conclues. En afficher un second, calculé
              sur le total, mettrait deux chiffres contradictoires à l'écran. */}
          <span className="analytics-kpi-sub">{data.leadStats.active} actifs</span>
        </div>
        <div className="analytics-kpi">
          <span className="analytics-kpi-label">Pipeline</span>
          <span className="analytics-kpi-value">{formatEur(data.leadStats.pipelineValue)}</span>
          <span className="analytics-kpi-sub">Budget total: {formatEur(data.totalBudget)}</span>
        </div>
      </div>

      {/* Charts */}
      <div className="analytics-charts">
        <div className="analytics-chart-card">
          <h3>Projets par statut</h3>
          <BarChart data={data.projectsByStatus} labels={STATUS_LABELS} colors={STATUS_COLORS} />
        </div>
        <div className="analytics-chart-card">
          <h3>Projets par priorite</h3>
          <BarChart data={data.projectsByPriority} labels={PRIORITY_LABELS} colors={PRIORITY_COLORS} />
        </div>
        <div className="analytics-chart-card">
          <h3>Taches par statut</h3>
          <BarChart data={data.tasksByStatus} labels={STATUS_LABELS} colors={STATUS_COLORS} />
        </div>
        <div className="analytics-chart-card">
          <h3>Taches par priorite</h3>
          <BarChart data={data.tasksByPriority} labels={PRIORITY_LABELS} colors={PRIORITY_COLORS} />
        </div>
      </div>

      {/* Projects per month */}
      {data.projectsPerMonth.length > 0 && (
        <div className="analytics-chart-card" style={{ marginTop: 24 }}>
          <h3>Projets crees par mois (6 derniers mois)</h3>
          <div className="analytics-month-chart">
            {data.projectsPerMonth.map((m) => {
              const max = Math.max(...data.projectsPerMonth.map((p) => p.count), 1)
              return (
                <div key={`${m._id.year}-${m._id.month}`} className="analytics-month-bar">
                  <div className="analytics-month-bar-inner" style={{ height: `${(m.count / max) * 100}%` }} />
                  <span className="analytics-month-label">{MONTH_LABELS[m._id.month - 1]}</span>
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
