import { Link } from 'react-router-dom'
import './CTAFinal.css'

const CTAFinal = () => {
  return (
    <section className="cta-final">
      <div className="cta-final-container">
        <Link to="/contact" className="cta-final-btn cta-final-btn-primary">
          Parlons. Sans filtre.
        </Link>
        <Link to="/realisations" className="cta-final-btn cta-final-btn-outline">
          Voir nos réalisations
        </Link>
      </div>
    </section>
  )
}

export default CTAFinal

