import type { ReactNode } from 'react'
import './crm-ui.css'

export type CrmTone = 'red' | 'amber' | 'orange' | 'green' | 'blue' | 'grey'

/** Puce d'état (« En retard », « Priorité urgente », « Validée »). */
export default function CrmChip({
  tone = 'grey',
  icon,
  dot = false,
  children,
}: {
  tone?: CrmTone
  /** Icône décorative (masquée aux lecteurs d'écran). */
  icon?: ReactNode
  /** Pastille pleine devant le texte, comme les statuts du pipeline. */
  dot?: boolean
  children: ReactNode
}) {
  return (
    <span className="crm-ui-chip" data-tone={tone}>
      {dot && <span className="crm-ui-dot" data-tone={tone} aria-hidden="true" />}
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  )
}
