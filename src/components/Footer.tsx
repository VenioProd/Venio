import { useId } from 'react'
import { Link } from 'react-router-dom'
import { serviceOffers } from '../content/serviceOffers'
import { useI18n } from '../context/I18nContext'
import './Footer.css'

const Footer = () => {
  const { t } = useI18n()
  const gradientId = useId()
  return (
    <footer className="sy-footer">
      <div className="sy-wrap">
        <div className="sy-footer-content">
          <div className="sy-footer-brand">
            <Link to="/" className="sy-footer-logo">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                    <stop stopColor="#c4b5fd" />
                    <stop offset=".45" stopColor="#7dd3fc" />
                    <stop offset="1" stopColor="#5eead4" />
                  </linearGradient>
                </defs>
                <path d="M3 4.5h4.2L12 15.2 16.8 4.5H21L13.6 20h-3.2z" fill={`url(#${gradientId})`} />
              </svg>
              Venio
            </Link>
            <p>{t('pubHome.footer.tagline', { year: new Date().getFullYear() })}</p>
          </div>

          <div className="sy-footer-col">
            <h4>{t('pubHome.footer.navigation')}</h4>
            <Link to="/methode">{t('nav.method')}</Link>
            <Link to="/realisations">{t('nav.realisations')}</Link>
            <Link to="/a-propos">{t('pubHome.footer.about')}</Link>
            <Link to="/contact">{t('nav.contact')}</Link>
          </div>

          <div className="sy-footer-col">
            <h4>{t('pubHome.footer.offers')}</h4>
            {serviceOffers.map((offer) => (
              <Link key={offer.to} to={offer.to}>
                {offer.label}
              </Link>
            ))}
          </div>

          <div className="sy-footer-col">
            <h4>{t('pubHome.footer.externalPoles')}</h4>
            <a href="https://creatio.paris" target="_blank" rel="noopener noreferrer">
              Creatio
            </a>
            <a href="https://decisio.paris" target="_blank" rel="noopener noreferrer">
              Decisio
            </a>
            <a href="https://formatio.paris" target="_blank" rel="noopener noreferrer">
              Formatio
            </a>
          </div>

          <div className="sy-footer-col">
            <h4>{t('pubHome.footer.social')}</h4>
            <a href="https://instagram.com/venio.paris" target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
            <a href="mailto:contact@venio.paris">{t('pubHome.footer.email')}</a>
          </div>
        </div>

        <div className="sy-footer-wordmark" aria-hidden="true">
          Venio
        </div>
        <div className="sy-footer-bottom">
          <div className="sy-footer-legal">
            <Link to="/legal">{t('pubHome.footer.legal')}</Link>
            <span aria-hidden="true">·</span>
            <Link to="/cgu">{t('pubHome.footer.terms')}</Link>
            <span aria-hidden="true">·</span>
            <Link to="/cgv">{t('pubHome.footer.sales')}</Link>
            <span aria-hidden="true">·</span>
            <Link to="/confidentialite">{t('pubHome.footer.privacy')}</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
