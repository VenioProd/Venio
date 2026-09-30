import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import ProofRadar from '../components/home/ProofRadar'
import NeedStart from '../components/qualification/NeedStart'
import { InstrumentRings } from '../components/graphics'
import { PORTFOLIO_PROJECTS, type PortfolioCategory } from '../content/portfolioProjects'
import { useSpotlight } from '../hooks/useSpotlight'
import './Realisations.css'

type Filter = 'all' | PortfolioCategory

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Tout' },
  { key: 'site', label: 'Sites & marques' },
  { key: 'produit', label: 'Produits' },
]

const CATEGORY_LABEL: Record<PortfolioCategory, string> = {
  site: 'Site & marque',
  produit: 'Produit',
}

const Realisations = () => {
  const [activeFilter, setActiveFilter] = useState<Filter>('all')
  const gridRef = useSpotlight<HTMLDivElement>()
  const projects =
    activeFilter === 'all' ? PORTFOLIO_PROJECTS : PORTFOLIO_PROJECTS.filter((p) => p.category === activeFilter)
  const total = String(PORTFOLIO_PROJECTS.length).padStart(2, '0')

  return (
    <main className="rl-page">
      <SEO
        title="Réalisations — sites, marques et projets digitaux"
        description="Sites, identités, produits et expériences numériques signés Venio. Découvrez une sélection de réalisations publiées."
        keywords="réalisations Venio, portfolio, sites web, branding, produits numériques"
      />
      <StructuredData type="realisations" />

      <section className="rl-hero">
        <InstrumentRings />
        <div className="rl-shell rl-hero-body">
          <p className="rl-eyebrow">Réalisations</p>
          <h1>
            Comprendre avant de décorer. <span>Puis créer une vraie singularité.</span>
          </h1>
          <div className="rl-hero-bottom">
            <p className="rl-lede">
              Sites, marques et produits signés Venio. La plupart tournent en ce moment : vous pouvez aller voir.
            </p>
            <dl className="rl-stats" aria-label="Chiffres clés du portfolio">
              <div>
                <dt>{total}</dt>
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

      <section className="rl-band rl-band--radar">
        <div className="rl-shell">
          <ProofRadar />
        </div>
      </section>

      <section className="rl-band">
        <div className="rl-shell">
          <div className="rl-filters" role="group" aria-label="Filtrer les réalisations">
            {FILTERS.map((filter) => (
              <button
                className="rl-chip"
                key={filter.key}
                aria-pressed={activeFilter === filter.key}
                onClick={() => setActiveFilter(filter.key)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="rl-grid" ref={gridRef} aria-live="polite">
            {projects.map((project, index) => (
              <article className="rl-card vn-spot" key={project.slug} style={{ ['--i' as string]: index }}>
                <a
                  className="rl-cover"
                  href={project.url}
                  target="_blank"
                  rel="noreferrer"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <img src={project.desktopImage} alt="" loading="lazy" decoding="async" />
                </a>
                <div className="rl-card-body">
                  <div className="rl-card-top">
                    <span>{project.eyebrow}</span>
                    <span>{CATEGORY_LABEL[project.category]}</span>
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.description}</p>
                  <ul className="rl-tags" aria-label={`Expertises ${project.title}`}>
                    {project.tags.map((tag) => (
                      <li key={tag}>{tag}</li>
                    ))}
                  </ul>
                  <a className="rl-link" href={project.url} target="_blank" rel="noreferrer">
                    {project.linkLabel} <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            ))}
          </div>

          <p className="rl-more">
            <Link to="/contact">
              Parlons-en <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </section>

      <NeedStart preset="realisations" />
    </main>
  )
}

export const CaseStudyDetail = () => {
  useParams()
  return <Realisations />
}

export default Realisations
