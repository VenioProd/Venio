import React from 'react'
import { Link } from 'react-router-dom'
import GradientMeshBackground from '../components/GradientMeshBackground'
import NeonDivider from '../components/NeonDivider'
import NeonCorners from '../components/NeonCorners'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import './ServicesPage.css'

const ServicesCommunication = () => {
  return (
    <>
      <SEO
        title="Communication et identité de marque"
        description="Avoir un logo sur Canva, ce n'est pas avoir une marque. Identités cohérentes qui ont une colonne vertébrale. Stratégies éditoriales pensées. Pas de tendances, pas de générique. Ce qui dure."
        keywords="communication, branding, identité visuelle, stratégie éditoriale, storytelling, direction artistique"
      />
      <StructuredData type="service-communication" />
      <GradientMeshBackground />
      <div className="services-page">
        <section className="services-hero">
          <h1>COMMUNICATION & BRANDING</h1>
          <p className="services-subtitle">
            Avoir un logo sur Canva,
            <br />
            ce n&apos;est pas avoir une marque.
          </p>
        </section>

        <NeonDivider />

        <section className="services-content">
          <div className="services-section">
            <h2>Ce que le marché vous vend</h2>
            <p className="section-intro">
              Des identités visuelles. Un logo, une charte graphique en PDF, trois posts Instagram. Des stratégies
              éditoriales copiées-collées. Du storytelling générique.
            </p>
            <p className="section-intro">
              Résultat : vous ressemblez à tout le monde. Votre marque n&apos;a pas de colonne vertébrale.
            </p>
          </div>

          <div className="services-section">
            <h2>Pourquoi ça ne marche pas</h2>
            <p className="section-intro">
              Parce qu&apos;une identité visuelle sans stratégie, c&apos;est de la décoration.
            </p>
            <p className="section-intro">
              Parce que les tendances changent tous les 6 mois. Si vous les suivez, vous êtes déjà en retard. Et dans 2
              ans, votre marque sera datée.
            </p>
            <p className="section-intro">Ce qui est générique ne dure pas. Ce qui suit les modes non plus.</p>
          </div>

          <div className="services-section highlight">
            <h2>Ce que Venio construit</h2>
            <p className="section-intro">Des identités cohérentes. Qui ont une colonne vertébrale.</p>
            <ul className="services-list">
              <li>
                <strong>Identités visuelles structurées</strong>
                <br />
                Pas juste un logo. Un système visuel complet qui tient dans le temps. Typographie, couleurs, grille,
                principes de composition.
              </li>
              <li>
                <strong>Stratégies éditoriales pensées</strong>
                <br />
                Ligne éditoriale claire. Calendrier de contenu structuré. Processus de production. Quoi dire, comment le
                dire, quand le dire.
              </li>
              <li>
                <strong>Contenus qui positionnent</strong>
                <br />
                Articles de fond, études de cas, manifestes de marque. Pas du remplissage SEO. Du contenu qui affirme
                qui vous êtes.
              </li>
              <li>
                <strong>Direction artistique</strong>
                <br />
                Supervision créative de tous vos supports. Print, digital, vidéo. Cohérence visuelle sur tous les points
                de contact.
              </li>
            </ul>
          </div>

          <div className="services-section">
            <h2>Ce que ça produit</h2>
            <p className="section-intro">Une marque qui se tient. Qui ne suit pas les tendances. Qui dure.</p>
            <p className="section-intro">
              Une voix qui vous appartient. Une identité qui ne ressemble à personne d&apos;autre. Une cohérence sur
              tous vos supports.
            </p>
          </div>

          <div className="services-section">
            <h2>Pour qui</h2>
            <p className="section-intro">Pour ceux qui veulent une marque, pas un logo.</p>
            <p className="section-intro">
              Pour ceux qui refusent de ressembler à tout le monde. Pour ceux qui comprennent que la cohérence est plus
              importante que les tendances.
            </p>
            <p className="section-intro">Si vous cherchez du rapide et du tendance, ce n&apos;est pas ici.</p>
          </div>

          <NeonDivider variant="soft" />

          <div className="services-cta">
            <h2>Parlons de votre projet</h2>
            <p className="section-intro">Vous avez un projet de communication ou de branding ? Parlons-en.</p>
            <Link
              to="/contact"
              className="form-submit"
              style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}
            >
              <NeonCorners />
              <span className="form-submit-label">Nous contacter</span>
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}

export default ServicesCommunication
