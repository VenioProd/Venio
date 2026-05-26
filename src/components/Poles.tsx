import PoleCard from './PoleCard'
import './Poles.css'

const Poles = () => {
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
    <section className="poles" id="poles">
      <div className="section-header">
        <h2 className="section-title">Trois pôles. Trois spécialisations.</h2>
      </div>
      <div className="poles-grid">
        {poles.map((pole, index) => (
          <PoleCard key={index} {...pole} />
        ))}
      </div>
    </section>
  )
}

export default Poles

