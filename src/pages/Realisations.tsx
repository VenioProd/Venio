import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import ProofRadar from '../components/home/ProofRadar'
import NeedStart from '../components/qualification/NeedStart'
import { InstrumentRings } from '../components/graphics'
import { PORTFOLIO_PROJECTS, type PortfolioCategory } from '../content/portfolioProjects'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import { useSpotlight } from '../hooks/useSpotlight'
import './Realisations.css'

type Filter = 'all' | PortfolioCategory

const FILTERS: Array<{ key: Filter; label: MessageKey }> = [
  { key: 'all', label: 'pubHome.work.filterAll' },
  { key: 'site', label: 'pubHome.work.filterSites' },
  { key: 'produit', label: 'pubHome.work.filterProducts' },
]

const CATEGORY_LABEL: Record<PortfolioCategory, MessageKey> = {
  site: 'pubHome.work.catSite',
  produit: 'pubHome.work.catProduct',
}

const Realisations = () => {
  const { t } = useI18n()
  const [activeFilter, setActiveFilter] = useState<Filter>('all')
  const gridRef = useSpotlight<HTMLDivElement>()
  const projects =
    activeFilter === 'all' ? PORTFOLIO_PROJECTS : PORTFOLIO_PROJECTS.filter((p) => p.category === activeFilter)
  const total = String(PORTFOLIO_PROJECTS.length).padStart(2, '0')

  return (
    <main className="rl-page">
      <SEO
        title={t('pubHome.work.seoTitle')}
        description={t('pubHome.work.seoDescription')}
        keywords={t('pubHome.work.seoKeywords')}
      />
      <StructuredData type="realisations" />

      <section className="rl-hero">
        <InstrumentRings />
        <div className="rl-shell rl-hero-body">
          <p className="rl-eyebrow">{t('nav.realisations')}</p>
          <h1>
            {t('pubHome.work.title')} <span>{t('pubHome.work.titleAccent')}</span>
          </h1>
          <div className="rl-hero-bottom">
            <p className="rl-lede">{t('pubHome.work.lede')}</p>
            <dl className="rl-stats" aria-label={t('pubHome.work.statsLabel')}>
              <div>
                <dt>{total}</dt>
                <dd>{t('pubHome.work.statWorks')}</dd>
              </div>
              <div>
                <dt>06</dt>
                <dd>{t('pubHome.work.statUniverses')}</dd>
              </div>
              <div>
                <dt>100%</dt>
                <dd>{t('pubHome.work.statLinks')}</dd>
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
          <div className="rl-filters" role="group" aria-label={t('pubHome.work.filtersLabel')}>
            {FILTERS.map((filter) => (
              <button
                className="rl-chip"
                key={filter.key}
                aria-pressed={activeFilter === filter.key}
                onClick={() => setActiveFilter(filter.key)}
                type="button"
              >
                {t(filter.label)}
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
                    <span>{t(CATEGORY_LABEL[project.category])}</span>
                  </div>
                  <h3>{project.title}</h3>
                  <p>{project.description}</p>
                  <ul className="rl-tags" aria-label={t('pubHome.work.tagsLabel', { title: project.title })}>
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
              {t('pubHome.work.more')} <span aria-hidden="true">→</span>
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
