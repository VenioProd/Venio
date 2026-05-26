import ExpertiseCard from './ExpertiseCard'
import './Expertises.css'

const Expertises = () => {
  const expertises = [
    {
      title: 'Communication & Branding',
      description: 'Identités solides et cohérentes. Stratégies éditoriales qui comptent. Loin des tendances superficielles et du jargon creux.',
      items: [
        'Positionnement de marque',
        'Storytelling & chartes éditoriales',
        'Contenus premium à forte valeur',
        'Stratégies de communication intégrées'
      ]
    },
    {
      title: 'Plateformes web & SaaS',
      description: 'Systèmes digitaux complexes, architectures modernes, produits scalables. Expertise acquise sur des projets exigeants.',
      items: [
        'Plateformes métier sur mesure',
        'SaaS (NestJS, React, Vite)',
        'UX produit & intégration IA',
        'Sites premium haute performance'
      ]
    },
    {
      title: 'Conseil & Stratégie',
      description: 'Accompagnement de dirigeants et organisations. Approche analytique, directe, orientée résultats.',
      items: [
        'Positionnement & structuration',
        'Stratégie de croissance',
        'Transformation digitale',
        'IA comme levier de productivité'
      ]
    },
    {
      title: 'Formation & Enseignement',
      description: 'Transmission d\'expertise via Formatio. Formations certifiées Qualiopi. Interventions en écoles de commerce.',
      items: [
        'Formations IA & communication',
        'Modules pour professions juridiques',
        'Marketing digital & UX/UI',
        'Gestion de projet & IA appliquée'
      ]
    }
  ]

  return (
    <section className="expertises" id="expertises">
      <div className="section-header">
        <h2 className="section-title">Expertises</h2>
        <p className="section-subtitle">Ce que nous construisons vraiment</p>
      </div>
      <div className="expertise-grid">
        {expertises.map((expertise, index) => (
          <ExpertiseCard key={index} {...expertise} />
        ))}
      </div>
    </section>
  )
}

export default Expertises

