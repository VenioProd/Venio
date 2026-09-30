import React from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import ServiceOfferLinks from '../components/ServiceOfferLinks'
import Faq from '../components/conversion/Faq'
import TrustLine from '../components/conversion/TrustLine'
import NeedStart from '../components/qualification/NeedStart'
import { FormulaThumb, InstrumentRings, useSpotlight, type FormulaKind } from '../components/graphics'
import { SITES_FAQ } from '../content/faq'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'
import '../styles/refonte-pages.css'

interface Formula {
  kind: FormulaKind
  label: string
  title: string
  text: string
  included: string[]
  to: string
}

/** Aucun prix affiché : le devis pose le périmètre, le calendrier et le prix. */
const FORMULAS: Formula[] = [
  {
    kind: 'vitrine',
    label: '01 · Vitrine',
    title: 'Se faire connaître.',
    text: "Vous voulez qu'on vous trouve, et que ça fasse sérieux.",
    included: ['Design sur mesure', 'Parfait sur mobile', 'Visible sur Google'],
    to: '/contact?besoin=site&formule=vitrine',
  },
  {
    kind: 'essentiel',
    label: '02 · Essentiel',
    title: 'Publier soi-même.',
    text: 'Vous voulez ajouter et modifier vos pages vous-même.',
    included: ['Design sur mesure', 'Mieux placé sur Google', 'Blog et actualités'],
    to: '/contact?besoin=site&formule=essentiel',
  },
  {
    kind: 'business',
    label: '03 · Business',
    title: 'Vendre et suivre ses clients.',
    text: 'Vous vendez, ou vous suivez vos clients en ligne.',
    included: ['Mieux placé sur Google', 'Espace pour vos clients', 'Paiement en ligne'],
    to: '/contact?besoin=site&formule=business',
  },
  {
    kind: 'boutique',
    label: '04 · Boutique en ligne',
    title: 'Vendre en grand.',
    text: 'Votre boutique en ligne, c’est votre métier.',
    included: ['Catalogue sans limite', 'Plusieurs moyens de paiement', 'Suivi des stocks'],
    to: '/contact?besoin=site&formule=boutique',
  },
  {
    kind: 'mesure',
    label: '05 · Sur mesure',
    title: 'Un outil rien qu’à vous.',
    text: 'L’outil dont vous avez besoin n’existe pas encore.',
    included: ['Conçu rien que pour vous', 'Connecté à vos outils', 'Plusieurs comptes et accès'],
    to: '/contact?besoin=outil&formule=mesure',
  },
]

const ServicesSites: React.FC = () => {
  useReveal('.mp-page .mp-reveal', 'mp-visible')
  const tiersRef = useSpotlight<HTMLDivElement>()

  return (
    <div className="mp-page">
      <SEO
        title="Création de site web sur mesure, sans template"
        description="Création de sites web sur mesure à Paris : 5 formules, de la vitrine à la boutique en ligne. Un site fait pour vous, qui dure dans le temps."
        keywords="site web sur mesure, création site web Paris, site web code propriétaire, webmastering, hébergement site web"
      />
      <StructuredData type="service-sites" />

      <section className="rp-hero">
        <InstrumentRings />
        <div className="mp-container">
          <p className="rp-mono rp-eb">
            <i aria-hidden="true" />
            Sites web · création sur mesure
          </p>
          <h1 className="rp-h1">
            Pas de templates. Pas de WordPress <span className="rp-acc vn-shine">qui casse dans six mois.</span>
          </h1>
          <p className="rp-lede">
            Chaque site est écrit de zéro, à partir de ce que vous avez à dire et de ce que le site doit faire. Cinq
            formules pour se repérer, un devis écrit pour décider.
          </p>
          <div className="rp-ctas vn-fx">
            <Link to="/contact?besoin=site" className="mc-btn mc-btn--primary" data-analytics-cta="sites_hero_besoin">
              Décrire mon besoin
            </Link>
            <a href="#formules" className="mc-btn mc-btn--ghost">
              Comparer les formules
            </a>
          </div>
          <div className="rp-trust">
            <TrustLine />
          </div>
        </div>
      </section>

      <section className="rp-sec">
        <div className="mp-container mp-reveal">
          <p className="rp-mono rp-eb">
            <i aria-hidden="true" />
            Pourquoi pas un modèle
          </p>
          <div className="rp-versus">
            <div className="rp-vs-col rp-vs-no">
              <span className="rp-mono">Un modèle acheté</span>
              <h3>Conçu pour tout le monde. Donc pour personne.</h3>
              <ul>
                <li>Les extensions s’empilent, une mise à jour casse quelque chose.</li>
                <li>Vos textes entrent dans des cases prévues pour d’autres.</li>
                <li>Le jour où vous voulez évoluer, il faut tout refaire.</li>
              </ul>
            </div>
            <div className="rp-vs-mid" aria-hidden="true">
              <span>VS</span>
            </div>
            <div className="rp-vs-col rp-vs-yes">
              <span className="rp-mono rp-acc">Venio</span>
              <h3>Chaque site écrit de zéro.</h3>
              <ul>
                <li>L’architecture correspond à votre besoin réel.</li>
                <li>Le code est documenté et vous appartient.</li>
                <li>N’importe quel développeur peut reprendre après nous.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="formules" className="rp-sec">
        <div className="mp-container mp-reveal">
          <p className="rp-mono rp-eb">
            <i aria-hidden="true" />
            Cinq formules
          </p>
          <h2>
            Choisissez votre point de départ <span className="rp-acc">selon ce que le site doit faire.</span>
          </h2>
          <p className="rp-sub">
            On chiffre après avoir compris le besoin. Le devis pose le périmètre, les livrables, le calendrier et le
            prix.
          </p>
          <div className="rp-tiers" ref={tiersRef}>
            {FORMULAS.map((f) => (
              <article key={f.kind} className="rp-tier vn-spot">
                <FormulaThumb kind={f.kind} />
                <span className="rp-mono">{f.label}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <ul>
                  {f.included.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Link to={f.to} className="rp-go" data-analytics-cta={`sites_formule_${f.kind}`}>
                  Cette formule →
                </Link>
              </article>
            ))}
          </div>
          <p className="rp-tier-note">
            Chaque formule peut être complétée par le webmastering : hébergement, entretien et support, pour que votre
            site reste vivant sans que vous ayez à y toucher. Dans tous les cas, le code reste le vôtre.
          </p>
        </div>
      </section>

      <section className="rp-see-also">
        <div className="mp-container">
          <ServiceOfferLinks currentPath="/services/sites" />
        </div>
      </section>

      <section className="rp-faq-sec">
        <div className="mp-container mp-reveal">
          <Faq items={SITES_FAQ} />
        </div>
      </section>

      <NeedStart preset="sites" />
    </div>
  )
}

export default ServicesSites
