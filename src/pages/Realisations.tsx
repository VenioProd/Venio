import React from 'react'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'

const Realisations = () => {
  useReveal('.mp-page .mp-reveal', 'mp-visible')

  return (
    <div className="mp-page">
      <SEO
        title="Réalisations — Venio"
        description="Les réalisations Venio seront publiées uniquement avec accord client et éléments vérifiables."
        keywords="réalisations Venio, portfolio, études de cas, références"
      />
      <StructuredData type="realisations" />

      <section className="mp-hero">
        <div className="mp-hero-lines" aria-hidden="true" />
        <div className="mp-container mp-hero-content">
          <p className="mp-eyebrow">Venio · Réalisations</p>
          <h1 className="mp-title">Réalisations</h1>
          <p className="mp-lede">Du travail réel, documenté quand il peut l&apos;être.</p>
        </div>
      </section>

      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              I
            </span>
            <span className="mp-kicker">Références</span>
          </div>
          <div className="mp-prose mp-reveal">
            <p className="mp-strong">
              Nous ne publions pas de cas client nominatif sans accord et sans éléments vérifiables.
            </p>
            <p>
              La sélection publique est en cours de constitution. Elle ne comprendra que des projets autorisés par leurs
              commanditaires, avec un périmètre et des informations que nous pouvons justifier.
            </p>
          </div>

          <div className="mp-projets mp-reveal" aria-label="Études de cas">
            <article className="mp-projet">
              <div>
                <div className="mp-projet-tags">
                  <span className="mp-projet-tag">Publication responsable</span>
                </div>
                <h2 className="mp-projet-titre">Références vérifiables à venir</h2>
                <p className="mp-projet-desc">
                  Plutôt qu&apos;inventer des références, nous les publions une fois les autorisations et les preuves
                  réunies.
                </p>
              </div>
            </article>
          </div>

          <div className="mp-prose mp-reveal" style={{ marginTop: 'var(--mp-sp-l)' }}>
            <p>
              Pour discuter d&apos;un besoin, <a href="mailto:contact@venio.paris">contactez-nous</a>. Nous pourrons
              vous indiquer les références que nous sommes autorisés à partager dans ce cadre.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Realisations
