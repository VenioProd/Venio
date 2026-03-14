import React from 'react'
import { Link } from 'react-router-dom'
import './ServicesCore.css'

const ServicesCore = () => {
  const services = [
    {
      title: 'CONSEIL STRATÉGIQUE',
      market: 'Le marché vous vend de l\'accompagnement. Des consultants qui valident vos idées pour facturer des mois.',
      problem: 'Résultat : vous payez pour qu\'on vous dise oui.',
      solution: 'Venio fait l\'inverse. Audit sans filtre. Diagnostic précis. Recommandations actionnables. Si votre stratégie est mauvaise, on vous le dit. Si votre projet n\'a pas de sens, on refuse.',
      result: 'Vous repartez avec des décisions claires. Pas des slides PowerPoint.',
      link: '/services/conseil'
    },
    {
      title: 'DÉVELOPPEMENT',
      market: 'Le marché vous promet des sites beaux et modernes. Templates WordPress, thèmes achetés, code copié-collé.',
      problem: 'Résultat : ça marche 6 mois, puis ça casse. Ou ça ne scale pas. Ou personne ne peut le maintenir.',
      solution: 'Venio construit du code propriétaire. Architectures pensées pour durer 10 ans. Pas de templates. Pas de shortcuts. Du sur mesure qui évolue avec vous.',
      result: 'Des systèmes qui tiennent. Que vous pouvez faire grandir. Que vous comprenez.',
      link: '/services/developpement'
    },
    {
      title: 'COMMUNICATION & BRANDING',
      market: 'Le marché vous vend des identités visuelles. Un logo sur Canva, une charte graphique en PDF, trois posts Instagram.',
      problem: 'Résultat : vous ressemblez à tout le monde. Votre marque n\'a pas de colonne vertébrale.',
      solution: 'Venio construit des identités cohérentes. Stratégie éditoriale structurée. Direction artistique pensée. Une voix qui vous appartient.',
      result: 'Une marque qui se tient. Qui ne suit pas les tendances. Qui dure.',
      link: '/services/communication'
    }
  ]

  return (
    <section className="services-core">
      <div className="services-core-container">
        <h2 className="services-core-title">Ce que Venio fait</h2>
        <div className="services-core-grid">
          {services.map((service, index) => (
            <Link 
              key={index} 
              to={service.link} 
              className="service-core-card"
            >
              <h3 className="service-core-card-title">{service.title}</h3>
              <div className="service-core-card-content">
                <p className="service-market">{service.market}</p>
                <p className="service-problem">{service.problem}</p>
                <p className="service-solution">{service.solution}</p>
                <p className="service-result">{service.result}</p>
              </div>
              <span className="service-core-card-link">En savoir plus</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export default ServicesCore

