import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  title: string
  subtitle?: string
  icon?: ReactNode
  action?: { label: string; to: string }
  children: ReactNode
  marginTop?: number
}

const DashSection = ({ title, subtitle, icon, action, children, marginTop = 24 }: Props) => (
  <section style={{ marginTop }}>
    <header
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        marginBottom: 12,
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        <h2 className="dash-section-title" style={{ margin: 0 }}>
          {title}
        </h2>
        {subtitle && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</span>
        )}
      </div>
      {action && (
        <Link to={action.to} style={{ color: '#0ea5e9', fontSize: 13, textDecoration: 'none' }}>
          {action.label} →
        </Link>
      )}
    </header>
    {children}
  </section>
)

export default DashSection
