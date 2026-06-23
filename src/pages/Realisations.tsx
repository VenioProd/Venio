import React, { useState } from 'react'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'

interface ProjetResult {
  value: string
  label: string
}

interface Projet {
  id: number
  titre: string
  client: string
  categorie: string
  tags: string[]
  description: string
  results: ProjetResult[]
}

const PROJETS: Projet[] = [
  {
    id: 1,
    titre: 'Cabinet Mercier & Associés',
    client: "Cabinet d'avocats d'affaires — Paris",
    categorie: 'Développement',
    tags: ['Decisio', 'Juridique'],
    description:
      'Refonte complète du site pour ce cabinet. Design sobre et crédible, prise de rendez-vous en ligne et espace client sécurisé.',
    results: [
      { value: '24', label: 'Pages créées' },
      { value: '<1,2s', label: 'Temps de chargement' },
      { value: '100%', label: 'Connexion sécurisée' },
    ],
  },
  {
    id: 2,
    titre: 'École NOVA Business School',
    client: 'École de commerce — Lyon',
    categorie: 'Développement',
    tags: ['Creatio', 'Éducation'],
    description:
      'Site moderne et vivant pour cette école. Navigation simple, parcours personnalisés et inscription en ligne fluide.',
    results: [
      { value: '38', label: 'Pages créées' },
      { value: '12', label: 'Modules sur mesure' },
      { value: '6 mois', label: 'De construction' },
    ],
  },
  {
    id: 3,
    titre: 'Studio Prism',
    client: 'Agence créative — Bordeaux',
    categorie: 'Développement',
    tags: ['Branding', 'Créatif'],
    description:
      'Portfolio ultra-soigné pour ce studio de design : projets mis en avant, animations fluides, tri avancé et navigation immersive.',
    results: [
      { value: '18', label: 'Pages créées' },
      { value: '25+', label: 'Animations sur mesure' },
      { value: '4 mois', label: 'De construction' },
    ],
  },
  {
    id: 4,
    titre: 'FlowMetrics',
    client: 'Logiciel d’analyse — Startup',
    categorie: 'Développement',
    tags: ['Logiciel', 'Tech'],
    description:
      "Conception et développement complet d'un logiciel d'analyse en ligne : tableau de bord clair, comptes utilisateurs et page d'accueil pensée pour convertir.",
    results: [
      { value: '42', label: 'Écrans créés' },
      { value: '18', label: 'Connexions à des outils' },
      { value: '8 mois', label: 'De construction' },
    ],
  },
  {
    id: 5,
    titre: "Restaurant L'Atelier",
    client: 'Restaurant gastronomique 2* — Paris 8e',
    categorie: 'Développement',
    tags: ['Gastronomie', 'Luxe'],
    description:
      'Site élégant pour ce restaurant étoilé : design raffiné, réservation en ligne, galerie photos soignée et menu interactif.',
    results: [
      { value: '18', label: 'Pages créées' },
      { value: 'Réservation', label: 'En ligne intégrée' },
      { value: '4 mois', label: 'De construction' },
    ],
  },
  {
    id: 6,
    titre: 'Cabinet Atrium',
    client: 'Architectes — Lyon',
    categorie: 'Développement',
    tags: ['Architecture', 'Design'],
    description:
      "Portfolio épuré pour ce cabinet d'architecture : typographie sobre, grille photo élégante, mise en valeur des projets avec beaucoup d'air.",
    results: [
      { value: '16', label: 'Pages créées' },
      { value: '30+', label: 'Projets présentés' },
      { value: '3 mois', label: 'De construction' },
    ],
  },
  {
    id: 7,
    titre: 'Maison Aurore',
    client: 'Haute parfumerie — Paris',
    categorie: 'Développement',
    tags: ['Luxe', 'Boutique en ligne'],
    description:
      'Boutique en ligne haut de gamme pour cette maison de parfums : design noir et or, animations subtiles, configurateur de fragrances et achat soigné.',
    results: [
      { value: '32', label: 'Pages créées' },
      { value: 'Sur mesure', label: 'Configurateur de parfums' },
      { value: '7 mois', label: 'De construction' },
    ],
  },
  {
    id: 8,
    titre: 'Clinique VitaSanté',
    client: 'Clinique médicale — Nantes',
    categorie: 'Développement',
    tags: ['Santé', 'Médical'],
    description:
      'Plateforme complète pour cette clinique : design rassurant, rendez-vous en ligne, dossier patient sécurisé et consultation à distance. Claire pour tous les âges.',
    results: [
      { value: '26', label: 'Pages créées' },
      { value: 'À distance', label: 'Consultation intégrée' },
      { value: '6 mois', label: 'De construction' },
    ],
  },
]

const CATEGORIES = ['Tout', 'Développement', 'Communication', 'Stratégie']

const Realisations = () => {
  const [filter, setFilter] = useState<string>('Tout')
  useReveal('.mp-page .mp-reveal', 'mp-visible')

  const filtered = filter === 'Tout' ? PROJETS : PROJETS.filter((p) => p.categorie === filter)

  return (
    <div className="mp-page">
      <SEO
        title="Réalisations — nos projets web et marque"
        description="Des résultats, pas des vitrines. Des études de cas représentatives de ce que Venio construit. Pas de captures retouchées, pas de chiffres inventés."
        keywords="réalisations Venio, portfolio web, projets sites web, études de cas, références"
      />
      <StructuredData type="realisations" />

      <section className="mp-hero">
        <div className="mp-hero-lines" aria-hidden="true" />
        <div className="mp-container mp-hero-content">
          <p className="mp-eyebrow">Venio · Réalisations</p>
          <h1 className="mp-title">Réalisations</h1>
          <p className="mp-lede">
            <b>Des résultats.</b> Pas des vitrines.
          </p>
        </div>
      </section>

      <section className="mp-block">
        <div className="mp-container">
          <div className="mp-head mp-reveal">
            <span className="mp-index" aria-hidden="true">
              I
            </span>
            <span className="mp-kicker">Du concret</span>
          </div>
          <div className="mp-prose mp-reveal">
            <p className="mp-strong">
              Les projets ci-dessous sont des études de cas représentatives de ce qu'on construit.
            </p>
            <p>
              Pas de captures retouchées. Pas de chiffres inventés. Si vous voulez voir des projets réels en ligne,
              écrivez-nous : on vous montre ce qui existe vraiment.
            </p>
          </div>

          <div className="mp-filters mp-reveal">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`mp-filter${filter === cat ? ' is-active' : ''}`}
                onClick={() => setFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="mp-projets">
            {filtered.length === 0 ? (
              <p className="mp-projet-desc" style={{ paddingTop: 'var(--mp-sp-m)' }}>
                Bientôt. Écrivez-nous pour voir ce qu'on a déjà construit dans ce domaine.
              </p>
            ) : (
              filtered.map((p) => (
                <article key={p.id} className="mp-projet">
                  <div>
                    <div className="mp-projet-tags">
                      {p.tags.map((t) => (
                        <span key={t} className="mp-projet-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                    <h2 className="mp-projet-titre">{p.titre}</h2>
                    <p className="mp-projet-client">{p.client}</p>
                    <p className="mp-projet-desc">{p.description}</p>
                  </div>
                  <div className="mp-projet-results">
                    {p.results.map((r) => (
                      <div key={r.label}>
                        <div className="mp-result-value">{r.value}</div>
                        <div className="mp-result-label">{r.label}</div>
                      </div>
                    ))}
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Realisations
