import React from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import ServiceOfferLinks from '../components/ServiceOfferLinks'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'

interface Metier {
  id: string
  index: string
  kicker: string
  titre: string
  livre: string
  inutile: string
}

const METIERS: Metier[] = [
  {
    id: 'conseil',
    index: 'I',
    kicker: 'Conseil stratégique',
    titre: 'Conseil',
    livre: `Ce qui marche, ce qui coûte cher pour rien, et les trois décisions à prendre dans l'ordre.`,
    inutile: `Vous savez déjà quoi faire et cherchez quelqu'un pour le valider.`,
  },
  {
    id: 'developpement',
    index: 'II',
    kicker: 'Développeur à Paris',
    titre: 'Développement',
    livre: `L'outil que le tableur ne fait plus. Construit autour de votre façon de travailler, repris par vos équipes quand elles veulent.`,
    inutile: `Un logiciel du marché couvre 80 % du besoin — on vous dira lequel.`,
  },
  {
    id: 'marque',
    index: 'III',
    kicker: 'Agence communication à Paris',
    titre: 'Marque',
    livre: `Un nom, une voix, un système. De quoi écrire, décliner et tenir sans nous rappeler à chaque production.`,
    inutile: `Votre problème est commercial. Une belle marque ne remplit pas un carnet vide.`,
  },
]

const AuDelaDuSite = () => {
  useReveal('.mp-page .mp-reveal', 'mp-visible')

  return (
    <div className="mp-page">
      <SEO
        title="Au-delà du site : conseil, développeur et agence communication à Paris"
        description="Le site est le cœur. Autour : conseil stratégique, développeur sur mesure et agence communication à Paris. Trois métiers qu'on active seulement si vous en avez besoin."
        keywords="conseil stratégique Paris, développeur Paris, agence communication Paris, audit digital, identité de marque"
      />
      <StructuredData type="au-dela-du-site" />

      <section className="mp-hero">
        <div className="mp-hero-lines" aria-hidden="true" />
        <div className="mp-container mp-hero-content">
          <p className="mp-eyebrow">Venio · Au-delà du site</p>
          <h1 className="mp-title">Au-delà du site</h1>
          <p className="mp-lede">
            <b>Le site, c'est le cœur.</b> Ce qu'il y a autour, trois métiers qu'on active seulement si vous en avez
            besoin.
          </p>
          <nav className="mp-jumpnav" aria-label="Métiers">
            {METIERS.map((m) => (
              <a key={m.id} href={`#${m.id}`}>
                {m.titre}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {METIERS.map((m) => (
        <section key={m.id} id={m.id} className="mp-block">
          <div className="mp-container">
            <div className="mp-head mp-reveal">
              <span className="mp-index" aria-hidden="true">
                {m.index}
              </span>
              <span className="mp-kicker">{m.kicker}</span>
            </div>
            <div className="mp-prose mp-reveal">
              <p className="mp-strong">{m.livre}</p>
            </div>
            <p className="mp-inutile mp-reveal">
              <span className="mp-inutile-label">Inutile si</span> {m.inutile}
            </p>
          </div>
        </section>
      ))}

      <section className="mp-block">
        <div className="mp-container">
          <ServiceOfferLinks currentPath="/au-dela-du-site" />
        </div>
      </section>

      <section className="mp-cta">
        <div className="mp-container">
          <h2 className="mp-cta-titre">
            Parlons<span className="mp-dot">.</span>
          </h2>
          <p className="mp-cta-texte">
            Un projet de conseil, de développement ou de marque ? Dites-nous où vous en êtes, on vous répond en face.
          </p>
          <Link className="mp-btn" to="/contact" data-analytics-cta="au_dela_du_site_final_contact">
            Prendre contact <span className="mp-ar">→</span>
          </Link>
        </div>
      </section>
    </div>
  )
}

export default AuDelaDuSite
