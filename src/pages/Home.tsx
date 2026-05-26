import React from 'react'
import { Link } from 'react-router-dom'
import Hero from '../components/Hero'
import Manifeste from '../components/Manifeste'
import ServicesCore from '../components/ServicesCore'
import CTAFinal from '../components/CTAFinal'
import Decorations from '../components/Decorations'
import NeonDivider from '../components/NeonDivider'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import './Home.css'

const Home = () => {
  return (
    <>
      <SEO
        title="Accueil"
        description="Venio construit ce qui doit exister. Conseil stratégique, développement sur mesure, communication et branding. Pas de templates, pas de slides."
        keywords="agence digitale, développement web, communication, branding, stratégie digitale, Paris"
      />
      <StructuredData type="home" />
      <Decorations variant="hero" />
      <Hero />
      <NeonDivider />
      <Manifeste />
      <NeonDivider variant="soft" />
      <ServicesCore />
      <NeonDivider />
      <CTAFinal />
    </>
  )
}

export default Home
