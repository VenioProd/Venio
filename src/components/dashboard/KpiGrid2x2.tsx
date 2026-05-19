import type { ReactNode } from 'react'
import DashKpiCard, { type KpiDelta, type KpiObjective } from './DashKpiCard'

export interface KpiSpec {
  label: string
  value: ReactNode
  accentColor: string
  accentRgb: string
  to?: string
  delta?: KpiDelta
  objective?: KpiObjective
  sparkline?: number[]
  icon?: ReactNode
}

interface Props { kpis: KpiSpec[] }

const KpiGrid2x2 = ({ kpis }: Props) => (
  <div className="dash-kpi-grid-2x2">
    {kpis.map((k) => (
      <DashKpiCard key={k.label} {...k} />
    ))}
  </div>
)

export default KpiGrid2x2
