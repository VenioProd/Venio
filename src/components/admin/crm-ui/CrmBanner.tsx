import type { ReactNode } from 'react'
import type { CrmTone } from './CrmChip'
import './crm-ui.css'

/** Bandeau d'information coloré (explication, alerte, confirmation). */
export default function CrmBanner({
  tone = 'blue',
  icon,
  title,
  children,
  actions,
  role,
}: {
  tone?: CrmTone
  icon?: ReactNode
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  /** `status` ou `alert` quand le bandeau annonce un changement. */
  role?: 'status' | 'alert'
}) {
  return (
    <div className="crm-ui-banner" data-tone={tone} role={role}>
      {icon && <span aria-hidden="true">{icon}</span>}
      <div>
        <strong className="crm-ui-banner__title">{title}</strong>
        {children && <p className="crm-ui-banner__text">{children}</p>}
        {actions && <div className="crm-ui-banner__actions">{actions}</div>}
      </div>
    </div>
  )
}
