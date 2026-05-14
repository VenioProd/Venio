import React from 'react'
import { Link } from 'react-router-dom'
import NeonCorners from './NeonCorners'
import './Hero.css'

const Hero = () => {
  return (
    <section className="hero">
      <div className="gradient-orb"></div>
      <div className="hero-scanline hero-scanline-top" aria-hidden="true"></div>
      <div className="hero-scanline hero-scanline-bottom" aria-hidden="true"></div>
      <div className="hero-content">
        <h1 className="hero-title">VENIO</h1>
        <p className="hero-tagline">
          Construire ce qui doit exister.
        </p>
        <p className="hero-description">
          Pas ce qui rassure.
        </p>
        <Link to="/realisations" className="hero-cta">
          <NeonCorners />
          <span className="hero-cta-label">Voir notre travail</span>
        </Link>
      </div>
    </section>
  )
}

export default Hero
