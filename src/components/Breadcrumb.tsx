import { Link } from 'react-router-dom'
import { useI18n } from '../context/I18nContext'

interface BreadcrumbItem {
  label: string
  to?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

const Breadcrumb = ({ items, className = 'admin-breadcrumb' }: BreadcrumbProps) => {
  const { t } = useI18n()
  return (
    <nav className={className} aria-label={t('shell.breadcrumb.ariaLabel')}>
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 && <span>/</span>}
          {item.to ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span className="admin-breadcrumb-current">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export default Breadcrumb
