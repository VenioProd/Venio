import type { ReactNode } from 'react'
import './crm-ui.css'

/** En-tête d'un écran du CRM : surtitre en chasse fixe, titre, chapô et actions. */
export default function CrmPageHead({
  title,
  kicker,
  lede,
  actions,
  titleId,
}: {
  title: ReactNode
  kicker?: ReactNode
  lede?: ReactNode
  actions?: ReactNode
  titleId?: string
}) {
  return (
    <header className="crm-ui-page-head">
      <div>
        {kicker && <p className="crm-ui-page-head__kicker">{kicker}</p>}
        <h1 id={titleId}>{title}</h1>
        {lede && <p className="crm-ui-page-head__lede">{lede}</p>}
      </div>
      {actions && <div className="crm-ui-page-head__actions">{actions}</div>}
    </header>
  )
}
