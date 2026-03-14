import React from 'react'
import GradientMeshBackground from '../components/GradientMeshBackground'
import SEO from '../components/SEO'
import './Legal.css'

const Legal = () => {
  return (
    <>
      <SEO 
        title="Mentions Légales"
        description="Mentions légales du site Venio. Informations sur l'éditeur, l'hébergeur et les données personnelles."
        noindex={true}
      />
      <GradientMeshBackground />
      <div className="legal-page">
        <section className="legal-hero">
          <h1>MENTIONS LÉGALES</h1>
        </section>

        <section className="legal-content">
          <div className="legal-section">
            <h2>Informations légales</h2>
            <p>
              <strong>Raison sociale :</strong> Venio<br />
              <strong>Représentant légal :</strong> Raphaël BENTVELZEN<br />
              <strong>Siège social :</strong> 60 Rue François 1er, 75008 Paris, France<br />
              <strong>SIREN :</strong> 939549473<br />
              <strong>Code NAF / APE :</strong> 7022Z<br />
              <strong>Email :</strong> contact@venio.paris
            </p>
          </div>

          <div className="legal-section">
            <h2>Hebergeur</h2>
            <p>
              <strong>Ionos / 1&1</strong><br />
              Elgendorfer Str. 57, 56410 Montabaur, Allemagne<br />
              <a href="https://www.ionos.fr" target="_blank" rel="noopener noreferrer">www.ionos.fr</a>
            </p>
          </div>

          <div className="legal-section">
            <h2>Donnees personnelles</h2>
            <p>
              Conformement au Reglement General sur la Protection des Donnees (RGPD) et a la loi Informatique et Libertes,
              vous disposez d'un droit d'acces, de rectification, de suppression et de portabilite de vos donnees personnelles.
            </p>
            <p>
              Pour exercer vos droits ou pour toute question relative a vos donnees personnelles, contactez-nous a :
              <strong> contact@venio.paris</strong>
            </p>
            <p>
              Pour plus d'informations, consultez notre{' '}
              <a href="/confidentialite">politique de confidentialite</a>.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}

export default Legal

