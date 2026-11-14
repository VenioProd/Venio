import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './crm-ui.css'

export interface CrmMomentLink {
  id: string
  label: string
  to: string
  icon: ReactNode
  /** Une ligne sous le libellé, seulement si elle repose sur une donnée réelle. */
  hint?: string
  current?: boolean
}

/** Cartes des quatre moments du CRM, en tête de chaque écran. */
export default function CrmMomentNav({ label, moments }: { label: string; moments: readonly CrmMomentLink[] }) {
  return (
    <nav aria-label={label}>
      <ul className="crm-ui-moments" style={{ ['--crm-ui-moment-count' as string]: moments.length }}>
        {moments.map((moment) => (
          <li key={moment.id}>
            <Link
              className="crm-ui-moment"
              to={moment.to}
              aria-current={moment.current ? 'page' : undefined}
              data-moment={moment.id}
            >
              <span className="crm-ui-moment__icon" aria-hidden="true">
                {moment.icon}
              </span>
              <span className="crm-ui-moment__text">
                <span className="crm-ui-moment__label">{moment.label}</span>
                {moment.hint && <span className="crm-ui-moment__hint">{moment.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
