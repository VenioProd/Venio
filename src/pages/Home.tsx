import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import '../styles/monolithe-home.css'

const TIERS = [
  {
    num: '01',
    name: 'Vitrine',
    tag: 'Présence web soignée, jusqu’à 5 pages.',
    incl: ['Design sur mesure', 'Responsive mobile', 'SEO de base'],
    featured: false,
  },
  {
    num: '02',
    name: 'Essentiel',
    tag: 'Site complet avec contenu dynamique.',
    incl: ['Design sur mesure', 'SEO avancé', 'Blog & actualités'],
    featured: false,
  },
  {
    num: '03',
    name: 'Business',
    tag: 'Site pro avec fonctionnalités métier.',
    incl: ['SEO avancé + Analytics', 'Espace client', 'Paiement en ligne'],
    featured: true,
  },
  {
    num: '04',
    name: 'E-commerce',
    tag: 'Boutique en ligne scalable.',
    incl: ['Catalogue illimité', 'Paiement multi-moyens', 'Gestion des stocks'],
    featured: false,
  },
  {
    num: '05',
    name: 'Plateforme',
    tag: 'Fonctionnalités métier 100% sur mesure.',
    incl: ['Architecture sur mesure', 'Intégrations API', 'Multi-utilisateurs & rôles'],
    featured: false,
  },
]

const METIERS = [
  {
    num: '01',
    name: 'Conseil',
    to: '/services/conseil',
    tag: 'Audit sans filtre. Des décisions claires, pas des slides. Si votre stratégie est mauvaise, on vous le dit.',
    deliv: ['Audit & diagnostic', 'Stratégie IA pragmatique', 'Positionnement défendable'],
  },
  {
    num: '02',
    name: 'Développement',
    to: '/services/developpement',
    tag: 'Code propriétaire. Des architectures qui durent 10 ans, pas 6 mois. Que vos équipes peuvent maintenir.',
    deliv: ['Plateformes métier', 'SaaS scalables', 'Intégrations IA'],
  },
  {
    num: '03',
    name: 'Communication',
    to: '/services/communication',
    tag: 'Une marque qui se tient. Pas une charte PDF et trois posts. Un système qui dure et ne ressemble à personne.',
    deliv: ['Identité système', 'Ligne éditoriale', 'Direction artistique'],
  },
]

