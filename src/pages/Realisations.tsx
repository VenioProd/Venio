import React, { useState } from 'react'
import GradientMeshBackground from '../components/GradientMeshBackground'
import NeonDivider from '../components/NeonDivider'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import './Realisations.css'

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
  type: string
}

const Realisations = () => {
  const [filter, setFilter] = useState<string>('Tout')

  const projetsDev: Projet[] = [
    {
      id: 1,
      titre: 'Cabinet Mercier & Associés',
      client: "Cabinet d'avocats d'affaires — Paris",
      categorie: 'Développement',
      tags: ['Decisio', 'Juridique'],
      description:
        "Refonte complète du site web pour ce cabinet prestigieux. Design sobre et élégant reflétant le sérieux et la crédibilité. Intégration d'un système de prise de rendez-vous et d'un espace client sécurisé.",
      results: [
        { value: '24', label: 'Pages créées' },
        { value: '<1.2s', label: 'Temps de chargement' },
        { value: '100%', label: 'Sécurité SSL' },
      ],
      type: 'avocat',
    },
    {
      id: 2,
      titre: 'École NOVA Business School',
      client: 'École de commerce — Lyon',
      categorie: 'Développement',
      tags: ['Creatio', 'Éducation'],
      description:
        "Création d'un site moderne et dynamique pour cette école de commerce. Focus sur l'expérience utilisateur avec une navigation intuitive, des parcours personnalisés et un système d'inscription en ligne fluide.",
      results: [
        { value: '38', label: 'Pages créées' },
        { value: '12', label: 'Modules fonctionnels' },
        { value: '6 mois', label: 'Temps de développement' },
      ],
      type: 'ecole',
    },
    {
      id: 3,
      titre: 'Studio Prism',
      client: 'Agence créative — Bordeaux',
      categorie: 'Développement',
      tags: ['Branding', 'Créatif'],
      description:
        'Portfolio ultra-moderne pour ce studio de design. Mise en avant des projets avec des animations fluides, un système de filtres avancé et une navigation immersive. Design bold et typographie impactante.',
      results: [
        { value: '18', label: 'Pages créées' },
        { value: '25+', label: 'Animations custom' },
        { value: '4 mois', label: 'Temps de développement' },
      ],
      type: 'studio',
    },
    {
      id: 4,
      titre: 'FlowMetrics',
      client: 'SaaS Analytics — Startup Tech',
      categorie: 'Développement',
      tags: ['SaaS', 'Tech'],
      description:
        "Conception et développement complet d'une plateforme SaaS d'analytics B2B. Interface dashboard intuitive, système d'authentification, API documentation et landing page optimisée conversion.",
      results: [
        { value: '42', label: 'Pages créées' },
        { value: '18', label: 'API endpoints' },
        { value: '8 mois', label: 'Temps de développement' },
      ],
      type: 'saas',
    },
    {
      id: 5,
      titre: "Restaurant L'Atelier",
      client: 'Restaurant gastronomique 2* — Paris 8e',
      categorie: 'Développement',
      tags: ['Gastronomie', 'Luxe'],
      description:
        "Site web élégant pour ce restaurant étoilé. Design sombre et raffiné, système de réservation en ligne intégré, galerie photos premium et menu interactif. Expérience digitale à la hauteur de l'excellence culinaire.",
      results: [
        { value: '18', label: 'Pages créées' },
        { value: 'Système RDV', label: 'Réservation intégrée' },
        { value: '4 mois', label: 'Temps de développement' },
      ],
      type: 'restaurant',
    },
    {
      id: 6,
      titre: 'Cabinet Atrium',
      client: 'Architectes — Lyon',
      categorie: 'Développement',
      tags: ['Architecture', 'Design'],
      description:
        "Portfolio minimaliste pour ce cabinet d'architecture contemporaine. Fond beige clair, typographie épurée, grille photographique élégante. Focus sur la mise en valeur des projets avec un design qui respire l'espace et la lumière.",
      results: [
        { value: '16', label: 'Pages créées' },
        { value: '30+', label: 'Projets présentés' },
        { value: '3 mois', label: 'Temps de développement' },
      ],
      type: 'archi',
    },
    {
      id: 7,
      titre: 'Maison Aurore',
      client: 'Haute parfumerie — Paris',
      categorie: 'Développement',
      tags: ['Luxe', 'E-commerce'],
      description:
        'Boutique en ligne premium pour cette maison de parfums de luxe. Design noir & or, expérience sensorielle digitale, animations subtiles, configurateur de fragrances personnalisées. E-commerce haut de gamme avec storytelling immersif.',
      results: [
        { value: '32', label: 'Pages créées' },
        { value: 'Configurateur', label: 'Fragrances custom' },
        { value: '7 mois', label: 'Temps de développement' },
      ],
      type: 'luxe',
    },
    {
      id: 8,
      titre: 'Clinique VitaSanté',
      client: 'Clinique médicale — Nantes',
      categorie: 'Développement',
      tags: ['Santé', 'Médical'],
      description:
        'Plateforme digitale complète pour cette clinique moderne. Design rassurant bleu clair, prise de rendez-vous en ligne, dossier patient sécurisé, téléconsultation intégrée. Interface accessible et claire pour tous les âges.',
      results: [
        { value: '26', label: 'Pages créées' },
        { value: 'Téléconsultation', label: 'Module intégré' },
        { value: '6 mois', label: 'Temps de développement' },
      ],
      type: 'medical',
    },
  ]

  const projetsComm: Projet[] = []

  const projetsStrat: Projet[] = []

  const categories = ['Tout', 'Communication', 'Développement', 'Stratégie']

  const getFilteredProjets = () => {
    if (filter === 'Tout') {
      return [...projetsDev, ...projetsComm, ...projetsStrat]
    } else if (filter === 'Développement') {
      return projetsDev
    } else if (filter === 'Communication') {
      return projetsComm
    } else {
      return projetsStrat
    }
  }

  const filteredProjets = getFilteredProjets()

  return (
    <>
      <SEO
        title="Réalisations — nos projets web et marque"
        description="Des résultats. Pas des vitrines. Études de cas représentatives du type de travail que Venio réalise. Pas de captures retouchées, pas de métriques inventées. Si vous voulez voir du réel, contactez-nous."
        keywords="réalisations Venio, portfolio, projets, sites web, développement, communication, études de cas"
      />
      <StructuredData type="realisations" />
      <GradientMeshBackground />
      <div className="realisations-page">
        <section className="realisations-hero">
          <h1>RÉALISATIONS</h1>
          <p className="realisations-subtitle">Des résultats. Pas des vitrines.</p>
          <div className="realisations-intro">
            <p>
              Les projets présentés ici sont des études de cas représentatives du type de travail que Venio réalise. Pas
              de captures d&apos;écran retouchées. Pas de métriques inventées.
            </p>
            <p>
              Si vous voulez voir des projets réels en production, contactez-nous. On vous montrera ce qui existe
              vraiment.
            </p>
          </div>
        </section>

        <NeonDivider />

        <section className="realisations-content">
          <div className="filters">
            {categories.map((cat) => (
              <button
                key={cat}
                className={`filter-btn ${filter === cat ? 'active' : ''}`}
                onClick={() => setFilter(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="projets-grid">
            {filteredProjets.map((projet) => (
              <div key={projet.id} className={`projet-card ${projet.type ? 'detailed' : ''}`}>
                {projet.type ? (
                  <>
                    <div className="project-visual">
                      {projet.type === 'avocat' && (
                        <div className="visual-avocat">
                          <div className="avocat-nav">
                            <div className="avocat-logo">Mercier & Associés</div>
                            <div className="avocat-menu">
                              <span>Expertises</span>
                              <span>Équipe</span>
                              <span>Actualités</span>
                              <span>Contact</span>
                            </div>
                          </div>
                          <div className="avocat-hero">
                            <h2>
                              Expertise &<br />
                              Confiance
                            </h2>
                            <p>Cabinet d'avocats spécialisé en droit des affaires et fiscalité depuis 1987</p>
                            <div className="avocat-btn">Prendre rendez-vous</div>
                          </div>
                          <div className="avocat-decorative"></div>
                        </div>
                      )}
                      {projet.type === 'ecole' && (
                        <div className="visual-ecole">
                          <div className="ecole-nav">
                            <div className="ecole-logo">NOVA</div>
                            <div className="ecole-menu">
                              <div className="ecole-menu-item">Formations</div>
                              <div className="ecole-menu-item">Campus</div>
                              <div className="ecole-menu-item">Contact</div>
                            </div>
                          </div>
                          <div className="ecole-content">
                            <div className="ecole-text">
                              <h2>Construisez votre avenir</h2>
                              <p>École supérieure de commerce et de management digital</p>
                              <div className="ecole-cta">Découvrir nos formations</div>
                            </div>
                            <div className="ecole-stats">
                              <div className="stat-box">
                                <div className="stat-value">95%</div>
                                <div className="stat-label">Insertion pro</div>
                              </div>
                              <div className="stat-box">
                                <div className="stat-value">1200</div>
                                <div className="stat-label">Étudiants</div>
                              </div>
                              <div className="stat-box">
                                <div className="stat-value">8</div>
                                <div className="stat-label">Formations</div>
                              </div>
                              <div className="stat-box">
                                <div className="stat-value">150</div>
                                <div className="stat-label">Entreprises</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {projet.type === 'studio' && (
                        <div className="visual-studio">
                          <div className="studio-bg"></div>
                          <div className="studio-nav">
                            <div className="studio-logo">PRISM</div>
                            <div className="studio-menu">
                              <span>Work</span>
                              <span>Studio</span>
                              <span>Services</span>
                              <span>Contact</span>
                            </div>
                          </div>
                          <div className="studio-hero">
                            <h2>
                              We craft
                              <br />
                              <span className="studio-gradient">bold experiences</span>
                            </h2>
                            <p>Creative studio specializing in brand identity, motion design & digital experiences</p>
                            <div className="studio-cta">View our work</div>
                          </div>
                        </div>
                      )}
                      {projet.type === 'saas' && (
                        <div className="visual-saas">
                          <div className="saas-nav">
                            <div className="saas-logo-container">
                              <div className="saas-logo-icon"></div>
                              <div className="saas-logo-text">FlowMetrics</div>
                            </div>
                            <div className="saas-menu">
                              <span>Product</span>
                              <span>Pricing</span>
                              <span>Docs</span>
                              <span>Login</span>
                            </div>
                          </div>
                          <div className="saas-content">
                            <div className="saas-text">
                              <h2>
                                Analytics,
                                <br />
                                <span className="saas-gradient">simplified</span>
                              </h2>
                              <p>
                                The all-in-one platform for tracking, analyzing and optimizing your SaaS metrics in
                                real-time.
                              </p>
                              <div className="saas-cta">Start free trial</div>
                            </div>
                            <div className="saas-dashboard">
                              <div className="dashboard-header">Revenue growth</div>
                              <div className="dashboard-chart">
                                <div className="chart-bar" style={{ height: '45%' }}></div>
                                <div className="chart-bar" style={{ height: '62%' }}></div>
                                <div className="chart-bar" style={{ height: '48%' }}></div>
                                <div className="chart-bar" style={{ height: '78%' }}></div>
                                <div className="chart-bar" style={{ height: '65%' }}></div>
                                <div className="chart-bar" style={{ height: '92%' }}></div>
                                <div className="chart-bar" style={{ height: '85%' }}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      {projet.type === 'restaurant' && (
                        <div className="visual-restaurant">
                          <div className="restaurant-hero-image"></div>
                          <div className="restaurant-nav">
                            <div className="restaurant-logo">L'Atelier</div>
                            <div className="restaurant-menu">
                              <span>Menu</span>
                              <span>Réservation</span>
                              <span>Chef</span>
                              <span>Contact</span>
                            </div>
                          </div>
                          <div className="restaurant-content">
                            <div className="restaurant-decorative"></div>
                            <h2>
                              haute
                              <br />
                              gastronomie
                            </h2>
                            <p>2 Étoiles Michelin</p>
                            <div className="restaurant-btn">Réserver une table</div>
                          </div>
                        </div>
                      )}
                      {projet.type === 'archi' && (
                        <div className="visual-archi">
                          <div className="archi-nav">
                            <div className="archi-logo">ATRIUM</div>
                            <div className="archi-menu">
                              <span>Projets</span>
                              <span>Studio</span>
                              <span>Process</span>
                              <span>Contact</span>
                            </div>
                          </div>
                          <div className="archi-grid">
                            <div className="archi-image"></div>
                            <div className="archi-text">
                              <h2>
                                Architecture
                                <br />
                                contemporaine
                              </h2>
                              <p>Conception d'espaces uniques et durables depuis 2008</p>
                              <div className="archi-btn">Découvrir nos projets</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {projet.type === 'luxe' && (
                        <div className="visual-luxe">
                          <div className="luxe-gradient"></div>
                          <div className="luxe-nav">
                            <div className="luxe-logo">AURORE</div>
                            <div className="luxe-menu">
                              <span>Collections</span>
                              <span>Maison</span>
                              <span>Boutiques</span>
                              <span>Contact</span>
                            </div>
                          </div>
                          <div className="luxe-content">
                            <div className="luxe-decorative-line"></div>
                            <h2>ESSENCE</h2>
                            <p className="luxe-subtitle">Haute Parfumerie</p>
                            <div className="luxe-btn">Découvrir la collection</div>
                          </div>
                        </div>
                      )}
                      {projet.type === 'medical' && (
                        <div className="visual-medical">
                          <div className="medical-nav">
                            <div className="medical-logo-container">
                              <div className="medical-logo-icon">
                                <svg
                                  width="24"
                                  height="24"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                                    fill="currentColor"
                                  />
                                </svg>
                              </div>
                              <div className="medical-logo-text">VitaSanté</div>
                            </div>
                            <div className="medical-menu">
                              <span>Services</span>
                              <span>Équipe</span>
                              <span>Rendez-vous</span>
                              <span>Contact</span>
                            </div>
                          </div>
                          <div className="medical-hero">
                            <div className="medical-text">
                              <h2>
                                Votre santé,
                                <br />
                                notre priorité
                              </h2>
                              <p>Clinique médicale moderne spécialisée en médecine préventive et soins personnalisés</p>
                              <div className="medical-cta">Prendre rendez-vous</div>
                            </div>
                            <div className="medical-card">
                              <div className="medical-card-title">Nos résultats</div>
                              <div className="medical-stats">
                                <div className="medical-stat">
                                  <div className="medical-stat-value">98%</div>
                                  <div className="medical-stat-label">Satisfaction</div>
                                </div>
                                <div className="medical-stat">
                                  <div className="medical-stat-value">15k+</div>
                                  <div className="medical-stat-label">Patients</div>
                                </div>
                                <div className="medical-stat">
                                  <div className="medical-stat-value">24h</div>
                                  <div className="medical-stat-label">Disponibilité</div>
                                </div>
                                <div className="medical-stat">
                                  <div className="medical-stat-value">45</div>
                                  <div className="medical-stat-label">Médecins</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="project-info">
                      <div className="project-meta">
                        {projet.tags?.map((tag, idx) => (
                          <span key={idx} className="project-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <h2 className="project-title">{projet.titre}</h2>
                      <p className="project-client">{projet.client}</p>
                      <p className="project-description">{projet.description}</p>
                      <div className="project-results">
                        {projet.results?.map((result, idx) => (
                          <div key={idx} className="result-item">
                            <div className="result-value">{result.value}</div>
                            <div className="result-label">{result.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="projet-image" aria-label={`Image du projet ${projet.titre}`}>
                      <div className="projet-placeholder">{projet.titre}</div>
                    </div>
                    <div className="projet-overlay">
                      <h3 className="projet-titre">{projet.titre}</h3>
                      <span className="projet-categorie">{projet.categorie}</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

export default Realisations
