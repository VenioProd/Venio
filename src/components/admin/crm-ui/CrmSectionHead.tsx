import type { ReactNode } from 'react'
import type { CrmTone } from './CrmChip'
import './crm-ui.css'

/**
 * En-tête de section avec compteur. `compact` donne le titre de groupe des
 * listes (« En retard 3 ») ; sinon titre de carte (« Votre séance »).
 */
export default function CrmSectionHead({
  title,
  count,
  sub,
  tone,
  actions,
  id,
  level = 2,
  compact = false,
}: {
  title: ReactNode
  /** Compteur réel ; n'en passer aucun quand la donnée n'existe pas. */
  count?: number | string
  sub?: ReactNode
  /** Pastille de couleur devant le titre. */
  tone?: CrmTone
  actions?: ReactNode
  id?: string
  level?: 2 | 3
  compact?: boolean
}) {
  const Heading = level === 2 ? 'h2' : 'h3'
  return (
    <div className={`crm-ui-section-head${compact ? ' crm-ui-section-head--compact' : ''}`}>
      <Heading className="crm-ui-section-head__title" id={id}>
        {tone && <span className="crm-ui-dot" data-tone={tone} aria-hidden="true" />}
        {title}
        {count !== undefined && (
          <>
            {' '}
            <span className="crm-ui-section-head__count">{count}</span>
          </>
        )}
      </Heading>
      {sub && <span className="crm-ui-section-head__sub">{sub}</span>}
      {actions && <div className="crm-ui-section-head__actions">{actions}</div>}
    </div>
  )
}
