import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '../context/I18nContext'
import './CookieConsent.css'

const COOKIE_KEY = 'venio_cookie_consent'

const CookieConsent = () => {
  const { t } = useI18n()
  const { pathname } = useLocation()
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

  if (!visible || pathname === '/commercial' || pathname.startsWith('/commercial/')) return null

  return (
    <div className="cookie-banner">
      <div className="cookie-banner-content">
        <p>
          {t('pubHome.cookie.text')} <Link to="/confidentialite">{t('pubHome.cookie.link')}</Link>.
        </p>
        <div className="cookie-banner-actions">
          <button className="cookie-btn cookie-btn--accept" onClick={handleAccept}>
            {t('pubHome.cookie.accept')}
          </button>
          <button className="cookie-btn cookie-btn--refuse" onClick={handleRefuse}>
            {t('pubHome.cookie.refuse')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CookieConsent
