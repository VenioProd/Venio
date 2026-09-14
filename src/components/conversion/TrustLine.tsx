import './TrustLine.css'

const CLAIMS = ['Sans engagement', 'Réponse sous 48 h ouvrées', 'Devis écrit']

/** Ligne de réassurance posée sous chaque DualCta. Rien de plus. */
const TrustLine = () => {
  return (
    <p className="mc-trust">
      {CLAIMS.map((claim, index) => (
        <span key={claim}>
          {index > 0 && (
            <span className="mc-trust-sep" aria-hidden="true">
              ·
            </span>
          )}
          {claim}
        </span>
      ))}
    </p>
  )
}

export default TrustLine
