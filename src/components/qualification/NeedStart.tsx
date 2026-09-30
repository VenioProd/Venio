import { Link } from 'react-router-dom'
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
const NeedStart = ({ preset }: NeedStartProps) => (
  <section className="qs" aria-labelledby="need-start-title" data-preset={preset || undefined}>
    <div className="qs-inner">
      <div>
        <p className="qs-eyebrow">Prochaine étape</p>
        <h2 id="need-start-title">
          Parlez-nous de <span>votre besoin.</span>
        </h2>
        <p className="qs-sub">
          Cinq questions, trois minutes. On vous répond sous 48 h ouvrées avec une première lecture, et on vous dit
          aussi quand ce n'est pas pour nous.
        </p>
        <p className="qs-trust">Sans engagement · Réponse sous 48 h ouvrées · Devis écrit</p>
      </div>
      <div className="cards">
        {NEED_CARDS.map((c) => (
          <Link key={c.key} to={`/contact?besoin=${c.key}`} className="card" data-analytics-cta={`need_start_${c.key}`}>
            <span className="ic">
              <LineIcon name={c.icon} size="sm" />
            </span>
            <b>{c.title}</b>
            <small>Commencer par là →</small>
          </Link>
        ))}
      </div>
    </div>
  </section>
)

export default NeedStart