const Home = () => {
  useEffect(() => {
    const els = document.querySelectorAll('.mh-home .mh-reveal')
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('mh-visible')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="mh-home">
      <SEO
        title="Accueil"
        description="Venio construit ce qui doit exister. Sites web sur mesure, conseil stratégique, communication et branding. Pas de templates, pas de slides."
        keywords="agence digitale, site web sur mesure, développement web, communication, branding, stratégie digitale, Paris"
      />
      <StructuredData type="home" />

      {/* HERO */}
      <section id="mh-hero">
        <div className="mh-hero-lines" aria-hidden="true" />
        <div className="mh-container mh-hero-content">
          <p className="mh-hero-label">Studio digital — Paris</p>
          <h1 className="mh-hero-title">
            Construire
            <br />
            ce qui
            <br />
            <span className="mh-accent">doit</span>
            <br />
            exister
          </h1>
          <p className="mh-hero-sub">Pas ce qui rassure.</p>
          <p className="mh-hero-offer">
            <b>Sites sur mesure, conseil, marque.</b> Code propriétaire — zéro template, zéro slide.
          </p>
          <div className="mh-hero-actions">
            <a className="mh-btn mh-btn--lime" href="#mh-sites">
              Voir les offres <span className="mh-ar">↓</span>
            </a>
            <Link className="mh-link" to="/contact">
              Parlons
            </Link>
          </div>
        </div>
      </section>

      {/* MÉTHODE */}
      <section id="mh-methode">
        <div className="mh-container">
          <div className="mh-head mh-reveal">
            <span className="mh-index" aria-hidden="true">
              I
            </span>
            <span className="mh-kicker">Notre méthode</span>
          </div>
          <div className="mh-piliers">
            <div className="mh-pilier mh-reveal">
              <span className="mh-pilier-num">01</span>
              <h3 className="mh-pilier-titre">Lucidité</h3>
              <p className="mh-pilier-texte">On dit non. Souvent. La vérité est plus utile que le confort.</p>
            </div>
            <div className="mh-pilier mh-reveal">
              <span className="mh-pilier-num">02</span>
              <h3 className="mh-pilier-titre">Efficacité</h3>
              <p className="mh-pilier-texte">On ne décore pas. On structure. La forme est une conséquence.</p>
            </div>
            <div className="mh-pilier mh-reveal">
              <span className="mh-pilier-num">03</span>
              <h3 className="mh-pilier-titre">Refus du mensonge</h3>
              <p className="mh-pilier-texte">Si ça ne sert à rien, on ne le fait pas. Pas de promesses vides.</p>
            </div>
          </div>
          <div className="mh-refus mh-reveal">
            <span className="mh-refus-no">Pas de template. Pas de slides. Pas de oui complaisant.</span>
            <span className="mh-refus-yes">Construire ce qui doit exister — alors on parle.</span>
          </div>
        </div>
      </section>

      {/* SITES — offre phare */}
      <section id="mh-sites">
        <div className="mh-container">
          <div className="mh-head mh-reveal">
            <span className="mh-index" aria-hidden="true">
              II
            </span>
            <span className="mh-kicker">Sites web · l’offre</span>
          </div>
          <h2 className="mh-sites-headline mh-reveal">
            Des sites qui durent <span className="mh-accent">10 ans</span>. Pas 6 mois.
          </h2>
          <p className="mh-sites-intro mh-reveal">
            Pas de template acheté qui casse à la première mise à jour. Chaque site écrit de zéro, pensé pour vos
            besoins réels — et qui grandit avec vous. Cinq paliers selon l’ambition du projet.
          </p>

          <div className="mh-pricing">
            {TIERS.map((t) => (
              <Link
                key={t.num}
                to="/services/sites"
                className={`mh-price mh-reveal${t.featured ? ' mh-price--featured' : ''}`}
              >
                {t.featured && <span className="mh-price-badge">Le plus choisi</span>}
                <span className="mh-price-num">Palier {t.num}</span>
                <span className="mh-price-name">{t.name}</span>
                <span className="mh-price-tag">{t.tag}</span>
                <ul className="mh-price-incl">
                  {t.incl.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                <span className="mh-price-devis">Sur devis</span>
                <span className="mh-price-cta">
                  {t.name === 'Plateforme' ? 'Nous contacter' : 'Démarrer'} <span className="mh-ar">→</span>
                </span>
              </Link>
            ))}
          </div>

          <div className="mh-sites-foot mh-reveal">
            <p className="mh-webnote">
              <b>Webmastering en option sur chaque palier</b> — hébergement, mises à jour, sauvegardes, support. Votre
              site reste vivant sans que vous ayez à y toucher.
            </p>
            <Link className="mh-link" to="/services/sites">
              Le détail des offres <span className="mh-ar">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* MÉTIERS */}
      <section id="mh-metiers">
        <div className="mh-container">
          <div className="mh-head mh-reveal">
            <span className="mh-index" aria-hidden="true">
              III
            </span>
            <span className="mh-kicker">Au-delà du site</span>
          </div>
          <h2 className="mh-metiers-headline mh-reveal">Trois métiers.</h2>
          <p className="mh-metiers-intro mh-reveal">
            Quand le besoin dépasse le site. Sur devis, parce qu’aucun de ces projets ne se vend en paliers.
          </p>

          <div>
            {METIERS.map((m) => (
              <Link key={m.num} to={m.to} className="mh-metier mh-reveal">
                <span className="mh-metier-num" aria-hidden="true">
                  {m.num}
                </span>
                <div>
                  <h3 className="mh-metier-name">{m.name}</h3>
                  <p className="mh-metier-tag">{m.tag}</p>
                  <ul className="mh-metier-deliv">
                    {m.deliv.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                  <div className="mh-metier-foot">
                    <span className="mh-metier-meta">Sur devis</span>
                    <span className="mh-metier-go">
                      En parler <span className="mh-ar">→</span>
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section id="mh-cta">
        <div className="mh-container">
          <p className="mh-cta-eyebrow mh-reveal">Prochaine étape</p>
          <h2 className="mh-cta-title mh-reveal">
            Parlons<span className="mh-dot">.</span>
          </h2>
          <Link className="mh-cta-go mh-reveal" to="/contact">
            Prendre contact <span className="mh-ar">→</span>
          </Link>
        </div>
      </section>
    </div>
  )
}

export default Home
