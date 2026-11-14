import type { ReactNode } from 'react'
import CrmSectionHead from './CrmSectionHead'
import './crm-ui.css'

/**
 * Mise en page « contenu + panneau latéral de fiche » : deux colonnes au-delà
 * de 1100 px, une seule en dessous (le panneau passe sous le contenu).
 */
export function CrmWithPanel({ children, panel }: { children: ReactNode; panel: ReactNode }) {
  return (
    <div className="crm-ui-with-panel">
      <div className="crm-ui-panel">{children}</div>
      {panel}
    </div>
  )
}

/** Colonne latérale de fiche : une pile de `CrmPanelCard`. */
export default function CrmSidePanel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside className="crm-ui-panel" aria-label={label}>
      {children}
    </aside>
  )
}

/** Carte du panneau latéral, avec titre, sous-titre ou compteur et actions. */
export function CrmPanelCard({
  title,
  count,
  sub,
  actions,
  children,
  id,
}: {
  title: ReactNode
  count?: number | string
  sub?: ReactNode
  actions?: ReactNode
  children: ReactNode
  id?: string
}) {
  return (
    <section className="crm-ui-card" aria-labelledby={id}>
      <CrmSectionHead title={title} count={count} sub={sub} actions={actions} id={id} />
      {children}
    </section>
  )
}

/** Liste de propriétés de la fiche (« Statut », « Chaleur », « Budget »…). */
export function CrmPropList({ items }: { items: readonly { label: ReactNode; value: ReactNode; key?: string }[] }) {
  return (
    <dl className="crm-ui-props">
      {items.map((item, index) => (
        <div key={item.key ?? index}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
