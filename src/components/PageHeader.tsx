import React from 'react'
import './PageHeader.css'

interface Props {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

/**
 * Standard admin / portal page header (Ticket #29).
 * Replaces ad-hoc inline-styled <h1>{title}</h1> blocks scattered across
 * admin pages with a single composable component.
 */
export default function PageHeader({ title, subtitle, actions, className }: Props) {
  return (
    <header className={`page-header${className ? ' ' + className : ''}`}>
      <div className="page-header__text">
        <h1 className="page-header__title">{title}</h1>
        {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  )
}
