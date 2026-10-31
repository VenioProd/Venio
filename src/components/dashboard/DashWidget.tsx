import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext'

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
  emptyLabel,
  error,
  neon = false,
  children,
}: DashWidgetProps) => {
  const { t } = useI18n()
  return (
    <section className={`dash-widget${neon ? ' dash-widget--neon' : ''}`} aria-label={title}>
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
          <Link to={action.to} className="dash-widget__action">
            {action.label}
          </Link>
        )}
      </header>
      {error ? (
        <div className="dash-widget__error">{error}</div>
      ) : empty ? (
        <div className="dash-widget__empty">{emptyLabel ?? t('shared.dash.widgetEmpty')}</div>
      ) : (
        children
      )}
    </section>
  )
}

export default DashWidget
