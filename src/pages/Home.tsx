import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import '../styles/monolithe-home.css'

const TIERS = [
  {
    num: '01',
    name: 'Vitrine',
    tag: 'Exister en ligne, proprement.',
    incl: ['Design sur mesure', 'Parfait sur mobile', 'Visible sur Google'],
    featured: false,
  },
  {
    num: '02',
    name: 'Essentiel',
    tag: 'Publier et faire vivre votre contenu.',
    incl: ['Design sur mesure', 'Mieux placé sur Google', 'Blog & actualités'],
    featured: false,
  },
  {
    num: '03',
    name: 'Business',
    tag: 'Vendre et gérer vos clients en ligne.',
    incl: ['Mieux placé sur Google', 'Espace pour vos clients', 'Paiement en ligne'],
    featured: true,
  },
  {
    num: '04',
    name: 'E-commerce',
    tag: 'Vendre en ligne, en grand.',
    incl: ['Catalogue sans limite', 'Plusieurs moyens de paiement', 'Suivi des stocks'],
    featured: false,
  },
  {
    num: '05',
    name: 'Plateforme',
    tag: 'Votre outil de travail, rien qu’à vous.',
    incl: ['Conçu rien que pour vous', 'Connecté à vos outils', 'Plusieurs comptes et accès'],
    featured: false,
  },
]

const METIERS = [
  {
    num: '01',
    name: 'Conseil',
    to: '/services/conseil',
    tag: 'Un état des lieux sans détour. Des décisions claires, pas de jolies présentations. Si votre stratégie ne tient pas, on vous le dit en face.',
    deliv: ['État des lieux franc', 'L’IA quand ça sert', 'Une place qui tient face aux concurrents'],
  },
  {
    num: '02',
    name: 'Développement',
    to: '/services/developpement',
    tag: 'Un site qui vous appartient. Solide, fait pour durer dix ans, pas six mois. Et que vos équipes peuvent reprendre quand elles veulent.',
    deliv: ['Outils de travail sur mesure', 'Un logiciel qui grandit avec vous', 'L’IA utile au quotidien'],
  },
  {
    num: '03',
    name: 'Communication',
    to: '/services/communication',
    tag: 'Une marque qui se tient. Pas un PDF et trois posts. Un ensemble cohérent qui dure et ne ressemble à personne.',
    deliv: ['Une marque cohérente', 'Une voix qui vous ressemble', 'Un style qui vous va'],
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
            <b>Un site web rien qu’à vous, du conseil, une marque qui tient.</b> Fait sur mesure — jamais un modèle tout
            fait, jamais des présentations qui sonnent creux.
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
            <span className="mh-refus-no">
              Pas de modèle tout fait. Pas de présentation creuse. Pas de oui pour vous faire plaisir.
            </span>
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
            Pas un modèle acheté qui se casse à la première mise à jour. Chaque site est fait pour vous, à partir de vos
            vrais besoins — et il grandit en même temps que votre activité. Cinq formules, selon l’ambition du projet.
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
              <b>On s’occupe de tout, en option sur chaque formule :</b> on héberge votre site, on le met à jour, on le
              sauvegarde et on répond quand vous avez une question. Votre site reste vivant sans que vous ayez à y
              toucher.
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
