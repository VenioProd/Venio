import { useContext, useEffect, type ReactNode } from 'react'
import { CrmTitleSlot } from './crmTitleSlot'
import './crm-ui.css'

/** En-tête d'un écran du CRM : surtitre en chasse fixe, titre, chapô et actions. */
export default function CrmPageHead({
  title,
  kicker,
  lede,
  actions,
  titleId,
  shell = false,
}: {
  title: ReactNode
  kicker?: ReactNode
  lede?: ReactNode
  actions?: ReactNode
  titleId?: string
  /** Réservé à la coque : son titre par défaut, retiré dès qu'un écran pose le sien. */
  shell?: boolean
}) {
  const slot = useContext(CrmTitleSlot)
  useEffect(() => (shell ? undefined : slot?.register()), [slot, shell])
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
