import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SEO from './SEO'
import StructuredData from './StructuredData'
import { CropMarks, GrainOverlay } from './BrutalDeco'
import ServiceOfferLinks from './ServiceOfferLinks'
import '../styles/monolithe-service.css'

export interface ServiceOffre {
  nom: string
  desc: string
}

export interface ServiceData {
  punch: string
  probleme_titre: string
  probleme: string[]
  offres_titre: string
  offres: ServiceOffre[]
  resultat_titre: string
  resultat: string[]
  pourqui_titre: string
  pourqui: string[]
  cta_titre: string
  cta_texte: string
  cta_label: string
}

interface ServicePageMonoProps {
  seoTitle: string
  seoDescription: string
  seoKeywords: string
  structuredDataType: string
  eyebrow: string
  title: string
  servicePath: string
  ctaTo: string
  ctaExternal?: boolean
  icon?: React.ReactNode
  data: ServiceData
}

const ROMAN = ['I', 'II', 'III']

const ServicePageMono: React.FC<ServicePageMonoProps> = ({
  seoTitle,
  seoDescription,
  seoKeywords,
  structuredDataType,
  eyebrow,
  title,
  servicePath,
  ctaTo,
  ctaExternal = false,
  icon,
  data,
}) => {
  useEffect(() => {
    const els = document.querySelectorAll('.msv-page .msv-reveal')
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('msv-visible')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  const cta = ctaExternal ? (
    <a className="msv-btn" href={ctaTo} target="_blank" rel="noopener noreferrer" data-analytics-cta="service_cta">
      {data.cta_label} <span className="msv-ar">→</span>
    </a>
  ) : (
    <Link className="msv-btn" to={ctaTo} data-analytics-cta="service_cta">
      {data.cta_label} <span className="msv-ar">→</span>
    </Link>
  )

  return (
    <div className="msv-page">
      <SEO title={seoTitle} description={seoDescription} keywords={seoKeywords} />
      <StructuredData type={structuredDataType} />

      {/* HERO */}
      <section className="msv-hero">
        <div className="msv-hero-lines" aria-hidden="true" />
        <GrainOverlay opacity={0.04} />
        <CropMarks />
        <div className="msv-container msv-hero-content">
          {icon && <div className="msv-hero-icon">{icon}</div>}
          <p className="msv-eyebrow">{eyebrow}</p>
          <h1 className="msv-title">{title}</h1>
          <p className="msv-punch">{data.punch}</p>
          {cta}
        </div>
      </section>

      {/* PROBLÈME */}
      <section className="msv-problem">
        <div className="msv-container">
          <div className="msv-head msv-reveal">
            <span className="msv-index" aria-hidden="true">
              {ROMAN[0]}
            </span>
            <span className="msv-kicker">{data.probleme_titre}</span>
          </div>
          <div className="msv-prose msv-reveal">
            {data.probleme.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      {/* OFFRES */}
      <section className="msv-offres">
        <div className="msv-container">
          <div className="msv-head msv-reveal">
            <span className="msv-index" aria-hidden="true">
              {ROMAN[1]}
            </span>
            <span className="msv-kicker">{data.offres_titre}</span>
          </div>
          <div>
            {data.offres.map((o, i) => (
              <div key={o.nom} className="msv-offre msv-reveal">
                <span className="msv-offre-num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="msv-offre-nom">{o.nom}</h3>
                  <p className="msv-offre-desc">{o.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <ServiceOfferLinks currentPath={servicePath} />
        </div>
      </section>

      {/* RÉSULTAT + POUR QUI */}
      <section className="msv-result">
        <div className="msv-container">
          <div className="msv-head msv-reveal">
            <span className="msv-index" aria-hidden="true">
              {ROMAN[2]}
            </span>
            <span className="msv-kicker">{data.resultat_titre}</span>
          </div>
          <div className="msv-reveal">
            {data.resultat[0] && <p className="msv-result-lead">{data.resultat[0]}</p>}
            {data.resultat.slice(1).map((r, i) => (
              <p key={i} className="msv-result-sub">
                {r}
              </p>
            ))}
          </div>
          <div className="msv-pourqui msv-reveal">
            <p className="msv-pourqui-titre">{data.pourqui_titre}</p>
            <ul className="msv-pourqui-list">
              {data.pourqui.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="msv-cta">
        <div className="msv-container">
          <p className="msv-cta-eyebrow">{data.cta_titre}</p>
          <h2 className="msv-cta-titre">
            Parlons<span className="msv-dot">.</span>
          </h2>
          <p className="msv-cta-texte">{data.cta_texte}</p>
          {cta}
        </div>
      </section>
    </div>
  )
}

export default ServicePageMono
