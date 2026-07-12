import { Link, useParams, useSearchParams } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import {
  OFFER_IDS,
  OFFER_LABELS,
  PUBLIC_CASE_STUDIES,
  PUBLIC_TESTIMONIALS,
  type OfferId,
} from '../content/publicProofs'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'

const isOfferId = (value: string | null): value is OfferId => value !== null && OFFER_IDS.includes(value as OfferId)

const Realisations = () => {
  useReveal('.mp-page .mp-reveal', 'mp-visible')
  const [searchParams] = useSearchParams()
  const requestedOffer = searchParams.get('offre')
  const selectedOffer = isOfferId(requestedOffer) ? requestedOffer : null
  const caseStudies = selectedOffer
    ? PUBLIC_CASE_STUDIES.filter((caseStudy) => caseStudy.relatedOffers.includes(selectedOffer))
    : PUBLIC_CASE_STUDIES
  const testimonials = selectedOffer
    ? PUBLIC_TESTIMONIALS.filter((testimonial) => testimonial.relatedOffers.includes(selectedOffer))
    : PUBLIC_TESTIMONIALS

  return (
    <div className="mp-page">
      <SEO
        title="Réalisations et témoignages vérifiables — Venio"
        description="Les études de cas et témoignages Venio sont publiés uniquement avec accord client et éléments vérifiables."
        keywords="réalisations Venio, portfolio, études de cas, témoignages, références"
      />
      <StructuredData type="realisations" />

      <section className="mp-hero">
        <div className="mp-hero-lines" aria-hidden="true" />
        <div className="mp-container mp-hero-content">
          <p className="mp-eyebrow">Venio · Réalisations</p>
          <h1 className="mp-title">Des preuves, pas des promesses.</h1>
          <p className="mp-lede">Chaque preuve publiée doit être autorisée, attribuée et vérifiable.</p>
        </div>
      </section>

      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              I
            </span>
            <span className="mp-kicker">Études de cas</span>
          </div>
          <div className="mp-prose mp-reveal">
            <p className="mp-strong">
              Nous ne publions pas de cas client nominatif sans accord et sans éléments vérifiables.
            </p>
            {selectedOffer && (
              <p>
                Preuves associées au palier <b>{OFFER_LABELS[selectedOffer]}</b>.
              </p>
            )}
          </div>

          {caseStudies.length > 0 ? (
            <div className="mp-projets mp-reveal" aria-label="Études de cas publiées">
              {caseStudies.map((caseStudy) => (
                <article className="mp-projet" key={caseStudy.slug}>
                  <div>
                    <div className="mp-projet-tags">
                      {caseStudy.relatedOffers.map((offer) => (
                        <span className="mp-projet-tag" key={offer}>
                          {OFFER_LABELS[offer]}
                        </span>
                      ))}
                    </div>
                    <h2 className="mp-projet-titre">{caseStudy.title}</h2>
                    <p className="mp-projet-client">{caseStudy.clientName}</p>
                    <p className="mp-projet-desc">{caseStudy.summary}</p>
                  </div>
                  <div>
                    <Link className="mp-btn mp-projet-link" to={`/realisations/${caseStudy.slug}`}>
                      Lire l&apos;étude de cas <span className="mp-ar">→</span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mp-proof-empty mp-reveal" aria-label="Aucune étude de cas publiée">
              <span className="mp-projet-tag">Publication responsable</span>
              <h2>Études de cas à publier</h2>
              <p>
                Aucune étude de cas publique autorisée n&apos;est présente dans ce dépôt. Nous la publierons seulement
                après avoir réuni l&apos;accord écrit, le périmètre et les éléments vérifiables.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              II
            </span>
            <span className="mp-kicker">Témoignages</span>
          </div>
          {testimonials.length > 0 ? (
            <div className="mp-testimonials mp-reveal">
              {testimonials.map((testimonial) => (
                <figure className="mp-testimonial" key={`${testimonial.authorName}-${testimonial.quote}`}>
                  <blockquote>« {testimonial.quote} »</blockquote>
                  <figcaption>
                    <strong>{testimonial.authorName}</strong>, {testimonial.authorRole} — {testimonial.clientName}
                  </figcaption>
                  <div className="mp-projet-tags">
                    {testimonial.relatedOffers.map((offer) => (
                      <span className="mp-projet-tag" key={offer}>
                        {OFFER_LABELS[offer]}
                      </span>
                    ))}
                  </div>
                </figure>
              ))}
            </div>
          ) : (
            <div className="mp-proof-empty mp-reveal" aria-label="Aucun témoignage publié">
              <span className="mp-projet-tag">Attribution requise</span>
              <h2>Aucun témoignage public pour le moment</h2>
              <p>
                Nous ne publions ni avis anonyme, ni citation sans nom, fonction, organisation et validation de la
                personne citée.
              </p>
            </div>
          )}

          <div className="mp-prose mp-reveal" style={{ marginTop: 'var(--mp-sp-l)' }}>
            <p>
              Vous souhaitez vérifier l&apos;adéquation d&apos;une offre à votre besoin ? Consultez{' '}
              <Link to="/services/sites">les paliers</Link> et <Link to="/methode">notre méthode</Link>, ou{' '}
              <a href="mailto:contact@venio.paris">contactez-nous</a> pour échanger dans le cadre approprié.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}

export const CaseStudyDetail = () => {
  const { slug } = useParams()
  const caseStudy = PUBLIC_CASE_STUDIES.find((item) => item.slug === slug)

  if (!caseStudy) {
    return <Realisations />
  }

  return (
    <div className="mp-page">
      <SEO title={`${caseStudy.title} — Étude de cas | Venio`} description={caseStudy.summary} />
      <StructuredData type="realisations" />
      <section className="mp-hero">
        <div className="mp-hero-lines" aria-hidden="true" />
        <div className="mp-container mp-hero-content">
          <p className="mp-eyebrow">Venio · Étude de cas</p>
          <h1 className="mp-title">{caseStudy.title}</h1>
          <p className="mp-lede">{caseStudy.summary}</p>
        </div>
      </section>
      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-prose">
            <p className="mp-strong">Périmètre publié</p>
            <ul className="mp-case-scope">
              {caseStudy.scope.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>Offres concernées : {caseStudy.relatedOffers.map((offer) => OFFER_LABELS[offer]).join(', ')}.</p>
            <Link className="mp-btn" to="/realisations">
              Toutes les preuves <span className="mp-ar">→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Realisations
