import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import NeedStart from '../components/qualification/NeedStart'
import { InstrumentRings } from '../components/graphics'
import Faq from '../components/conversion/Faq'
import { METHODE_FAQ } from '../content/faq'
import { useEffect, useRef } from 'react'
import './Methode.css'

const STEPS = [
  {
    number: '01',
    title: 'Cadrer',
    cadence: 'Un atelier de lancement, puis une restitution sous 2 à 5 jours ouvrés.',
    deliverables: ['Note de cadrage', 'Périmètre priorisé', 'Hypothèses, dépendances et planning'],
  },
  {
    number: '02',
    title: 'Concevoir',
    cadence: 'Validation par jalon ; les retours sont regroupés pour garder le rythme.',
    deliverables: ['Architecture des contenus', 'Parcours clés', 'Direction visuelle et maquettes'],
  },
  {
    number: '03',
    title: 'Construire',
    cadence: 'Point d’avancement hebdomadaire pendant la production.',
    deliverables: ['Site ou produit développé', 'Intégrations prévues au périmètre', 'Environnement de recette'],
  },
  {
    number: '04',
    title: 'Recetter',
    cadence: 'Une phase de recette guidée avant la mise en ligne.',
    deliverables: ['Liste de vérifications', 'Corrections de recette', 'Plan de mise en ligne'],
  },
  {
    number: '05',
    title: 'Transmettre',
    cadence: 'Passation à la livraison ; suivi continu uniquement si le webmastering est retenu.',
    deliverables: ['Accès et documentation utile', 'Prise en main', 'Cadre de support, si souscrit'],
  },
]

const FACTORS = [
  { title: 'Les contenus', text: 'Textes et photos fournis ou à produire' },
  { title: 'Les validations', text: 'Une personne qui décide, ou un comité' },
  { title: 'Les intégrations', text: 'Paiement, CRM, outils existants' },
  { title: 'Le périmètre', text: 'Ce qui s’ajoute en cours de route' },
]

/** Allume chaque nœud quand son étape atteint le tiers haut de l'écran. */
const useLitNodes = () => {
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('li[data-step]') ?? [])
    const lightAll = () => items.forEach((el) => el.classList.add('is-lit'))
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      lightAll()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-lit')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.35, rootMargin: '0px 0px -12% 0px' },
    )
    items.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return listRef
}

const Methode = () => {
  const timelineRef = useLitNodes()

  return (
    <div className="mt-page">
      <SEO
        title="Méthode de travail — étapes, livrables et cadence"
        description="Découvrez comment Venio cadre, conçoit, construit, recette et transmet un projet web : étapes, livrables et rythme de travail."
        keywords="méthode projet web, livrables site web, cadence projet digital, Venio"
      />
      <StructuredData type="method" />

      <section className="mt-hero">
        <InstrumentRings />
        <div className="mt-shell mt-hero-body">
          <p className="mt-eyebrow">Méthode</p>
          <h1>
            Faire avancer un projet, <span>sans brouillard.</span>
          </h1>
          <p className="mt-lede">
            Des étapes visibles, des livrables nommés et un rythme de décision clair. Pour un site comme pour une
            mission de conseil.
          </p>
        </div>
      </section>

      <section className="mt-band mt-band--flush">
        <div className="mt-shell">
          <ol className="mt-timeline" ref={timelineRef}>
            {STEPS.map((step, index) => (
              <li key={step.number} data-step={step.number} style={{ ['--i' as string]: index }}>
                <span className="mt-node" aria-hidden="true">
                  {step.number}
                </span>
                <div className="mt-step">
                  <h2>{step.title}</h2>
                  <p className="mt-cad">{step.cadence}</p>
                  <h3 className="mt-lab">Livrables</h3>
                  <ul>
                    {step.deliverables.map((deliverable) => (
                      <li key={deliverable}>{deliverable}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-band">
        <div className="mt-shell mt-split">
          <div>
            <p className="mt-eyebrow">Ce qui fait varier le délai</p>
            <h2 className="mt-h2">
              Le calendrier dépend <span>surtout de vous.</span>
            </h2>
            <p className="mt-sub">
              Les délais des offres sont des repères pour un projet dont les contenus et les validations arrivent à
              temps. Voilà ce qui les allonge : le calendrier commence réellement quand le périmètre et les contenus
              sont prêts.
            </p>
            <p className="mt-sub">
              <Link className="mt-link" to="/services/sites">
                Comparer les cinq offres, leurs budgets indicatifs et leurs délais <span aria-hidden="true">→</span>
              </Link>
            </p>
          </div>
          <div className="mt-plate">
            {FACTORS.map((factor) => (
              <p key={factor.title}>
                <b>{factor.title}</b>
                <span>{factor.text}</span>
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-band">
        <div className="mt-shell">
          <Faq items={METHODE_FAQ} />
        </div>
      </section>

      <NeedStart preset="methode" />
    </div>
  )
}

export default Methode
