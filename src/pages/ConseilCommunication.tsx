import React from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import TrustLine from '../components/conversion/TrustLine'
import NeedStart from '../components/qualification/NeedStart'
import { InstrumentRings, LineIcon, useSpotlight, type LineIconName } from '../components/graphics'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'
import '../styles/refonte-pages.css'

interface Prestation {
  index: string
  icon: LineIconName
  label: string
  title: string
  text: string
  delivered: string
  useless: string
}

const PRESTATIONS: Prestation[] = [
  {
    index: '01',
    icon: 'loupe',
    label: 'Diagnostic',
    title: 'Un état des lieux écrit',
    text: 'Ce que vous dites, à qui, où, et ce que ça coûte. Ce qui marche, ce qui coûte cher pour rien, et les décisions à prendre dans l’ordre.',
    delivered: 'état des lieux écrit',
    useless: 'Vous savez déjà quoi faire et cherchez quelqu’un pour le valider.',
  },
  {
    index: '02',
    icon: 'target',
    label: 'Positionnement',
    title: 'Une phrase que vos clients répètent',
    text: 'Positionnement, messages, preuves et ton. De quoi présenter l’entreprise de la même façon, partout.',
    delivered: 'guide de message',
    useless: 'Votre offre elle-même n’est pas arrêtée. On commence par là.',
  },
  {
    index: '03',
    icon: 'calendar',
    label: 'Plan de communication',
    title: 'Canaux, rythme, budget',
    text: 'Les canaux choisis, un rythme que votre équipe peut tenir, et la liste de ce qu’on arrête.',
    delivered: 'plan et calendrier',
    useless: 'Personne chez vous ne peut y consacrer deux heures par semaine.',
  },
  {
    index: '04',
    icon: 'megaphone',
    label: 'Contenus & réseaux',
    title: 'Une ligne éditoriale tenable',
    text: 'Sujets, formats, gabarits et calendrier. Écrits avec vous, publiables sans nous.',
    delivered: 'ligne éditoriale et gabarits',
    useless: 'Vous n’avez rien à montrer ni à raconter pour l’instant.',
  },
  {
    index: '05',
    icon: 'spark',
    label: 'Acquisition & mesure',
    title: 'Trois chiffres, chaque mois',
    text: 'Référencement, campagnes, et la règle pour décider quoi couper. Un point écrit par mois.',
    delivered: 'tableau de suivi mensuel',
    useless: 'Le site qui reçoit les visiteurs ne dit pas ce que vous faites. On le refait d’abord.',
  },
]

const CUTS: [string, string][] = [
  ['Cinq réseaux sociaux tenus à moitié', 'deux, tenus'],
  ['Une plaquette de 24 pages', 'une page claire'],
  ['Trente indicateurs dans un tableau', 'trois, regardés'],
  ['« Solutions innovantes »', 'ce que vous faites'],
]

const ConseilCommunication: React.FC = () => {
  useReveal('.mp-page .mp-reveal', 'mp-visible')
  const jobsRef = useSpotlight<HTMLDivElement>()

  return (
    <div className="mp-page">
      <SEO
        title="Conseil marketing et communication à Paris"
        description="Diagnostic, positionnement, plan de communication, contenus et mesure : cinq prestations indépendantes, chacune avec un livrable écrit que vous gardez."
        keywords="conseil marketing Paris, conseil communication Paris, stratégie de communication, positionnement, plan de communication"
      />
      <StructuredData type="conseil-communication" />

      <section className="rp-hero">
        <InstrumentRings />
        <div className="mp-container rp-hero-grid">
          <div>
            <p className="rp-mono rp-eb">
              <i aria-hidden="true" />
              Conseil marketing &amp; communication · Paris
            </p>
            <h1 className="rp-h1 rp-h1--wide">
              La plupart des communications ne servent à rien.{' '}
              <span className="rp-acc vn-shine">Ce n’est pas une fatalité.</span>
            </h1>
            <p className="rp-lede">
              On clarifie ce que vous dites, on choisit où le dire, et on coupe ce qui ne rapporte pas. Chaque étape
              produit un document que vous gardez.
            </p>
            <div className="rp-ctas vn-fx">
              <Link
                to="/contact?besoin=com"
                className="mc-btn mc-btn--primary"
                data-analytics-cta="conseil_hero_besoin"
              >
                Décrire mon besoin
              </Link>
            </div>
            <div className="rp-trust">
              <TrustLine />
            </div>
          </div>
          <div className="rp-plate">
            <div className="rp-plate-h">
              <span className="rp-mono">Ce qu’on coupe souvent</span>
              <span className="rp-mono rp-acc">Exemples</span>
            </div>
            <div className="rp-plate-b">
              {CUTS.map(([before, after]) => (
                <p key={before} className="rp-cut">
                  <s>{before}</s>
                  <span className="rp-mono rp-acc">→ {after}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="prestations" className="rp-sec">
        <div className="mp-container mp-reveal">
          <p className="rp-mono rp-eb">
            <i aria-hidden="true" />
            Cinq prestations
          </p>
          <h2>
            Elles vivent seules. <span className="rp-acc">Elles s’enchaînent si le diagnostic le justifie.</span>
          </h2>
          <div className="rp-services">
            {PRESTATIONS.map((p, i) => (
              <article key={p.index} className="rp-svc">
                <LineIcon name={p.icon} delay={i * 90} />
                <div>
                  <span className="rp-mono">
                    {p.index} · {p.label}
                  </span>
                  <h3>{p.title}</h3>
                  <p>{p.text}</p>
                  <p className="rp-liv">Livré : {p.delivered}</p>
                </div>
                <div className="rp-nope">
                  <span className="rp-mono">Inutile si</span>
                  <p>{p.useless}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="et-aussi" className="rp-sec">
        <div className="mp-container mp-reveal">
          <p className="rp-mono rp-eb">
            <i aria-hidden="true" />
            Et aussi
          </p>
          <h2>
            Deux autres métiers, <span className="rp-acc">quand il le faut.</span>
          </h2>
          <div className="rp-jobs" ref={jobsRef}>
            <Link to="/contact?besoin=marque" className="rp-job vn-spot" data-analytics-cta="conseil_job_marque">
              <LineIcon name="glyph" />
              <span className="rp-mono">Marque</span>
              <h3>Un nom, une voix, un système</h3>
              <p>De quoi écrire, décliner et tenir sans nous rappeler à chaque production.</p>
              <div className="rp-nope">
                <span className="rp-mono">Inutile si</span>
                <p>Votre problème est commercial. Une belle marque ne remplit pas un carnet vide.</p>
              </div>
              <span className="rp-go">En parler →</span>
            </Link>
            <Link to="/contact?besoin=outil" className="rp-job vn-spot" data-analytics-cta="conseil_job_outil">
              <LineIcon name="code" />
              <span className="rp-mono">Développement</span>
              <h3>L’outil que le tableur ne fait plus</h3>
              <p>Construit autour de votre façon de travailler, repris par vos équipes quand elles veulent.</p>
              <div className="rp-nope">
                <span className="rp-mono">Inutile si</span>
                <p>Un logiciel du marché couvre déjà l’essentiel. On vous dira lequel.</p>
              </div>
              <span className="rp-go">En parler →</span>
            </Link>
          </div>
        </div>
      </section>

      <NeedStart preset="conseil" />
    </div>
  )
}

export default ConseilCommunication
