import React from 'react'
import { Link } from 'react-router-dom'
import GradientMeshBackground from '../components/GradientMeshBackground'
import NeonDivider from '../components/NeonDivider'
import NeonCorners from '../components/NeonCorners'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import './APropos.css'

const APropos = () => {
  return (
    <>
      <SEO
        title="À propos — un studio digital sans détour"
        description="Venio existe parce que le marché est saturé de mensonges. Consultants qui valident tout, développeurs qui copient-collent, créatifs qui suivent les tendances. Venio refuse ce modèle. Lucidité, efficacité, refus du mensonge."
        keywords="à propos Venio, agence digitale Paris, équipe Venio, expertise technique, vision"
      />
      <StructuredData type="apropos" />
      <GradientMeshBackground />
      <div className="apropos-page">
        <section className="apropos-hero">
          <h1>À PROPOS</h1>
          <p className="apropos-subtitle">Pourquoi Venio existe</p>
        </section>

        <NeonDivider />

        <section className="apropos-content">
          <div className="apropos-section">
            <h2>Le refus</h2>
            <p>Venio existe parce que le marché est saturé de mensonges.</p>
            <p>
              De consultants qui valident tout pour facturer des mois. De développeurs qui copient-collent des templates
              et appellent ça du sur mesure. De créatifs qui suivent les tendances et appellent ça de la stratégie.
            </p>
            <p>Venio refuse ce modèle.</p>
          </div>

          <div className="apropos-section">
            <h2>La posture</h2>
            <p>
              Venio assume que beaucoup de communications sont inutiles. Que beaucoup de sites sont beaux mais
              inefficaces. Que beaucoup de stratégies ne servent qu&apos;à rassurer.
            </p>
            <p>Venio n&apos;est pas là pour faire plaisir. Ni pour cocher des cases. Ni pour flatter.</p>
            <p>Venio est là pour clarifier, structurer, décider. Et produire des résultats mesurables.</p>
          </div>

          <div className="apropos-section">
            <h2>La méthode</h2>
            <div className="piliers">
              <div className="pilier">
                <h3>Lucidité</h3>
                <p>
                  Analyse sans filtre. Diagnostic précis. Recommandations directes. Si votre stratégie est mauvaise, on
                  vous le dit.
                </p>
              </div>
              <div className="pilier">
                <h3>Efficacité</h3>
                <p>
                  Architectures optimisées. Processus structurés. Livraisons dans les temps. Pas de slides PowerPoint.
                  Des systèmes qui fonctionnent.
                </p>
              </div>
              <div className="pilier">
                <h3>Refus du mensonge</h3>
                <p>
                  Pas de jargon marketing vide. Pas de promesses creuses. Pas de tendances suivies par mimétisme. Si ça
                  ne sert à rien, on ne le fait pas.
                </p>
              </div>
            </div>
          </div>

          <div className="apropos-section">
            <h2>La relation client</h2>
            <p>
              Venio choisit ses projets. Dit non quand c&apos;est nécessaire. Préfère perdre un client que perdre en
              crédibilité.
            </p>
            <p>
              Si vous cherchez quelqu&apos;un pour exécuter sans réfléchir, ce n&apos;est pas ici. Si vous cherchez
              quelqu&apos;un pour valider vos idées, ce n&apos;est pas ici.
            </p>
            <p>
              Si vous cherchez quelqu&apos;un pour vous dire la vérité et construire ce qui doit exister, alors oui.
            </p>
          </div>

          <div className="apropos-section">
            <h2>L&apos;expertise technique</h2>
            <p>
              React, Node.js, Python. Architectures API REST et GraphQL. Intégrations IA (OpenAI, Anthropic, modèles
              locaux). Bases de données relationnelles et NoSQL. DevOps et déploiements automatisés.
            </p>
            <p>
              Pas de WordPress avec des plugins aléatoires. Pas de templates ThemeForest. Code propriétaire, testé,
              documenté, maintenable.
            </p>
            <p>Architectures pensées pour durer 10 ans. Pas 6 mois.</p>
          </div>

          <NeonDivider variant="soft" />

          <div className="apropos-cta">
            <h2>Si vous êtes arrivé jusqu&apos;ici</h2>
            <p>C&apos;est que vous comprenez. Parlons.</p>
            <Link to="/contact" className="cta-btn">
              <NeonCorners />
              <span className="cta-btn-label">Prendre contact</span>
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}

export default APropos
