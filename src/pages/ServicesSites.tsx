import React from 'react'
import { Link } from 'react-router-dom'
import GradientMeshBackground from '../components/GradientMeshBackground'
import NeonDivider from '../components/NeonDivider'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import SitesPricingTable from '../components/SitesPricingTable'
import './ServicesPage.css'

const ServicesSites: React.FC = () => {
  return (
    <>
      <SEO
        title="Sites Web Sur Mesure"
        description="Pas de templates. Pas de WordPress. Des sites web construits de zéro, qui tiennent dans le temps — avec ou sans webmastering."
        keywords="site web sur mesure, création site web Paris, site web code propriétaire, webmastering, hébergement site web"
      />
      <StructuredData type="service-sites" />
      <GradientMeshBackground />

      <div className="services-page">
        <section className="services-hero">
          <h1>SITES WEB</h1>
          <p className="services-subtitle">
            Pas de templates.
            <br />
            Pas de WordPress qui casse dans six mois.
          </p>
        </section>

        <NeonDivider />

        <section className="services-content">
          <div className="services-section">
            <h2>Le problème avec les solutions du marché</h2>
            <p className="section-intro">
              Un template acheté en ligne, c&apos;est conçu pour tout le monde. Donc pour personne. Les plugins
              s&apos;empilent, les mises à jour cassent quelque chose, personne ne comprend le code. Et quand vous
              voulez évoluer, vous devez tout refaire.
            </p>
            <p className="section-intro">
              Venio écrit chaque site de zéro. Architecture pensée pour vos besoins réels, code documenté, site qui peut
              grandir avec vous.
            </p>
          </div>

          <div className="services-section">
            <h2>Choisissez votre point de départ</h2>
            <p className="section-intro">
              Cinq paliers selon l&apos;ambition du projet. Chaque palier peut être complété par le webmastering —
              hébergement, entretien et support inclus, pour que votre site reste vivant sans que vous ayez à y toucher.
            </p>

            <SitesPricingTable />
          </div>
        </section>

        <NeonDivider />

        <section className="services-cta-section">
          <h2>Un projet en tête ?</h2>
          <p className="section-intro">
            Parlons-en. Pas de devis automatique, pas de formulaire en 47 étapes. Un échange direct pour comprendre ce
            dont vous avez besoin.
          </p>
          <Link to="/contact" className="services-cta-btn">
            Prendre contact
          </Link>
        </section>
      </div>
    </>
  )
}

export default ServicesSites
