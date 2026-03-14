import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './CookieConsent.css'

const COOKIE_KEY = 'venio_cookie_consent'

const CookieConsent = () => {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_KEY)
    if (!consent) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem(COOKIE_KEY, 'accepted')
    setVisible(false)
  }

  const handleRefuse = () => {
    localStorage.setItem(COOKIE_KEY, 'refused')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="cookie-banner">
      <div className="cookie-banner-content">
        <p>
          Ce site utilise uniquement des cookies techniques necessaires a son fonctionnement.
          Aucun cookie de tracking ou publicitaire n'est utilise.
          Pour en savoir plus, consultez notre{' '}
          <Link to="/confidentialite">politique de confidentialite</Link>.
        </p>
        <div className="cookie-banner-actions">
          <button className="cookie-btn cookie-btn--accept" onClick={handleAccept}>
            Accepter
          </button>
          <button className="cookie-btn cookie-btn--refuse" onClick={handleRefuse}>
            Refuser
          </button>
        </div>
      </div>
    </div>
  )
}

export default CookieConsent
