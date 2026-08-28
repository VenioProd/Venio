import React, { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import VenioIcon, { type VenioIconName } from '../components/VenioIcon'
import { CropMarks, GrainOverlay } from '../components/BrutalDeco'
import '../styles/monolithe-home.css'

const TIERS: {
  num: string
  name: string
  icon: VenioIconName
  tag: string
  pourQui: string
  incl: string[]
  featured: boolean
}[] = [
  {
    num: '01',
    name: 'Vitrine',
    icon: 'vitrine',
    tag: 'Exister en ligne, proprement.',
    pourQui: 'Pour exister en ligne dès maintenant.',
    incl: ['Design sur mesure', 'Parfait sur mobile', 'Visible sur Google'],
    featured: false,
  },
  {
    num: '02',
    name: 'Essentiel',
    icon: 'essentiel',
    tag: 'Publier souvent, sans friction.',
    pourQui: 'Pour publier et être trouvé.',
    incl: ['Design sur mesure', 'Mieux placé sur Google', 'Blog & actualités'],
    featured: false,
  },
  {
    num: '03',
    name: 'Business',
    icon: 'business',
    tag: 'Vendre et gérer vos clients en ligne.',
    pourQui: 'Pour vendre et gérer vos clients.',
    incl: ['Mieux placé sur Google', 'Espace pour vos clients', 'Paiement en ligne'],
    featured: true,
  },
  {
    num: '04',
    name: 'E-commerce',
    icon: 'ecommerce',
    tag: 'Vendre en ligne, en grand.',
    pourQui: 'Pour un catalogue qui grossit.',
    incl: ['Catalogue sans limite', 'Plusieurs moyens de paiement', 'Suivi des stocks'],
    featured: false,
  },
  {
    num: '05',
    name: 'Plateforme',
    icon: 'plateforme',
    tag: 'Votre outil de travail. À vous, vraiment.',
    pourQui: 'Pour un métier qui ne rentre dans aucune case.',
    incl: ['Conçu rien que pour vous', 'Connecté à vos outils', 'Plusieurs comptes et accès'],
    featured: false,
  },
]

const METIERS: { num: string; name: string; icon: VenioIconName; to: string; tag: string; deliv: string[] }[] = [
  {
    num: '01',
    name: 'Conseil',
    icon: 'conseil',
    to: '/services/conseil',
    tag: 'Un état des lieux sans détour, des décisions claires — pas de jolies présentations. Si votre stratégie ne tient pas, on vous le dit en face.',
    deliv: ['État des lieux franc', "L'IA quand ça sert", 'Une place qui tient face aux concurrents'],
  },
  {
    num: '02',
    name: 'Développement',
    icon: 'developpement',
    to: '/services/developpement',
    tag: 'Un outil qui travaille comme vous — CRM, gestion, portail client. Du logiciel qui vous appartient et grandit avec vous, pas un abonnement de plus.',
    deliv: ['Outils de travail sur mesure', 'Un logiciel qui grandit avec vous', "L'IA utile au quotidien"],
  },
  {
    num: '03',
    name: 'Communication',
    icon: 'communication',
    to: '/services/communication',
    tag: 'Une marque qui se tient. Pas un PDF et trois posts : un ensemble cohérent, qui dure et ne ressemble à personne.',
    deliv: ['Une marque cohérente', 'Une voix qui vous ressemble', 'Un style qui vous va'],
  },
]

const PILIERS: { num: string; icon: VenioIconName; titre: string; texte: string }[] = [
  {
    num: '01',
    icon: 'lucidite',
    titre: 'Lucidité',
    texte: 'On dit non. Souvent. La vérité est plus utile que le confort.',
  },
  {
    num: '02',
    icon: 'efficacite',
    titre: 'Efficacité',
    texte: 'On ne décore pas. On structure. La forme est une conséquence.',
  },
  {
    num: '03',
    icon: 'refus',
    titre: 'Refus du mensonge',
    texte: 'Pas de oui de complaisance. La vérité, même quand elle coûte une vente.',
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
        title="Sites web sur mesure, conseil et marque · Paris"
        description="Studio digital à Paris. Sites web sur mesure, conseil et identité de marque — du concret, fait pour vous, pas de modèle tout fait. Parlons de votre projet."
        keywords="agence digitale, site web sur mesure, développement web, communication, branding, stratégie digitale, Paris"
      />
      <StructuredData type="home" />

      {/* HERO */}
      <section id="mh-hero">
        <div className="mh-hero-lines" aria-hidden="true" />
        <GrainOverlay opacity={0.04} />
        <CropMarks />
        <div className="mh-container mh-hero-content">
          <p className="mh-hero-label">Sites web sur mesure · Conseil · Marque — Paris</p>
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
            <b>Des sites qui vous appartiennent, du conseil qui tranche, une marque qui tient.</b> Tout sur mesure. Rien
            en stock.
          </p>
          <div className="mh-hero-actions">
            <a className="mh-btn mh-btn--lime" href="#mh-sites">
              Voir les offres <span className="mh-ar">↓</span>
            </a>
            <Link className="mh-link" to="/contact" data-analytics-cta="home_hero_contact">
              Parler de votre projet
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
          <h2 className="mh-methode-headline mh-reveal">Trois principes. Pas de discours.</h2>
          <div className="mh-piliers">
            {PILIERS.map((p) => (
              <div key={p.num} className="mh-pilier mh-reveal">
                <VenioIcon name={p.icon} size={28} className="mh-pilier-icon" />
                <span className="mh-pilier-num">{p.num}</span>
                <h3 className="mh-pilier-titre">{p.titre}</h3>
                <p className="mh-pilier-texte">{p.texte}</p>
              </div>
            ))}
          </div>
          <p className="mh-methode-close mh-reveal">Construire ce qui doit exister — le reste, on le refuse.</p>
          <Link className="mh-method-link mh-reveal" to="/methode">
            Voir les étapes, livrables et cadence <span className="mh-ar">→</span>
          </Link>
        </div>
      </section>

      {/* SITES — offre phare */}
      <section id="mh-sites">
        <div className="mh-container">
          <div className="mh-head mh-reveal">
            <span className="mh-index" aria-hidden="true">
              II
            </span>
            <span className="mh-kicker">Sites web · l'offre</span>
          </div>
          <h2 className="mh-sites-headline mh-reveal">
            Des sites qui durent <span className="mh-accent">10 ans</span>. Pas 6 mois.
          </h2>
          <p className="mh-sites-intro mh-reveal">
            Un site Venio est conçu pour votre activité et tient dans le temps. Un thème acheté, lui, casse à la
            première mise à jour — c'est même son modèle économique.
          </p>
          <p className="mh-sites-meta mh-reveal">Cinq paliers · Tous sur devis</p>

          <div className="mh-pricing">
            {TIERS.map((t) => (
              <Link
                key={t.num}
                to="/services/sites"
                className={`mh-price mh-reveal${t.featured ? ' mh-price--featured' : ''}`}
              >
                {t.featured && <span className="mh-price-badge">Le plus choisi</span>}
                <VenioIcon name={t.icon} size={26} className="mh-price-icon" />
                <span className="mh-price-num">Palier {t.num}</span>
                <span className="mh-price-name">{t.name}</span>
                <span className="mh-price-tag">{t.tag}</span>
                <ul className="mh-price-incl">
                  {t.incl.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
                <span className="mh-price-pourqui">{t.pourQui}</span>
                <span className="mh-price-cta">
                  Voir ce palier <span className="mh-ar">→</span>
                </span>
              </Link>
            ))}
          </div>

          <div className="mh-sites-foot mh-reveal">
            <p className="mh-webnote">
              <b>On s'occupe de tout, en option sur chaque palier :</b> hébergement, mises à jour, sauvegardes — et
              quelqu'un qui répond quand vous appelez. Votre site vit sans que vous y pensiez.
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
            Quand le besoin dépasse le site. Sur devis, parce qu'aucun de ces projets ne se vend en paliers.
          </p>

          <div>
            {METIERS.map((m) => (
              <Link key={m.num} to={m.to} className="mh-metier mh-reveal">
                <span className="mh-metier-num" aria-hidden="true">
                  {m.num}
                </span>
                <div>
                  <div className="mh-metier-header">
                    <VenioIcon name={m.icon} size={24} className="mh-metier-icon" />
                    <h3 className="mh-metier-name">{m.name}</h3>
                  </div>
                  <p className="mh-metier-tag">{m.tag}</p>
                  <ul className="mh-metier-deliv">
                    {m.deliv.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                  <div className="mh-metier-foot">
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
          <Link className="mh-cta-go mh-reveal" to="/contact" data-analytics-cta="home_final_contact">
            Prendre contact <span className="mh-ar">→</span>
          </Link>
          <p className="mh-cta-note mh-reveal">
            Premier échange franc : si on n'est pas les bons pour votre projet, on vous le dit — et on vous dit vers qui
            aller.
          </p>
        </div>
      </section>
    </div>
  )
}

export default Home
