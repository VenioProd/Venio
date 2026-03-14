import React from 'react'
import { Link } from 'react-router-dom'
import './CTA.css'

const CTA = () => {
  return (
    <section className="cta-section">
      <h2 className="cta-title">
        Construisons ensemble<br />quelque chose de solide
      </h2>
      <p className="cta-text">
        Discutons de votre projet avec lucidité. Sans discours creux.
      </p>
      <Link to="/contact" className="hero-cta">Prendre contact →</Link>
    </section>
  )
}

export default CTA

