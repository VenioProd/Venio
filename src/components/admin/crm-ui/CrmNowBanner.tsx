import type { ReactNode } from 'react'
import './crm-ui.css'

/** Bandeau « À faire maintenant » : la prochaine action, mise en avant en tête d'écran. */
export default function CrmNowBanner({
  kicker,
  icon,
  title,
  text,
  action,
  titleId,
}: {
  kicker: ReactNode
  icon?: ReactNode
  title: ReactNode
  text?: ReactNode
  /** Bouton ou lien principal (classe `crm-ui-btn crm-ui-btn--primary crm-ui-btn--big`). */
  action?: ReactNode
  titleId?: string
}) {
  return (
    <section className="crm-ui-now" aria-labelledby={titleId}>
      <div>
        <p className="crm-ui-now__kicker">
          {icon && <span aria-hidden="true">{icon}</span>}
          {kicker}
        </p>
        <h2 id={titleId}>{title}</h2>
        {text && <p className="crm-ui-now__text">{text}</p>}
      </div>
      {action}
    </section>
  )
}
