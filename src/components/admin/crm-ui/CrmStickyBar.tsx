import type { ReactNode } from 'react'
import './crm-ui.css'

/**
 * Barre d'action collante en bas de l'écran (valider une analyse, appliquer une
 * sélection). Fond opaque `--bg-secondary`. À placer en dernier dans son conteneur :
 * `src/App.css` isole chaque élément, un frère suivant passerait par-dessus.
 */
export default function CrmStickyBar({
  children,
  actions,
  label,
}: {
  /** Ce que la barre résume (« 4 informations et 2 actions traitées »). */
  children?: ReactNode
  actions: ReactNode
  label?: string
}) {
  return (
    <div className="crm-ui-sticky-bar" role="region" aria-label={label}>
      {children && <span className="crm-ui-sticky-bar__message">{children}</span>}
      <div className="crm-ui-sticky-bar__actions">{actions}</div>
    </div>
  )
}
