import { Link } from 'react-router-dom'
import GradientMeshBackground from '../components/GradientMeshBackground'
import NeonDivider from '../components/NeonDivider'
import NeonCorners from '../components/NeonCorners'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import './ServicesPage.css'

const ServicesDeveloppement = () => {

  return (
    <>
      <SEO 
        title="Développement Web"
        description="Ce n'est pas parce que c'est beau que ça fonctionne. Pas de templates WordPress. Pas de thèmes ThemeForest. Code propriétaire, architectures pensées pour durer 10 ans. Des systèmes qui tiennent."
        keywords="développement web, développement sur mesure, SaaS, plateforme web, architecture web, React, développement Paris"
      />
      <StructuredData type="service-developpement" />
      <GradientMeshBackground />
      <div className="services-page">
        <section className="services-hero">
          <h1>DÉVELOPPEMENT</h1>
          <p className="services-subtitle">
            Ce n&apos;est pas parce que c&apos;est beau<br />
            que ça fonctionne.
          </p>
        </section>

        <NeonDivider />

        <section className="services-content">
          <div className="services-section">
            <h2>Ce que le marché vous promet</h2>
            <p className="section-intro">
              Des sites beaux et modernes. Des templates WordPress personnalisables.
              Des thèmes achetés sur ThemeForest. Des plugins pour tout.
            </p>
            <p className="section-intro">
              Résultat : ça marche 6 mois, puis ça casse. Ou ça ne scale pas. Ou personne ne peut le maintenir.
            </p>
          </div>

          <div className="services-section">
            <h2>Pourquoi ça ne marche pas</h2>
            <p className="section-intro">
              Parce que les templates sont conçus pour tout le monde. Donc pour personne.
            </p>
            <p className="section-intro">
              Parce que les plugins s&apos;empilent sans cohérence. Chaque mise à jour casse quelque chose.
              Le code est incompréhensible. Personne ne veut y toucher.
            </p>
            <p className="section-intro">
              Et quand vous voulez évoluer, vous découvrez que c&apos;est impossible sans tout refaire.
            </p>
          </div>

          <div className="services-section highlight">
            <h2>Ce que Venio construit</h2>
            <p className="section-intro">
              Du code propriétaire. Écrit de zéro. Documenté.
            </p>
            <ul className="services-list">
              <li>
                <strong>Sites web sur mesure</strong>
                <br />
                Pas de templates. Pas de shortcuts. Architecture pensée pour vos besoins réels.
              </li>
              <li>
                <strong>Plateformes métier complexes</strong>
                <br />
                Outils internes qui automatisent vos processus. Qui évoluent avec vous.
              </li>
              <li>
                <strong>SaaS scalables</strong>
                <br />
                Architectures pensées pour durer 10 ans. Pas 6 mois.
                Code qui peut grandir de 10 à 10 000 utilisateurs.
              </li>
              <li>
                <strong>Intégrations IA</strong>
                <br />
                Locale ou cloud. Anthropic, OpenAI, ou modèles open source.
                Intégration réelle, pas un chatbot collé sur votre site.
              </li>
            </ul>
            <div className="why-us">
              <p className="why-us-negative">Pas de templates WordPress ou Webflow</p>
              <p className="why-us-negative">Pas de thèmes ThemeForest</p>
              <p className="why-us-negative">Pas de plugins qui cassent</p>
              <p className="why-us-positive">Code propriétaire, architectures sur mesure</p>
              <p className="why-us-positive">Tests automatisés, déploiements structurés</p>
              <p className="why-us-positive">Formation de vos équipes pour l&apos;autonomie</p>
            </div>
          </div>

          <div className="services-section">
            <h2>Ce que ça produit</h2>
            <p className="section-intro">
              Des systèmes qui tiennent. Que vous pouvez faire grandir. Que vous comprenez.
            </p>
            <p className="section-intro">
              Du code que vos équipes peuvent maintenir. Des architectures qui évoluent.
              Des plateformes qui durent 10 ans, pas 6 mois.
            </p>
          </div>

          <div className="services-section">
            <h2>Pour qui</h2>
            <p className="section-intro">
              Pour ceux qui veulent construire quelque chose qui dure.
            </p>
            <p className="section-intro">
              Pour ceux qui ont déjà essayé les templates et compris les limites.
              Pour ceux qui préfèrent investir maintenant plutôt que refaire dans 2 ans.
            </p>
            <p className="section-intro">
              Si vous cherchez du rapide et du pas cher, ce n&apos;est pas ici.
            </p>
          </div>

          <NeonDivider variant="soft" />

          <div className="services-cta">
            <h2>Parlons de votre projet</h2>
            <p className="section-intro">
              Vous avez un projet de développement ? Parlons-en.
            </p>
            <Link to="/contact" className="form-submit" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
              <NeonCorners />
              <span className="form-submit-label">Nous contacter</span>
            </Link>
          </div>
        </section>
      </div>
    </>
  )
}

export default ServicesDeveloppement

