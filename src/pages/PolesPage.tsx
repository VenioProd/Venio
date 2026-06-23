import React from 'react'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'

const POLES = [
  { name: 'Decisio', desc: 'Communication juridique', link: 'https://decisio.paris' },
  { name: 'Creatio', desc: 'Supports de cours', link: 'https://creatio.paris' },
  { name: 'Formatio', desc: 'Formations professionnelles', link: 'https://formatio.paris' },
]

const PolesPage = () => {
  useReveal('.mp-page .mp-reveal', 'mp-visible')

  return (
    <div className="mp-page">
      <SEO
        title="Nos pôles : Decisio, Creatio, Formatio"
        description="Trois pôles spécialisés à côté de Venio : Decisio (communication juridique), Creatio (supports de cours), Formatio (formations). Une vraie expertise par domaine, pas du marketing."
        keywords="Decisio, Creatio, Formatio, communication juridique, supports de cours, formations professionnelles"
      />
      <StructuredData type="poles" />

      <section className="mp-hero">
        <div className="mp-hero-lines" aria-hidden="true" />
        <div className="mp-container mp-hero-content">
          <p className="mp-eyebrow">Venio · Nos pôles</p>
          <h1 className="mp-title">Trois pôles</h1>
          <p className="mp-lede">
            <b>Trois spécialisations.</b> Pas de généralisme.
          </p>
        </div>
      </section>

      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              I
            </span>
            <span className="mp-kicker">Des entités, pas du marketing</span>
          </div>
          <div className="mp-prose mp-reveal">
            <p className="mp-strong">
              Venio travaille avec trois pôles spécialisés. Pas des cases sur une plaquette : des entités dédiées à un
              seul domaine, avec une vraie expertise.
            </p>
            <p>De la profondeur, pas de la surface. On préfère faire une chose à fond plutôt que tout à moitié.</p>
          </div>

          <div style={{ marginTop: 'var(--mp-sp-l)' }}>
            {POLES.map((p) => (
              <a key={p.name} className="mp-row mp-reveal" href={p.link} target="_blank" rel="noopener noreferrer">
                <div>
                  <div className="mp-row-name">{p.name}</div>
                  <div className="mp-row-desc">{p.desc}</div>
                </div>
                <span className="mp-row-go">
                  Voir le site <span className="mp-ar">↗</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default PolesPage
