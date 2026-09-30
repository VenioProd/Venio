import { Link, useLocation } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import QualificationForm from '../components/qualification/QualificationForm'
import '../styles/monolithe-pages.css'
import './Contact.css'

const Contact = () => {
  const location = useLocation()

  return (
    <div className="mp-page">
      <SEO
        title="Contact — décrivez votre besoin"
        description="Cinq questions courtes, trois minutes. On répond sous 48 h ouvrées avec une première lecture de votre besoin, et on vous dit aussi quand ce n'est pas pour nous."
        keywords="contact Venio, devis site web Paris, décrire mon besoin, projet web"
      />
      <StructuredData type="contact" />

      <section className="mp-hero mp-contact-hero">
        <div className="mp-hero-lines" aria-hidden="true" />
        <div className="mp-container mp-hero-content">
          <p className="mp-eyebrow">Venio · Contact</p>
          <h1 className="mp-title mp-contact-title">
            Dites-nous ce que vous voulez <span className="mp-accent">construire.</span>
          </h1>
          <p className="mp-lede">
            Cinq questions courtes, trois minutes. On répond sous 48 h ouvrées avec une première lecture de votre
            besoin. Si ce n'est pas pour nous, on vous le dit aussi.
          </p>
        </div>
      </section>

      <section className="mp-contact-body">
        <div className="mp-container">
          {/* La clé relance le formulaire quand un lien /contact?besoin=… est suivi depuis la page elle-même. */}
          <QualificationForm key={location.search} />
          <p className="mp-contact-direct">
            Vous préférez écrire directement ? <a href="mailto:contact@venio.paris">contact@venio.paris</a> · Vos
            données ne servent qu'à vous répondre, voir la{' '}
            <Link to="/confidentialite">politique de confidentialité</Link>.
          </p>
        </div>
      </section>
    </div>
  )
}

export default Contact
