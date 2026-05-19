import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface DashWidgetProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  action?: { label: string; to: string }
  empty?: boolean
  emptyLabel?: string
  error?: string | null
  neon?: boolean
  children: ReactNode
}

const DashWidget = ({
  title,
  subtitle,
  icon,
  action,
  empty,
  emptyLabel = 'Aucun élément',
  error,
  neon = false,
  children,
}: DashWidgetProps) => {
  return (
    <section className={`dash-widget${neon ? ' dash-widget--neon' : ''}`}>
      <header className="dash-widget__header">
        <div className="dash-widget__title">
          {icon}
          <span>{title}</span>
          {subtitle && (
            <span className="dash-widget__subtitle">
              <span aria-hidden="true">·</span>
              <span>{subtitle}</span>
            </span>
          )}
        </div>
        {action && (
          <Link to={action.to} className="dash-widget__action" aria-label={action.label}>
            {action.label}
          </Link>
        )}
      </header>
      {error ? (
        <div className="dash-widget__error">{error}</div>
      ) : empty ? (
        <div className="dash-widget__empty">{emptyLabel}</div>
      ) : (
        children
      )}
    </section>
  )
}

export default DashWidget
