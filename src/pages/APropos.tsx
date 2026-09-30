import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import ProofRadar from '../components/home/ProofRadar'
import NeedStart from '../components/qualification/NeedStart'
import { InstrumentRings } from '../components/graphics'
import Faq from '../components/conversion/Faq'
import { APROPOS_FAQ } from '../content/faq'
import '../styles/monolithe-pages.css'
import './APropos.css'

const POLES = [
  { name: 'Decisio', desc: 'Communication juridique', link: 'https://decisio.paris' },
  { name: 'Creatio', desc: 'Supports de cours', link: 'https://creatio.paris' },
  { name: 'Formatio', desc: 'Formations professionnelles', link: 'https://formatio.paris' },
]

const APropos = () => {
  return (
    <div className="mp-page">
      <SEO
        title="À propos — un studio digital sans détour"
        description="Venio existe parce que le marché est saturé de promesses creuses. Des consultants qui valident tout, des sites copiés-collés, des modes suivies sans réfléchir. Nous, on construit le reste."
        keywords="à propos Venio, studio digital Paris, agence sans bullshit, expertise web"
      />
      <StructuredData type="apropos" />

      <section className="ap-hero">
        <InstrumentRings />
        <div className="ap-shell ap-hero-body">
          <p className="ap-eyebrow">À propos</p>
          <h1>
            Le marché est saturé <span>de promesses creuses.</span>
          </h1>
          <p className="ap-lede">
            Des consultants qui valident tout, des sites copiés-collés, des modes suivies sans réfléchir. Venio existe
            pour faire le reste : clarifier, décider, construire.
          </p>
        </div>
      </section>

      <section className="ap-band ap-band--flush">
        <div className="ap-shell ap-manif">
          <div className="ap-plate">
            <div className="ap-plate-h">
              <h2>Ce qu’on refuse</h2>
              <span className="ap-no" aria-hidden="true">
                ✕
              </span>
            </div>
            <ul className="ap-list ap-list--no">
              <li>Le jargon marketing vide</li>
              <li>Les promesses qu’on ne peut pas tenir</li>
              <li>Les tendances suivies par mimétisme</li>
              <li>Les stratégies sans objectif concret</li>
            </ul>
          </div>
          <div className="ap-plate">
            <div className="ap-plate-h">
              <h2>Ce qu’on assume</h2>
              <span className="ap-yes" aria-hidden="true">
                ✓
              </span>
            </div>
            <ul className="ap-list ap-list--yes">
              <li>Dire non quand un projet ne sert à rien</li>
              <li>Choisir les projets qu’on prend</li>
              <li>Faire une chose à fond plutôt que tout à moitié</li>
              <li>Vous laisser repartir avec tout ce qu’on a produit</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ap-band">
        <div className="ap-shell">
          <p className="ap-eyebrow">Ce qu’on fait tourner nous-mêmes</p>
          <h2 className="ap-h2">
            On ne fait pas que livrer des sites. <span>On en fait vivre.</span>
          </h2>
          <p className="ap-sub">
            Nos propres logiciels servent tous les jours : formation, RH, comptabilité, acquisition. C’est là qu’on
            apprend ce qui marche vraiment.
          </p>
          <div className="ap-radar">
            <ProofRadar />
          </div>
        </div>
      </section>

      {/* §I — Le refus */}
      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head">
            <span className="mp-index" aria-hidden="true">
              I
            </span>
            <span className="mp-kicker">Le refus</span>
          </div>
          <div className="mp-prose">
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
          <div className="mp-head">
            <span className="mp-index" aria-hidden="true">
              II
            </span>
            <span className="mp-kicker">Notre méthode</span>
          </div>
          <div className="mp-piliers">
            <div className="mp-pilier">
              <span className="mp-pilier-num">01</span>
              <h3 className="mp-pilier-titre">Lucidité</h3>
              <p className="mp-pilier-texte">
                On regarde les choses en face et on vous dit ce qui ne va pas. Si votre plan est mauvais, on vous le
                dit.
              </p>
            </div>
            <div className="mp-pilier">
              <span className="mp-pilier-num">02</span>
              <h3 className="mp-pilier-titre">Efficacité</h3>
              <p className="mp-pilier-texte">
                On ne décore pas, on structure. Des étapes claires, des livraisons dans les temps, des choses qui
                marchent. Pas de présentations creuses.
              </p>
            </div>
            <div className="mp-pilier">
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
          <div className="mp-head">
            <span className="mp-index" aria-hidden="true">
              III
            </span>
            <span className="mp-kicker">Comment on travaille</span>
          </div>
          <div className="mp-prose">
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

      {/* §IV — Nos pôles */}
      <section id="poles" className="mp-block">
        <div className="mp-container">
          <div className="mp-head">
            <span className="mp-index" aria-hidden="true">
              IV
            </span>
            <span className="mp-kicker">Nos pôles</span>
          </div>
          <div className="mp-prose">
            <p className="mp-strong">
              Venio travaille avec trois pôles spécialisés. Pas des cases sur une plaquette : des entités dédiées à un
              seul domaine, avec une vraie expertise.
            </p>
            <p>De la profondeur, pas de la surface. On préfère faire une chose à fond plutôt que tout à moitié.</p>
          </div>

          <div style={{ marginTop: 'var(--mp-sp-l)' }}>
            {POLES.map((p) => (
              <a key={p.name} className="mp-row" href={p.link} target="_blank" rel="noopener noreferrer">
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

      {/* §V — Questions fréquentes */}
      <section className="mp-block">
        <div className="mp-container">
          <Faq items={APROPOS_FAQ} />
        </div>
      </section>

      <NeedStart preset="a-propos" />
    </div>
  )
}

export default APropos
