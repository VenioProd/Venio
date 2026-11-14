import type { ReactNode } from 'react'
import './crm-ui.css'

/** État vide d'une liste : icône, titre, explication et action éventuelle. */
export default function CrmEmpty({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="crm-ui-empty">
      {icon && <span aria-hidden="true">{icon}</span>}
      <span className="crm-ui-empty__title">{title}</span>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
