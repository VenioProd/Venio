import { Link } from 'react-router-dom'
import './DualCta.css'

interface DualCtaProps {
  /** 'start' dans un hero aligné à gauche, 'center' en bas de page. */
  align?: 'start' | 'center'
}

/**
 * Le double appel à l'action du site public : décrire son besoin (formulaire de
 * qualification) ou voir les formules. Aucun événement d'analytics à poser
 * ici : le listener global de PublicAnalytics capte data-analytics-cta au
 * niveau du document.
 */
const DualCta = ({ align = 'start' }: DualCtaProps) => (
  <div className={`mc-dual mc-dual--${align}`}>
    <Link to="/contact" className="mc-btn mc-btn--primary" data-analytics-cta="cta_decrire_besoin">
      Décrire mon besoin
    </Link>
    <Link to="/services/sites" className="mc-btn mc-btn--ghost" data-analytics-cta="cta_voir_formules">
      Voir les formules
    </Link>
  </div>
)

export default DualCta
