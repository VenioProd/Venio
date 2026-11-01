import type { ReactNode } from 'react'
import './AdminHub.css'

export interface PageHeaderProps {
  eyebrow: ReactNode
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
}

export default function PageHeader({ eyebrow, title, subtitle, actions, tabs }: PageHeaderProps) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header__row">
        <div>
          <p className="admin-page-header__eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {subtitle && <p className="admin-page-header__subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="admin-page-header__actions">{actions}</div>}
      </div>
      {tabs}
    </header>
  )
}
