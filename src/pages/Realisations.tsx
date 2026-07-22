import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { PORTFOLIO_PROJECTS, type PortfolioFilter } from '../content/portfolioProjects'
import { useReveal } from '../hooks/useReveal'
import './Realisations.css'

const filters: Array<{ key: 'all' | PortfolioFilter; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'site', label: 'Sites & marques' },
  { key: 'product', label: 'Produits' },
  { key: 'b2b', label: 'B2B' },
]

const Realisations = () => {
  useReveal('.portfolio-page .portfolio-reveal', 'is-visible')
  const [activeFilter, setActiveFilter] = useState<'all' | PortfolioFilter>('all')
  const projects =
    activeFilter === 'all'
      ? PORTFOLIO_PROJECTS
      : PORTFOLIO_PROJECTS.filter((project) => project.filters.includes(activeFilter))

  return (
    <main className="portfolio-page">
      <SEO
        title="Réalisations — Venio"
        description="Sites, identités, produits et expériences numériques signés Venio. Découvrez une sélection de réalisations publiées."
        keywords="réalisations Venio, portfolio, sites web, branding, produits numériques"
      />
      <StructuredData type="realisations" />

      <section className="portfolio-hero">
        <div className="portfolio-shell portfolio-reveal">
          <p className="portfolio-eyebrow">Venio · Réalisations</p>
          <h1>
            Nos <span>réalisations.</span>
          </h1>
          <div className="portfolio-hero-bottom">
            <p>
              Sites identitaires, outils métier et produits numériques. Une sélection de projets réellement en ligne,
              conçus pour être clairs, crédibles et mémorables.
            </p>
            <dl className="portfolio-stats" aria-label="Chiffres clés du portfolio">
              <div>
                <dt>09</dt>
                <dd>réalisations</dd>
              </div>
              <div>
                <dt>06</dt>
                <dd>univers</dd>
              </div>
              <div>
                <dt>100%</dt>
                <dd>liens actifs</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="portfolio-selection">
        <div className="portfolio-shell">
          <div className="portfolio-selection-head portfolio-reveal">
            <div>
              <p className="portfolio-eyebrow">Travaux choisis</p>
              <h2>
                Des projets,
                <br />
                pas des promesses.
              </h2>
            </div>
            <div className="portfolio-filters" aria-label="Filtrer les réalisations">
              {filters.map((filter) => (
                <button
                  className={activeFilter === filter.key ? 'is-active' : ''}
                  key={filter.key}
                  onClick={() => setActiveFilter(filter.key)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
          <div className="portfolio-grid" aria-live="polite">
            {projects.map((project, index) => (
              <article
                className={`portfolio-card portfolio-card--${project.layout} portfolio-reveal`}
                key={project.slug}
              >
                <div className="portfolio-visual">
                  <span className="portfolio-index">{String(index + 1).padStart(2, '0')}/09</span>
                  <img
                    className="portfolio-desktop-shot"
                    src={project.desktopImage}
                    alt={`${project.title} sur ordinateur`}
                  />
                  <img className="portfolio-phone-shot" src={project.mobileImage} alt={`${project.title} sur mobile`} />
                </div>
                <div className="portfolio-card-content">
                  <div className="portfolio-card-top">
                    <span>{project.eyebrow}</span>
                    <span>2026</span>
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.description}</p>
                  <ul className="portfolio-tags" aria-label={`Expertises ${project.title}`}>
                    {project.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                  <a className="portfolio-link" href={project.url} target="_blank" rel="noreferrer">
                    {project.linkLabel} <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="portfolio-principles">
        <div className="portfolio-shell portfolio-principles-grid portfolio-reveal">
          <div>
            <p className="portfolio-eyebrow">Fil conducteur</p>
            <h2>
              Pas un style.
              <br />
              Une méthode.
            </h2>
          </div>
          <div className="portfolio-principles-list">
            <p>
              <b>01</b>
              <span>
                <strong>Comprendre avant de décorer.</strong>Chaque interface part d’un rôle, d’un contexte et d’une
                décision à rendre plus simple.
              </span>
            </p>
            <p>
              <b>02</b>
              <span>
                <strong>Créer une vraie singularité.</strong>Le design doit appartenir au projet — pas au template
                utilisé la semaine précédente.
              </span>
            </p>
            <p>
              <b>03</b>
              <span>
                <strong>Construire pour de vrai.</strong>Responsive, contenu, intégrations et exploitation : la promesse
                ne s’arrête pas à la maquette.
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="portfolio-cta">
        <div className="portfolio-shell portfolio-reveal">
          <p>Un projet qui mérite mieux qu’un site interchangeable ?</p>
          <Link to="/contact">
            Parlons-en <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  )
}

export const CaseStudyDetail = () => {
  useParams()
  return <Realisations />
}

export default Realisations
