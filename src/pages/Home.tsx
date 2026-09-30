import { Fragment, useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { GrainOverlay } from '../components/BrutalDeco'
import { useReveal } from '../hooks/useReveal'
import { useSpotlight } from '../hooks/useSpotlight'
import { InstrumentRings, LineIcon, type LineIconName } from '../components/graphics'
import TierDial, { type HomeTier } from '../components/home/TierDial'
import ProofRadar from '../components/home/ProofRadar'
import DualCta from '../components/conversion/DualCta'
import TrustLine from '../components/conversion/TrustLine'
import Faq from '../components/conversion/Faq'
import NeedStart from '../components/qualification/NeedStart'
import { HOME_FAQ } from '../content/faq'
import '../styles/monolithe-home.css'

const TIERS: HomeTier[] = [
  {
    num: '01',
    name: 'Vitrine',
    thumb: 'vitrine',
    icon: 'vitrine',
    tag: 'Se faire connaître.',
    pourQui: "Vous voulez qu'on vous trouve, et que ça fasse sérieux.",
    incl: ['Design sur mesure', 'Parfait sur mobile', 'Visible sur Google'],
    featured: false,
  },
  {
    num: '02',
    name: 'Essentiel',
    thumb: 'essentiel',
    icon: 'essentiel',
    tag: 'Publier soi-même.',
    pourQui: 'Vous voulez ajouter et modifier vos pages vous-même.',
    incl: ['Design sur mesure', 'Mieux placé sur Google', 'Blog & actualités'],
    featured: false,
  },
  {
    num: '03',
    name: 'Business',
    thumb: 'business',
    icon: 'business',
    tag: 'Vendre et suivre ses clients.',
    pourQui: 'Vous vendez, ou vous suivez vos clients en ligne.',
    incl: ['Mieux placé sur Google', 'Espace pour vos clients', 'Paiement en ligne'],
    featured: true,
  },
  {
    num: '04',
    name: 'Boutique en ligne',
    thumb: 'boutique',
    icon: 'ecommerce',
    tag: 'Vendre en grand.',
    pourQui: "Votre boutique en ligne, c'est votre métier.",
    incl: ['Catalogue sans limite', 'Plusieurs moyens de paiement', 'Suivi des stocks'],
    featured: false,
  },
  {
    num: '05',
    name: 'Sur mesure',
    thumb: 'mesure',
    icon: 'plateforme',
    tag: "Un outil rien qu'à vous.",
    pourQui: "L'outil dont vous avez besoin n'existe pas encore.",
    incl: ['Conçu rien que pour vous', 'Connecté à vos outils', 'Plusieurs comptes et accès'],
    featured: false,
  },
]

const ARGUMENTS: { num: string; titre: string; texte: string }[] = [
  {
    num: '01',
    titre: 'Un site clair, que vos clients comprennent tout de suite',
    texte:
      'On dessine vos pages à partir de ce que vous avez à dire. Pas un modèle tout fait dans lequel on glisse vos textes.',
  },
  {
    num: '02',
    titre: 'Votre site vous appartient vraiment',
    texte:
      "Si un jour vous travaillez avec quelqu'un d'autre, tout part avec vous. N'importe quel développeur peut reprendre le travail après nous. On ne vous enferme pas dans un outil que nous seuls savons utiliser.",
  },
  {
    num: '03',
    titre: 'Rien n’est impossible parce que « l’outil ne le permet pas »',
    texte:
      'On code votre site sur mesure. Ce que vous demandez, on peut le faire. On vous dira quand même si ça ne sert à rien.',
  },
]

/* Quatre métiers hors formules. Le conseil marketing ouvre la liste : il a sa
   propre page. Les trois autres ouvrent le formulaire de contact avec le
   besoin déjà coché (?besoin=). */
const METIERS: {
  num: string
  nom: string
  to: string
  icon: LineIconName
  nouveau?: boolean
  titre: string
  texte: string
  inutile: string
}[] = [
  {
    num: '01',
    nom: 'Conseil marketing',
    to: '/conseil-communication',
    icon: 'megaphone',
    nouveau: true,
    titre: 'Un plan de communication qui tient',
    texte: 'Positionnement, messages, canaux, rythme, budget. Et la liste de ce qu’on arrête.',
    inutile: 'Votre offre elle-même n’est pas arrêtée. On commence par là.',
  },
  {
    num: '02',
    nom: 'Conseil',
    to: '/contact?besoin=flou',
    icon: 'doc',
    titre: 'Un état des lieux écrit',
    texte: 'Ce qui marche, ce qui coûte cher pour rien, et les décisions à prendre dans l’ordre.',
    inutile: 'Vous savez déjà quoi faire et cherchez quelqu’un pour le valider.',
  },
  {
    num: '03',
    nom: 'Marque',
    to: '/contact?besoin=marque',
    icon: 'glyph',
    titre: 'Un nom, une voix, un système',
    texte: 'De quoi écrire, décliner et tenir sans nous rappeler à chaque production.',
    inutile: 'Votre problème est commercial. Une belle marque ne remplit pas un carnet vide.',
  },
  {
    num: '04',
    nom: 'Développement',
    to: '/contact?besoin=outil',
    icon: 'code',
    titre: 'L’outil que le tableur ne fait plus',
    texte: 'Construit autour de votre façon de travailler, pas l’inverse.',
    inutile: 'Un logiciel du marché couvre déjà l’essentiel. On vous dira lequel.',
  },
]

/* Les trois temps d'un projet ; l'étape active avance toute seule. */
const ETAPES: { num: string; titre: string; detail: string; pole: string }[] = [
  { num: '01', titre: 'Le message', detail: 'Positionnement, ton, preuves', pole: 'Conseil' },
  { num: '02', titre: 'Le site', detail: 'Dessiné et codé pour vous', pole: 'Web' },
  { num: '03', titre: 'La diffusion', detail: 'Plan, contenus, mesure', pole: 'Communication' },
]

const TITRE = 'Sites web, plateformes et communication,'
const TITRE_ACCENT = 'à Paris.'

/** Mots du titre : chacun monte de derrière un masque, au chargement. */
const Mots = ({ texte, depart, accent = false }: { texte: string; depart: number; accent?: boolean }) => {
  const mots = texte.split(' ')
  return (
    <>
      {mots.map((mot, k) => {
        const i = { '--i': depart + k } as CSSProperties
        return (
          <Fragment key={`${mot}-${k}`}>
            <span className="mh-w">
              <span className="mh-w-in" style={i}>
                {accent ? (
                  <span className="vn-shine" style={i}>
                    {mot}
                  </span>
                ) : (
                  mot
                )}
              </span>
            </span>
            {k < mots.length - 1 && ' '}
          </Fragment>
        )
      })}
    </>
  )
}

/* Plaque « Un projet Venio » : un fil lumineux relie les trois temps et
   l'étape active passe de l'une à la suivante. Coupé si le visiteur demande
   moins de mouvement : l'étape du milieu reste alors allumée. */
const ProjectPlate = () => {
  const [live, setLive] = useState(1)

  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setLive((i) => (i + 1) % ETAPES.length), 2700)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="mh-pj vn-spot mh-intro" style={{ '--mh-i': 2 } as CSSProperties}>
      <div className="mh-pj-head">
        <span className="mh-mono">Un projet Venio</span>
        <span className="mh-mono">01 · 02 · 03</span>
      </div>
      <div className="mh-pj-body">
        <span className="mh-pj-wire" aria-hidden="true">
          <i />
        </span>
        <ol className="mh-pj-list">
          {ETAPES.map((e, k) => (
            <li key={e.num} className={k === live ? 'mh-pj-row is-live' : 'mh-pj-row'}>
              <span className="mh-pj-node">{e.num}</span>
              <div>
                <b>{e.titre}</b>
                <p className="mh-mono">{e.detail}</p>
              </div>
              <span className="mh-mono">{e.pole}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

const Home = () => {
  // Même observateur que les autres pages publiques. Le hero, lui, ne passe
  // pas par là : son entrée est une animation au chargement, jamais
  // conditionnée à un observateur qui pourrait ne pas se déclencher.
  useReveal('.mh-home .mh-reveal', 'mh-visible')
  // Halo qui suit la souris sur les panneaux marqués .vn-spot.
  const rootRef = useSpotlight<HTMLDivElement>()

  return (
    <div className="mh-home" ref={rootRef}>
      <SEO
        title="Site web, conseil marketing et communication à Paris"
        description="Studio web et conseil à Paris : sites et plateformes sur mesure, conseil marketing et plan de communication. Votre site vous appartient, tout part avec vous."
        keywords="site web sur mesure, conseil marketing, plan de communication, communication, plateforme métier, développement web, marque, studio digital, Paris"
      />
      <StructuredData type="home" />

      {/* ─── 01 · HERO ─── */}
      <section id="mh-releve">
        <InstrumentRings />
        <GrainOverlay opacity={0.035} />
        <div className="mh-container mh-releve-grid">
          <div className="mh-releve-text vn-fx">
            <p className="mh-eyebrow mh-mono mh-intro" style={{ '--mh-i': 0 } as CSSProperties}>
              <i aria-hidden="true" /> Venio · studio web et conseil à Paris
            </p>
            <h1 className="mh-releve-title">
              <Mots texte={TITRE} depart={0} /> <Mots texte={TITRE_ACCENT} depart={TITRE.split(' ').length} accent />
            </h1>
            <p className="mh-releve-sub mh-intro" style={{ '--mh-i': 2 } as CSSProperties}>
              On clarifie ce que vous avez à dire, puis on le fait savoir : un site dessiné et codé pour vous, et une
              communication qui sert à quelque chose.
            </p>

            <div className="mh-intro" style={{ '--mh-i': 3 } as CSSProperties}>
              <DualCta align="start" />
              <TrustLine />
            </div>
          </div>

          <ProjectPlate />
        </div>
      </section>

      {/* ─── 02 · CADRAN DES CINQ FORMULES ─── */}
      <section id="mh-paliers">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Sites web
            </p>
            <h2>
              Cinq formules. La vôtre dépend de <span className="vn-shine">ce que le site doit faire.</span>
            </h2>
            <p className="mh-band-note">
              Pas de ce que vous voulez montrer. Cliquez sur celle qui vous ressemble. On chiffre après, une fois qu’on
              a compris votre besoin.
            </p>
          </header>

          <div className="mh-reveal">
            <TierDial tiers={TIERS} />
          </div>

          <p className="mh-band-foot mh-reveal">
            <Link className="mh-link" to="/services/sites">
              Le détail des cinq formules <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </section>

      {/* ─── 03 · AU-DELÀ DU SITE ─── */}
      <section id="mh-metiers">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Au-delà du site
            </p>
            <h2>
              On fait aussi <span className="vn-shine">quatre autres choses.</span>
            </h2>
            <p className="mh-band-note">
              Elles ne se vendent pas en formules : ça dépend de ce qu’on trouve en ouvrant le capot. Pour chacune, on
              vous dit aussi quand ce n’est pas la bonne porte.
            </p>
          </header>

          <div className="mh-jobs">
            {METIERS.map((m, i) => (
              <Link
                key={m.num}
                to={m.to}
                className={`mh-job vn-spot mh-reveal${m.nouveau ? ' mh-job--feat' : ''}`}
                style={{ '--mh-i': i } as CSSProperties}
              >
                <span className="mh-job-head">
                  <LineIcon name={m.icon} delay={i * 80} />
                  {m.nouveau && <span className="mh-tag">Nouveau</span>}
                </span>
                <span className="mh-mono mh-job-num">
                  {m.num} · {m.nom}
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

      {/* ─── 04 · RADAR DES RÉALISATIONS ─── */}
      <section id="mh-preuve">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Nos réalisations
            </p>
            <h2>
              Nos propres sites et logiciels <span className="vn-shine">tournent tous les jours.</span>
            </h2>
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
              <i aria-hidden="true" /> Ce qui change avec nous
            </p>
            <h2>
              Trois choses qu’on vous garantit, <span className="vn-shine">et que vous pouvez vérifier.</span>
            </h2>
            <p className="mh-band-note">Elles figurent dans nos contrats, pas seulement sur cette page.</p>
          </header>

          <div className="mh-specs">
            {ARGUMENTS.map((a, i) => (
              <article key={a.num} className="mh-spec mh-reveal" style={{ '--mh-i': i } as CSSProperties}>
                <span className="mh-mono mh-spec-num">{a.num}</span>
                <h3>{a.titre}</h3>
                <p>{a.texte}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 06 · QUESTIONS FRÉQUENTES ─── */}
      <section id="mh-faq">
        <div className="mh-container mh-reveal">
          <Faq items={HOME_FAQ} />
        </div>
      </section>

      {/* NeedStart : entrée du formulaire de qualification, à la place de l'ancien « appel de trente minutes ». */}
      <NeedStart />
    </div>
  )
}

export default Home
