import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { GrainOverlay } from '../components/BrutalDeco'
import SitePlate from '../components/home/SitePlate'
import TierDial, { type HomeTier } from '../components/home/TierDial'
import ProofRadar from '../components/home/ProofRadar'
import '../styles/monolithe-home.css'

const TIERS: HomeTier[] = [
  {
    num: '01',
    name: 'Vitrine',
    icon: 'vitrine',
    tag: 'Se faire connaître.',
    pourQui: "Vous voulez qu'on vous trouve, et que ça fasse sérieux.",
    incl: ['Design sur mesure', 'Parfait sur mobile', 'Visible sur Google'],
    featured: false,
  },
  {
    num: '02',
    name: 'Essentiel',
    icon: 'essentiel',
    tag: 'Publier soi-même.',
    pourQui: 'Vous voulez ajouter et modifier vos pages vous-même.',
    incl: ['Design sur mesure', 'Mieux placé sur Google', 'Blog & actualités'],
    featured: false,
  },
  {
    num: '03',
    name: 'Business',
    icon: 'business',
    tag: 'Vendre et suivre ses clients.',
    pourQui: 'Vous vendez, ou vous suivez vos clients en ligne.',
    incl: ['Mieux placé sur Google', 'Espace pour vos clients', 'Paiement en ligne'],
    featured: true,
  },
  {
    num: '04',
    name: 'Boutique en ligne',
    icon: 'ecommerce',
    tag: 'Vendre en grand.',
    pourQui: "Votre boutique en ligne, c'est votre métier.",
    incl: ['Catalogue sans limite', 'Plusieurs moyens de paiement', 'Suivi des stocks'],
    featured: false,
  },
  {
    num: '05',
    name: 'Sur mesure',
    icon: 'plateforme',
    tag: "Un outil rien qu'à vous.",
    pourQui: "L'outil dont vous avez besoin n'existe pas encore.",
    incl: ['Conçu rien que pour vous', 'Connecté à vos outils', 'Plusieurs comptes et accès'],
    featured: false,
  },
]

/* Les trois repères du haut de page annoncent les trois arguments
   développés plus bas. Aucun chiffre : rien ici n'est une statistique. */
const REPERES: { num: string; label: string; value: string; live?: boolean }[] = [
  { num: '01', label: 'Le design', value: 'Dessiné pour vous', live: true },
  { num: '02', label: 'Le code', value: 'Il vous appartient' },
  { num: '03', label: 'Vos demandes', value: "Rien n'est bloqué" },
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
  { cle: 'Durée', valeur: '30 minutes' },
  { cle: 'À préparer', valeur: 'Rien' },
  { cle: 'Par écrit', valeur: 'contact@venio.paris' },
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
        title="Site web sur mesure à Paris · Venio"
        description="On dessine et on code votre site à partir de ce que vous avez à dire, pas à partir d'un modèle. Le site vous appartient : n'importe quel développeur peut le reprendre après nous."
        keywords="site web sur mesure, plateforme métier, développement web, conseil, marque, studio digital, Paris"
      />
      <StructuredData type="home" />

      {/* ─── 02 · RELEVÉ ─── */}
      <section id="mh-releve">
        <GrainOverlay opacity={0.035} />
        <div className="mh-container mh-releve-grid">
          <div className="mh-releve-text">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Venio — studio web à Paris
            </p>
            <h1 className="mh-releve-title">
              Un site fait pour vous. <span className="mh-accent">Pas pour tout le monde.</span>
            </h1>
            <p className="mh-releve-sub">
              On dessine et on code votre site à partir de ce que vous avez à dire. Pas à partir d’un modèle acheté dans
              lequel on glisserait vos textes.
            </p>

            <dl className="mh-cotes">
              {REPERES.map((c) => (
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
              <i aria-hidden="true" /> Sites web
            </p>
            <h2>
              Cinq formules. La vôtre dépend de <span className="mh-accent">ce que le site doit faire.</span>
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

      {/* ─── 04 · RADAR DE PREUVE ─── */}
      <section id="mh-preuve">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> Nos réalisations
            </p>
            <h2>
              Nos propres sites et logiciels <span className="mh-accent">tournent tous les jours.</span>
            </h2>
            <p className="mh-band-note">
              On ne fait pas que livrer des sites : on en fait vivre. Voilà ce qu’on a construit, et qui fonctionne en
              ce moment. Vous pouvez aller voir.
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
              <i aria-hidden="true" /> Ce qui change avec nous
            </p>
            <h2>
              Trois choses qu’on vous garantit, <span className="mh-accent">et que vous pouvez vérifier.</span>
            </h2>
            <p className="mh-band-note">Elles figurent dans nos contrats, pas seulement sur cette page.</p>
          </header>

          <div className="mh-specs">
            {ARGUMENTS.map((a) => (
              <article key={a.num} className="mh-spec mh-reveal">
                <span className="mh-mono mh-spec-num">{a.num}</span>
                <h3>{a.titre}</h3>
                <p>{a.texte}</p>
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
              <i aria-hidden="true" /> Au-delà du site
            </p>
            <h2>
              On fait aussi <span className="mh-accent">trois autres choses.</span>
            </h2>
            <p className="mh-band-note">
              Elles ne se vendent pas en formules : ça dépend trop de ce qu’on trouve en ouvrant le capot. Pour chacune,
              on vous dit aussi quand il ne faut pas nous appeler.
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
              <i aria-hidden="true" /> Prochaine étape
            </p>
            <h2>
              Un appel de <span className="mh-accent">trente minutes.</span>
            </h2>
            <p className="mh-appel-note">
              À la fin, vous saurez si on peut vous aider. Si on ne peut pas, on vous le dit pendant l’appel et on vous
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
