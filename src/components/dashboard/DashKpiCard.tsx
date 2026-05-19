import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Sparkline from './Sparkline'

export interface KpiDelta {
  value: number
  direction: 'up' | 'down' | 'flat'
  suffix?: string
}

export interface KpiObjective {
  current: number
  target: number
  label?: string
}

interface DashKpiCardProps {
  label: string
  value: ReactNode
  accentColor: string
  accentRgb: string
  icon?: ReactNode
  to?: string
  delta?: KpiDelta
  objective?: KpiObjective
  sparkline?: number[]
  hint?: string
}

const DashKpiCard = ({
  label, value, accentColor, accentRgb, icon, to, delta, objective, sparkline, hint,
}: DashKpiCardProps) => {
  const arrow = delta
    ? (delta.direction === 'up' ? '↗' : delta.direction === 'down' ? '↘' : '=')
    : ''
  const sign = delta && delta.value > 0 ? '+' : ''
  const deltaClass = delta?.direction === 'down'
    ? 'dash-kpi__delta dash-kpi__delta--neg'
    : delta?.direction === 'flat'
      ? 'dash-kpi__delta dash-kpi__delta--neutral'
      : 'dash-kpi__delta'
  const objPct = objective
    ? Math.min(100, Math.round((objective.current / objective.target) * 100))
    : 0

  const card = (
    <div
      className="dash-kpi"
      style={{
        ['--dash-kpi-accent' as string]: accentColor,
        ['--dash-kpi-accent-rgb' as string]: accentRgb,
      }}
    >
      <div className="dash-kpi__label">
        {icon && <span style={{ marginRight: 4 }}>{icon}</span>}
        {label}
      </div>
      <div className="dash-kpi__value">{value}</div>
      {delta && (
        <div className={deltaClass}>
          {arrow} {sign}{delta.value}{delta.suffix ?? '%'}
        </div>
      )}
      {objective && (
        <div className="dash-kpi__objective">
          {objective.label ?? 'Objectif'} : {objPct}% ({objective.current.toLocaleString('fr-FR')} / {objective.target.toLocaleString('fr-FR')})
          <div className="dash-kpi__objective-bar">
            <div className="dash-kpi__objective-bar__fill" style={{ width: `${objPct}%` }} />
          </div>
        </div>
      )}
      {sparkline && sparkline.length > 0 && (
        <div className="dash-kpi__sparkline">
          <Sparkline values={sparkline} color={accentColor} />
        </div>
      )}
      {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  )

  return to ? <Link to={to} style={{ textDecoration: 'none' }}>{card}</Link> : card
}

export default DashKpiCard
