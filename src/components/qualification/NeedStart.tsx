import { Link } from 'react-router-dom'
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
  return (
    <section className="qs" aria-labelledby="need-start-title" data-preset={preset || undefined}>
      <div className="qs-inner">
        <div>
          <p className="qs-eyebrow">{t('pubForms.needStart.eyebrow')}</p>
          <h2 id="need-start-title">
            {t('pubForms.needStart.titleLead')} <span>{t('pubForms.needStart.titleAccent')}</span>
          </h2>
          <p className="qs-sub">{t('pubForms.needStart.sub')}</p>
          <p className="qs-trust">{t('pubForms.needStart.trust')}</p>
        </div>
        <div className="cards">
          {NEED_CARDS.map((c) => (
            <Link
              key={c.key}
              to={`/contact?besoin=${c.key}`}
              className="card"
              data-analytics-cta={`need_start_${c.key}`}
            >
              <span className="ic">
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
