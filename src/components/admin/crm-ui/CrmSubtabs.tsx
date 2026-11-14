import { Link } from 'react-router-dom'
import './crm-ui.css'

export interface CrmSubtabLink {
  id: string
  label: string
  to: string
  /** Compteur réel ; absent quand la donnée n'existe pas (zéro est affiché). */
  count?: number
  current?: boolean
}

/** Sous-onglets d'un moment, suivis du lien « Où est quoi ? ». */
export default function CrmSubtabs({
  label,
  tabs,
  extra,
}: {
  label: string
  tabs: readonly CrmSubtabLink[]
  /** Lien aligné à droite (le plan du CRM). */
  extra?: { label: string; to: string; current?: boolean }
}) {
  return (
    <nav className="crm-ui-subtabs" aria-label={label}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={tab.to}
          aria-current={tab.current ? 'page' : undefined}
          aria-label={tab.count === undefined ? undefined : `${tab.label} ${tab.count}`}
          data-tab={tab.id}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="crm-ui-subtabs__count" aria-hidden="true">
              {tab.count}
            </span>
          )}
        </Link>
      ))}
      {extra && (
        <Link className="crm-ui-subtabs__plan" to={extra.to} aria-current={extra.current ? 'page' : undefined}>
          {extra.label}
        </Link>
      )}
    </nav>
  )
}
