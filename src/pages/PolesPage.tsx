import GradientMeshBackground from '../components/GradientMeshBackground'
import NeonDivider from '../components/NeonDivider'
import PoleCard from '../components/PoleCard'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import './PolesPage.css'

const PolesPage = () => {
  const poles = [
    {
      name: 'DECISIO',
      description: 'Communication juridique',
      link: 'https://decisio.paris',
      external: true
    },
    {
      name: 'CREATIO',
      description: 'Supports de cours',
      link: 'https://creatio.paris',
      external: true
    },
    {
      name: 'FORMATIO',
      description: 'Formations professionnelles',
      link: 'https://formatio.paris',
      external: true
    }
  ]

  return (
    <>
      <SEO 
        title="Nos Pôles"
        description="Trois pôles. Trois spécialisations. DECISIO (communication juridique), CREATIO (supports de cours), FORMATIO (formations professionnelles). Spécialisation réelle, pas divisions marketing."
        keywords="DECISIO, CREATIO, FORMATIO, communication juridique, supports de cours, formations professionnelles"
      />
      <StructuredData type="poles" />
      <GradientMeshBackground />
      <div className="poles-page">
        <section className="poles-hero">
          <h1>NOS PÔLES</h1>
          <p className="poles-subtitle">Trois spécialisations. Pas de généralisme.</p>
        </section>

        <NeonDivider />

        <section className="poles-content">
          <div className="poles-intro">
            <p>
              Venio opère à travers trois pôles spécialisés. Pas des divisions marketing.
              Des entités dédiées à des domaines précis, avec une expertise réelle.
            </p>
            <p>
              Spécialisation vs généralisme. Profondeur vs surface.
            </p>
          </div>

          <div className="poles-grid">
            {poles.map((pole, index) => (
              <PoleCard key={index} {...pole} />
            ))}
          </div>
        </section>
      </div>
    </>
  )
}

export default PolesPage

