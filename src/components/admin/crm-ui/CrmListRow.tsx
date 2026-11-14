import type { ReactNode } from 'react'
import './crm-ui.css'

/**
 * Ligne de liste avec actions (file de travail, analyses à valider…).
 * À placer dans un `<ul className="crm-ui-list">`.
 */
export default function CrmListRow({
  lead,
  title,
  meta,
  chips,
  description,
  actions,
  done = false,
}: {
  /** Colonne de gauche en chasse fixe : heure, retard (« −2 j »), icône. */
  lead?: ReactNode
  /** Nom cliquable de l'objet (lien vers la fiche). */
  title: ReactNode
  /** Contact ou précision, en gris après le titre. */
  meta?: ReactNode
  /** Puces d'état (`CrmChip`). */
  chips?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  done?: boolean
}) {
  return (
    <li className={`crm-ui-row${lead === undefined ? ' crm-ui-row--no-lead' : ''}${done ? ' crm-ui-row--done' : ''}`}>
      {lead !== undefined && <span className="crm-ui-row__lead">{lead}</span>}
      <div className="crm-ui-row__main">
        <div className="crm-ui-row__title">
          {title}
          {meta && <span className="crm-ui-row__meta">{meta}</span>}
          {chips}
        </div>
        {description && <div className="crm-ui-row__desc">{description}</div>}
      </div>
      {actions && <div className="crm-ui-row__actions">{actions}</div>}
    </li>
  )
}
