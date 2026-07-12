import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'

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

const Methode = () => {
  useReveal('.mp-page .mp-reveal', 'mp-visible')

  return (
    <div className="mp-page">
      <SEO
        title="Méthode de travail — étapes, livrables et cadence | Venio"
        description="Découvrez comment Venio cadre, conçoit, construit, recette et transmet un projet web : étapes, livrables et rythme de travail."
        keywords="méthode projet web, livrables site web, cadence projet digital, Venio"
      />
      <StructuredData type="method" />

      <section className="mp-hero">
        <div className="mp-hero-lines" aria-hidden="true" />
        <div className="mp-container mp-hero-content">
          <p className="mp-eyebrow">Venio · Méthode</p>
          <h1 className="mp-title">Faire avancer un projet, sans brouillard.</h1>
          <p className="mp-lede">Des étapes visibles, des livrables nommés et un rythme de décision clair.</p>
        </div>
      </section>

      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              I
            </span>
            <span className="mp-kicker">Le déroulé</span>
          </div>
          <div className="mp-method-steps">
            {STEPS.map((step) => (
              <article className="mp-method-step mp-reveal" key={step.number}>
                <span className="mp-method-number">{step.number}</span>
                <div>
                  <h2>{step.title}</h2>
                  <p className="mp-method-cadence">{step.cadence}</p>
                </div>
                <div>
                  <h3>Livrables</h3>
                  <ul>
                    {step.deliverables.map((deliverable) => (
                      <li key={deliverable}>{deliverable}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              II
            </span>
            <span className="mp-kicker">Ce qui fait varier le délai</span>
          </div>
          <div className="mp-prose mp-reveal">
            <p className="mp-strong">
              Le calendrier commence réellement quand le périmètre et les contenus sont prêts.
            </p>
            <p>
              Les délais affichés dans les offres sont des repères pour un projet dont les contenus, validations et
              accès nécessaires arrivent au fil de l&apos;eau. Une intégration externe, une fonctionnalité sur mesure ou
              un aller-retour de validation supplémentaire peut modifier le planning : nous le signalons au jalon
              concerné.
            </p>
            <p>
              <Link to="/services/sites">Comparer les cinq offres, leurs budgets indicatifs et leurs délais</Link>.
            </p>
          </div>
        </div>
      </section>

      <section className="mp-cta">
        <div className="mp-container">
          <h2 className="mp-cta-titre">
            Un projet clair<span className="mp-dot">.</span>
          </h2>
          <p className="mp-cta-texte">
            Choisissez le palier qui correspond à votre besoin ; le cadrage sert à confirmer le périmètre plutôt qu’à le
            deviner.
          </p>
          <Link className="mp-btn" to="/services/sites">
            Voir les offres <span className="mp-ar">→</span>
          </Link>
        </div>
      </section>
    </div>
  )
}

export default Methode
