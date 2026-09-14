import './ProofBar.css'

interface Engagement {
  num: string
  label: string
  value: string
}

/**
 * Quatre engagements, pas quatre statistiques : tant que le lot 0 de données
 * n'est pas fourni, le socle ne contient aucun chiffre. Chaque cellule reprend
 * la grammaire des repères du hero (numéro mono, libellé discret, valeur
 * affirmée) en autonome, sans dépendre des tokens --mh-* du gabarit home.
 */
const ENGAGEMENTS: Engagement[] = [
  { num: '01', label: 'Le design', value: 'Dessiné pour vous' },
  { num: '02', label: 'Le code', value: 'Il vous appartient' },
  { num: '03', label: 'Vos demandes', value: 'Rien n’est bloqué' },
  { num: '04', label: 'La réponse', value: 'Sous 48 h ouvrées' },
]

const ProofBar = () => {
  return (
    <section className="mc-proof" aria-label="Nos engagements">
      <div className="mc-container">
        <dl className="mc-proof-grid">
          {ENGAGEMENTS.map((engagement) => (
            <div key={engagement.num} className="mc-proof-cell">
              <dt>
                <span className="mc-proof-num">{engagement.num}</span>
                {engagement.label}
              </dt>
              <dd>{engagement.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

export default ProofBar
