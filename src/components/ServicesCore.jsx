import React from 'react'
import { Link } from 'react-router-dom'
import './ServicesCore.css'

const ServicesCore = () => {
  const services = [
    {
      number: '01',
      title: 'CONSEIL',
      tagline: 'Audit sans filtre. Décisions claires, pas des slides.',
      link: '/services/conseil'
    },
    {
      number: '02',
      title: 'DÉVELOPPEMENT',
      tagline: 'Code propriétaire. Architectures qui durent 10 ans.',
      link: '/services/developpement'
    },
    {
      number: '03',
      title: 'COMMUNICATION',
      tagline: 'Une marque qui se tient. Pas une charte PDF.',
      link: '/services/communication'
    }
  ]

  return (
    <section className="services-core">
      <div className="services-core-container">
        <h2 className="services-core-title neon-underline neon-underline-centered neon-underline-thin">Ce que Venio fait</h2>
        <div className="services-core-grid">
          {services.map((service, index) => (
            <Link
              key={index}
              to={service.link}
              className="service-core-card"
            >
              <span className="service-core-card-number">{service.number}</span>
              <h3 className="service-core-card-title">{service.title}</h3>
              <p className="service-core-card-tagline">{service.tagline}</p>
              <span className="service-core-card-link">En savoir plus →</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

export default ServicesCore
