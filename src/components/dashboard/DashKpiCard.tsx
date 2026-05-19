import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  label: string
  value: ReactNode
  hint?: string
  icon?: ReactNode
  to?: string
  tone?: 'default' | 'danger' | 'success' | 'warning'
}

const toneStyles: Record<NonNullable<Props['tone']>, React.CSSProperties> = {
  default: {},
  danger: { borderColor: '#ef4444', boxShadow: '0 0 18px rgba(239,68,68,0.18)' },
  success: { borderColor: '#10b981', boxShadow: '0 0 18px rgba(16,185,129,0.15)' },
  warning: { borderColor: '#f59e0b', boxShadow: '0 0 18px rgba(245,158,11,0.15)' },
}

const DashKpiCard = ({ label, value, hint, icon, to, tone = 'default' }: Props) => {
  const content = (
    <div className="admin-stat-card" style={toneStyles[tone]}>
      <div className="admin-stat-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="admin-stat-value">{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{hint}</div>}
    </div>
  )
  if (to) return <Link to={to} style={{ textDecoration: 'none' }}>{content}</Link>
  return content
}

export default DashKpiCard
