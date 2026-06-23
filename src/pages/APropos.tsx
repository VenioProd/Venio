import React from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'

const APropos = () => {
  useReveal('.mp-page .mp-reveal', 'mp-visible')

  return (
    <div className="mp-page">
      <SEO
        title="À propos — un studio digital sans détour"
        description="Venio existe parce que le marché est saturé de promesses creuses. Des consultants qui valident tout, des sites copiés-collés, des modes suivies sans réfléchir. Nous, on construit le reste."
        keywords="à propos Venio, studio digital Paris, agence sans bullshit, expertise web"
      />
      <StructuredData type="apropos" />

      <section className="mp-hero">
        <div className="mp-hero-lines" aria-hidden="true" />
        <div className="mp-container mp-hero-content">
          <p className="mp-eyebrow">Venio · À propos</p>
          <h1 className="mp-title">Pourquoi Venio existe</h1>
          <p className="mp-lede">
            <b>Le marché est saturé de promesses creuses.</b> Nous, on construit le reste.
          </p>
        </div>
      </section>

      {/* §I — Le refus */}
      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              I
            </span>
            <span className="mp-kicker">Le refus</span>
          </div>
          <div className="mp-prose mp-reveal">
            <p className="mp-strong">Venio existe parce que le marché est saturé de mensonges.</p>
            <p>
              Des conseillers qui valident tout pour facturer des mois. Des prestataires qui copient-collent un modèle
              tout fait et appellent ça du sur-mesure. Des créatifs qui suivent les modes et appellent ça de la
              stratégie.
            </p>
            <p>Venio refuse ce modèle.</p>
            <p>
              On part du principe que beaucoup de sites sont beaux mais inutiles, et que beaucoup de stratégies ne
              servent qu'à rassurer. On n'est pas là pour vous faire plaisir, cocher des cases ou flatter. On est là
              pour clarifier, structurer, décider — et obtenir des résultats qu'on peut mesurer.
            </p>
          </div>
        </div>
      </section>

      {/* §II — La méthode */}
      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              II
            </span>
            <span className="mp-kicker">Notre méthode</span>
          </div>
          <div className="mp-piliers">
            <div className="mp-pilier mp-reveal">
              <span className="mp-pilier-num">01</span>
              <h3 className="mp-pilier-titre">Lucidité</h3>
              <p className="mp-pilier-texte">
                On regarde les choses en face et on vous dit ce qui ne va pas. Si votre plan est mauvais, on vous le
                dit.
              </p>
            </div>
            <div className="mp-pilier mp-reveal">
              <span className="mp-pilier-num">02</span>
              <h3 className="mp-pilier-titre">Efficacité</h3>
              <p className="mp-pilier-texte">
                On ne décore pas, on structure. Des étapes claires, des livraisons dans les temps, des choses qui
                marchent. Pas de présentations creuses.
              </p>
            </div>
            <div className="mp-pilier mp-reveal">
              <span className="mp-pilier-num">03</span>
              <h3 className="mp-pilier-titre">Refus du mensonge</h3>
              <p className="mp-pilier-texte">
                Pas de grands mots vides, pas de promesses en l'air, pas de modes suivies pour suivre. Si ça ne sert à
                rien, on ne le fait pas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* §III — Comment on travaille */}
      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              III
            </span>
            <span className="mp-kicker">Comment on travaille</span>
          </div>
          <div className="mp-prose mp-reveal">
            <p className="mp-strong">
              Venio choisit ses projets. On dit non quand il le faut. On préfère perdre un client que perdre en
              crédibilité.
            </p>
            <p>
              Si vous cherchez quelqu'un pour exécuter sans réfléchir, ce n'est pas ici. Si vous cherchez quelqu'un pour
              valider toutes vos idées, ce n'est pas ici. Si vous cherchez quelqu'un pour vous dire la vérité et
              construire ce qui doit exister, alors oui.
            </p>
            <p>
              Côté technique : on code tout nous-mêmes, avec des outils solides et éprouvés. Pas de WordPress bricolé
              avec des modules dans tous les sens, pas de modèle tout fait. Du sur-mesure, testé, documenté, que vos
              équipes peuvent reprendre — fait pour durer dix ans, pas six mois.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mp-cta">
        <div className="mp-container">
          <h2 className="mp-cta-titre">
            Parlons<span className="mp-dot">.</span>
          </h2>
          <p className="mp-cta-texte">
            Si vous êtes arrivé jusqu'ici, c'est que vous comprenez. La suite se passe de vive voix.
          </p>
          <Link className="mp-btn" to="/contact">
            Prendre contact <span className="mp-ar">→</span>
          </Link>
        </div>
      </section>
    </div>
  )
}

export default APropos
