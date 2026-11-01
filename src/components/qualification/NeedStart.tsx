import { Link } from 'react-router-dom'
import { useRef } from 'react'
import { useDocumentVisible } from '../../hooks/useDocumentVisible'
import { useInView } from '../../hooks/useInView'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { useI18n } from '../../context/I18nContext'
import { LineIcon } from '../graphics'
import { NEED_CARDS } from './qualification'
import './QualificationForm.css'

interface NeedStartProps {
  /** Réservé à l'analytics : identifie la page d'où part le visiteur. */
  preset?: string
}

/**
 * Bloc d'entrée du formulaire, en bas de page : six besoins, chacun un lien
 * vers /contact?besoin=… qui ouvre le formulaire à l'étape 2, réponse cochée.
 */
const NeedStart = ({ preset }: NeedStartProps) => {
  const { t } = useI18n()
  const panelRef = useRef<HTMLElement>(null)
  const inView = useInView(panelRef)
  const reducedMotion = usePrefersReducedMotion()
  const tabActive = useDocumentVisible()
  return (
    <section
      className={`qs sy-need-start sy-wrap${inView && tabActive && !reducedMotion ? ' is-animating' : ''}`}
      ref={panelRef}
      aria-labelledby="need-start-title"
      data-preset={preset || undefined}
    >
      <div className="sy-need-panel">
        <div className="sy-need-head">
          <p className="sy-eyebrow">{t('pubForms.needStart.eyebrow')}</p>
          <h2 id="need-start-title">
            {t('pubForms.needStart.titleLead')} <span className="sy-gt">{t('pubForms.needStart.titleAccent')}</span>
          </h2>
          <p className="sy-need-sub">{t('pubForms.needStart.sub')}</p>
          <p className="sy-need-trust">{t('pubForms.needStart.trust')}</p>
        </div>
        <div className="sy-need-cards">
          {NEED_CARDS.map((c) => (
            <Link
              key={c.key}
              to={`/contact?besoin=${c.key}`}
              className="sy-need-card"
              data-need={c.key}
              data-analytics-cta={`need_start_${c.key}`}
            >
              <span className="sy-need-icon" aria-hidden="true">
                <LineIcon name={c.icon} size="sm" />
              </span>
              <b>{t(c.titleKey)}</b>
              <small>{t('pubForms.needStart.startHere')}</small>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export default NeedStart
