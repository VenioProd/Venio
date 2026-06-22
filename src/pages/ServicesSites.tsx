import React from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import SitesPricingTable from '../components/SitesPricingTable'
import '../styles/monolithe-sites.css'

const ServicesSites: React.FC = () => {
  return (
    <div className="ms-page">
      <SEO
        title="Sites Web Sur Mesure"
        description="Pas de templates. Pas de WordPress. Des sites web construits de zéro, qui tiennent dans le temps — avec ou sans webmastering."
        keywords="site web sur mesure, création site web Paris, site web code propriétaire, webmastering, hébergement site web"
      />
      <StructuredData type="service-sites" />

      <section className="ms-hero">
        <div className="ms-container">
          <p className="ms-eyebrow">Sites web</p>
          <h1>Sites web</h1>
          <p className="ms-hero-sub">Pas de templates. Pas de WordPress qui casse dans six mois.</p>
          <p className="ms-hero-offer">
            <b>Chaque site écrit de zéro.</b> Code propriétaire, architecture pensée pour durer 10 ans — pas 6 mois.
          </p>
        </div>
      </section>

      <section className="ms-block">
        <div className="ms-container ms-twocol">
          <span className="ms-kicker">§ I — Le problème</span>
          <div className="ms-prose">
            <h2>Conçu pour tout le monde. Donc pour personne.</h2>
            <p>
              Un template acheté en ligne, c’est conçu pour tout le monde. Les plugins s’empilent, les mises à jour
              cassent quelque chose, personne ne comprend le code. Et quand vous voulez évoluer, vous devez tout
              refaire.
            </p>
            <p>
              <b>Venio écrit chaque site de zéro.</b> Architecture pensée pour vos besoins réels, code documenté, site
              qui peut grandir avec vous.
            </p>
          </div>
        </div>
      </section>

      <section className="ms-offer">
        <div className="ms-container">
          <span className="ms-kicker">§ II — Les paliers</span>
          <h2 className="ms-offer-headline">Choisissez votre point de départ.</h2>
          <p className="ms-offer-intro">
            Cinq paliers selon l’ambition du projet. Chaque palier peut être complété par le webmastering — hébergement,
            entretien et support inclus, pour que votre site reste vivant sans que vous ayez à y toucher.
          </p>

          <SitesPricingTable />
        </div>
      </section>

      <section className="ms-cta">
        <div className="ms-container">
          <p className="ms-cta-eyebrow">Un projet en tête ?</p>
          <h2 className="ms-cta-title">
            Parlons<span>.</span>
          </h2>
          <p className="ms-cta-sub">
            Pas de devis automatique, pas de formulaire en 47 étapes. Un échange direct pour comprendre ce dont vous
            avez besoin.
          </p>
          <Link to="/contact" className="ms-cta-go">
            Prendre contact →
          </Link>
        </div>
      </section>
    </div>
  )
}

export default ServicesSites
