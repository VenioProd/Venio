import React from 'react'
import { Link } from 'react-router-dom'
import './Hero.css'

const Hero = () => {
  return (
    <section className="hero">
      <div className="gradient-orb"></div>
      <div className="hero-content">
        <h1 className="hero-title">VENIO</h1>
        <p className="hero-tagline">
          La plupart des stratégies échouent.<br />
          Ce n&apos;est pas un hasard.
        </p>
        <p className="hero-description">
          Elles sont dictées par l&apos;ego, la peur ou le mimétisme.<br />
          Pas par la lucidité.
        </p>
        <p className="hero-subtext">
          Venio construit ce qui doit exister. Pas ce qui rassure.
        </p>
        <Link to="/services/communication" className="hero-cta">Voir ce que nous faisons</Link>
      </div>
    </section>
  )
}

export default Hero

