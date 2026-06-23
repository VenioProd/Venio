import React from 'react'
import GradientMeshBackground from '../components/GradientMeshBackground'
import NeonDivider from '../components/NeonDivider'
import NeonCorners from '../components/NeonCorners'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import './ServicesPage.css'

const ServicesConseil = () => {
  return (
    <>
      <SEO
        title="Conseil stratégique et audit digital"
        description="Le problème n'est pas votre communication. C'est vos décisions. Audit sans filtre, diagnostic précis, recommandations actionnables. Si votre stratégie est mauvaise, on vous le dit. Pas de slides PowerPoint."
        keywords="conseil stratégique, transformation digitale, audit stratégique, consulting, stratégie IA, positionnement"
      />
      <StructuredData type="service-conseil" />
      <GradientMeshBackground />
      <div className="services-page">
        <section className="services-hero">
          <h1>CONSEIL STRATÉGIQUE</h1>
          <p className="services-subtitle">
            Le problème n&apos;est pas votre communication.
            <br />
            C&apos;est vos décisions.
          </p>
        </section>

        <NeonDivider />

        <section className="services-content">
          <div className="services-section">
            <h2>Ce que le marché vous vend</h2>
            <p className="section-intro">
              De l&apos;accompagnement. Des consultants qui hochent la tête et valident vos idées. Des ateliers de
              co-création où tout le monde est d&apos;accord. Des roadmaps en slides PowerPoint qui finissent dans un
              dossier.
            </p>
            <p className="section-intro">Résultat : vous payez pour qu&apos;on vous dise oui.</p>
          </div>

          <div className="services-section">
            <h2>Pourquoi ça ne marche pas</h2>
            <p className="section-intro">
              Parce que la plupart des consultants ne sont pas là pour vous aider. Ils sont là pour facturer des mois.
            </p>
            <p className="section-intro">
              Ils ne remettent rien en question. Ils ne disent pas non. Ils produisent des stratégies creuses qui
              rassurent mais ne changent rien.
            </p>
          </div>

          <div className="services-section highlight">
            <h2>Ce que Venio fait différemment</h2>
            <p className="section-intro">Venio fait l&apos;inverse.</p>
            <ul className="services-list">
              <li>
                <strong>Audit sans filtre</strong>
                <br />
                Diagnostic complet de votre existant. Identification des failles réelles. Si votre stratégie est
                mauvaise, on vous le dit.
              </li>
              <li>
                <strong>Architecture digitale</strong>
                <br />
                Cartographie de votre écosystème technique. Conception de ce qui doit exister. Pas de buzzwords, que du
                concret.
              </li>
              <li>
                <strong>Stratégie IA pragmatique</strong>
                <br />
                Identification des processus automatisables. Choix des technologies pertinentes. Roadmap
                d&apos;implémentation réelle.
              </li>
              <li>
                <strong>Positionnement lucide</strong>
                <br />
                Clarification de votre proposition de valeur. Analyse concurrentielle sans complaisance. Positionnement
                différenciant et défendable.
              </li>
              <li>
                <strong>Structuration d&apos;offres</strong>
                <br />
                Refonte de votre architecture commerciale. Pricing stratégique basé sur la valeur créée. Pas sur ce que
                font vos concurrents.
              </li>
            </ul>
            <p className="section-intro">Si votre projet n&apos;a pas de sens, on refuse.</p>
          </div>

          <div className="services-section">
            <h2>Ce que ça produit</h2>
            <p className="section-intro">
              Des décisions claires. Des plans d&apos;action actionnables. Des priorités définies.
            </p>
            <p className="section-intro">
              Pas des slides PowerPoint. Pas des ateliers sans fin. Pas des stratégies qui rassurent.
            </p>
            <p className="section-intro">Vous repartez avec une direction. Et la lucidité pour l&apos;exécuter.</p>
          </div>

          <div className="services-section">
            <h2>Pour qui</h2>
            <p className="section-intro">Pour les décideurs. Pas pour les rêveurs.</p>
            <p className="section-intro">
              Pour ceux qui veulent des réponses honnêtes, pas des validations. Pour ceux qui préfèrent savoir
              maintenant que ça ne marchera pas, plutôt que dans 6 mois.
            </p>
            <p className="section-intro">
              Si vous cherchez quelqu&apos;un pour exécuter sans réfléchir, ce n&apos;est pas ici.
            </p>
          </div>

          <NeonDivider variant="soft" />

          <div className="services-cta calendly">
            <h2>Premier échange (30min)</h2>
            <p>On discute de votre projet. Sans filtre.</p>
            <a href="https://calendly.com" target="_blank" rel="noopener noreferrer" className="calendly-btn">
              <NeonCorners />
              <span className="calendly-btn-label">Réserver un créneau →</span>
            </a>
          </div>
        </section>
      </div>
    </>
  )
}

export default ServicesConseil
