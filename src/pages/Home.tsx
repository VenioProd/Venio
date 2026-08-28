import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { GrainOverlay } from '../components/BrutalDeco'
import HomeSystemBar from '../components/home/HomeSystemBar'
import SitePlate from '../components/home/SitePlate'
import TierDial, { type HomeTier } from '../components/home/TierDial'
import ProofRadar from '../components/home/ProofRadar'
import '../styles/monolithe-home.css'

const TIERS: HomeTier[] = [
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

/* Les trois cotes du relevé. Rien d'autre n'est chiffré sur cette page :
   dix ans est une durée de vie visée, la propriété du code est contractuelle,
   la reprise est documentée — aucune des trois n'est une statistique. */
const COTES: { num: string; label: string; value: string; live?: boolean }[] = [
  { num: '01', label: 'Durée de vie visée', value: '10 ans', live: true },
  { num: '02', label: 'Propriétaire du code', value: 'Vous' },
  { num: '03', label: 'Reprise par vos équipes', value: 'Documentée' },
]

const ENGAGEMENTS: { num: string; titre: string; texte: string; cle: string; valeur: string }[] = [
  {
    num: '01',
    titre: 'On dit non par écrit',
    texte:
      'Si ce que vous demandez ne sert pas ce que vous cherchez, vous recevez un refus argumenté — avant le devis, pas après la facture.',
    cle: 'Moment',
    valeur: 'avant le devis',
  },
  {
    num: '02',
    titre: 'Le code est à vous dès le premier jour',
    texte:
      "Dépôt ouvert à votre nom, accès complets, aucune brique qu'on serait seuls à savoir manier. Si vous changez de prestataire, il n'a rien à réapprendre.",
    cle: 'Propriété',
    valeur: 'client — j+0',
  },
  {
    num: '03',
    titre: 'On chiffre ce qu’on affirme',
    texte:
      'Chaque proposition porte un prix, une date de livraison, et ce qui se passe si on la dépasse. Pas de « selon complexité », pas de forfait qui glisse.',
    cle: 'Contenu',
    valeur: 'prix + date + pénalité',
  },
]

/* La page « Au-delà du site » est ouverte par un chantier parallèle.
   En attendant, chaque métier pointe vers sa page de service actuelle ;
   les redirections 301 seront posées à la fusion. */
const METIERS: {
  num: string
  nom: string
  to: string
  titre: string
  texte: string
  inutile: string
}[] = [
  {
    num: '01',
    nom: 'Conseil',
    to: '/services/conseil',
    titre: 'Un état des lieux écrit',
    texte:
      'Ce qui marche, ce qui coûte cher pour rien, et les décisions à prendre dans l’ordre. Vous repartez avec le document, qu’on travaille ensemble ensuite ou non.',
    inutile: 'Vous savez déjà quoi faire et cherchez quelqu’un pour le valider.',
  },
  {
    num: '02',
    nom: 'Développement',
    to: '/services/developpement',
    titre: 'L’outil que le tableur ne fait plus',
    texte:
      'Quand vos procédures tiennent dans des onglets partagés que plus personne n’ose modifier. On construit l’outil autour de votre façon de travailler, pas l’inverse.',
    inutile: 'Un logiciel du marché couvre déjà l’essentiel du besoin — on vous dira lequel.',
  },
  {
    num: '03',
    nom: 'Marque',
    to: '/services/communication',
    titre: 'Un nom, une voix, un système',
    texte:
      'Pas un logo et quelques publications. De quoi écrire, décliner et tenir sans nous rappeler à chaque fois qu’il faut produire quelque chose.',
    inutile: 'Votre problème est commercial. Une belle marque ne remplit pas un carnet vide.',
  },
]

const RENDEZ_VOUS: { cle: string; valeur: string }[] = [
  { cle: 'Durée', valeur: '30 min' },
  { cle: 'Préparation demandée', valeur: 'aucune' },
  { cle: 'Adresse', valeur: 'contact@venio.paris' },
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
        title="Un site qui tient dix ans · Paris"
        description="Studio digital à Paris. Sites web et plateformes sur mesure : le code vous appartient dès le premier jour, la reprise par vos équipes est documentée, chaque proposition porte un prix, une date et une pénalité."
        keywords="site web sur mesure, plateforme métier, développement web, conseil, marque, studio digital, Paris"
      />
      <StructuredData type="home" />

      {/* ─── 01 · BANDEAU SYSTÈME ─── */}
      <HomeSystemBar />

      {/* ─── 02 · RELEVÉ ─── */}
      <section id="mh-releve">
        <GrainOverlay opacity={0.035} />
        <div className="mh-container mh-releve-grid">
          <div className="mh-releve-text">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Relevé 01 — durée de vie
            </p>
            <h1 className="mh-releve-title">
              Un site qui tient <span className="mh-accent">dix&nbsp;ans.</span>
            </h1>
            <p className="mh-releve-sub">
              Le thème n’est plus maintenu, l’agence a changé d’équipe, et plus personne ne sait où toucher sans tout
              casser. On construit l’inverse.
            </p>

            <dl className="mh-cotes">
              {COTES.map((c) => (
                <div key={c.num} className={`mh-cote${c.live ? ' mh-cote--live' : ''}`}>
                  <dt className="mh-mono">
                    <span className="mh-cote-num">{c.num}</span>
                    {c.label}
                  </dt>
                  <dd>{c.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <SitePlate />
        </div>
      </section>

      {/* ─── 03 · CADRAN DES CINQ PALIERS ─── */}
      <section id="mh-paliers">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Relevé 02 — sites web
            </p>
            <h2>
              Cinq paliers. Le vôtre dépend de <span className="mh-accent">ce que le site doit faire.</span>
            </h2>
            <p className="mh-band-note">
              Pas de ce que vous voulez montrer. Choisissez la graduation qui correspond au travail que le site doit
              vraiment abattre — le chiffrage vient après, une fois le besoin posé.
            </p>
          </header>

          <div className="mh-reveal">
            <TierDial tiers={TIERS} />
          </div>

          <p className="mh-band-foot mh-reveal">
            <Link className="mh-link" to="/services/sites">
              Le détail des cinq paliers <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </section>

      {/* ─── 04 · RADAR DE PREUVE ─── */}
      <section id="mh-preuve">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Relevé 03 — preuve
            </p>
            <h2>
              Ce qu’on construit, <span className="mh-accent">on le fait tourner.</span>
            </h2>
            <p className="mh-band-note">
              Nous n’avons pas de mur de logos à vous montrer. Nous avons des produits que nous éditons nous-mêmes, en
              production, et des sites en ligne qu’on entretient — c’est la seule preuve qui engage celui qui la donne.
            </p>
          </header>

          <div className="mh-reveal">
            <ProofRadar />
          </div>

          <p className="mh-band-foot mh-reveal">
            <Link className="mh-link" to="/realisations">
              Voir les réalisations <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </section>

      {/* ─── 05 · TROIS ENGAGEMENTS OPPOSABLES ─── */}
      <section id="mh-engagements">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Relevé 04 — engagements
            </p>
            <h2>
              Trois promesses qu’on peut <span className="mh-accent">nous opposer.</span>
            </h2>
            <p className="mh-band-note">
              Une promesse qu’on ne peut pas vérifier n’est pas une promesse. Voici les trois qui figurent dans chacun
              de nos contrats.
            </p>
          </header>

          <div className="mh-specs">
            {ENGAGEMENTS.map((e) => (
              <article key={e.num} className="mh-spec mh-reveal">
                <span className="mh-mono mh-spec-num">{e.num}</span>
                <h3>{e.titre}</h3>
                <p>{e.texte}</p>
                <p className="mh-spec-measure">
                  <span className="mh-mono">{e.cle}</span>
                  <b className="mh-mono">{e.valeur}</b>
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 06 · AU-DELÀ DU SITE ─── */}
      <section id="mh-metiers">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Relevé 05 — au-delà du site
            </p>
            <h2>
              Trois métiers, et <span className="mh-accent">quand ils ne servent à rien.</span>
            </h2>
            <p className="mh-band-note">
              Aucun ne se vend en paliers : ils dépendent trop de ce qu’on trouve en ouvrant le capot. Chacun est donc
              décrit avec le cas où il faut passer votre chemin.
            </p>
          </header>

          <div className="mh-jobs">
            {METIERS.map((m) => (
              <Link key={m.num} to={m.to} className="mh-job mh-reveal">
                <span className="mh-mono mh-job-num">
                  {m.num} — {m.nom}
                </span>
                <h3>{m.titre}</h3>
                <p>{m.texte}</p>
                <div className="mh-job-nope">
                  <span className="mh-mono">Inutile si</span>
                  <p>{m.inutile}</p>
                </div>
                <span className="mh-job-go">
                  En parler <span aria-hidden="true">→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 07 · UN APPEL DE TRENTE MINUTES ─── */}
      <section id="mh-appel">
        <div className="mh-container mh-appel-grid">
          <div className="mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Relevé 06 — prochaine étape
            </p>
            <h2>
              Un appel de <span className="mh-accent">trente minutes.</span>
            </h2>
            <p className="mh-appel-note">
              À la fin, vous saurez si on vous est utiles. Si on ne l’est pas, on vous le dit pendant l’appel et on vous
              oriente ailleurs. Ça ne vous coûte que la demi-heure.
            </p>
            <Link className="mh-cta" to="/contact" data-analytics-cta="home_final_contact">
              Réserver l’appel <span aria-hidden="true">→</span>
            </Link>
          </div>

          <dl className="mh-appel-meta mh-reveal">
            {RENDEZ_VOUS.map((r) => (
              <div key={r.cle}>
                <dt className="mh-mono">{r.cle}</dt>
                <dd className="mh-mono">{r.valeur}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  )
}

export default Home
