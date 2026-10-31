import React from 'react'
import { Link } from 'react-router-dom'
import { serviceOffers } from '../content/serviceOffers'
import { useI18n } from '../context/I18nContext'
import './Footer.css'

const Footer = () => {
  const { t } = useI18n()
  return (
    <footer>
      <div className="footer-content">
        <div className="footer-brand">
          <h3>VENIO</h3>
        </div>

        <div className="footer-col">
          <h4>{t('pubHome.footer.navigation')}</h4>
          <Link to="/methode">{t('nav.method')}</Link>
          <Link to="/realisations">{t('nav.realisations')}</Link>
          <Link to="/a-propos">{t('pubHome.footer.about')}</Link>
          <Link to="/contact">{t('nav.contact')}</Link>
        </div>

        <div className="footer-col">
          <h4>{t('pubHome.footer.offers')}</h4>
          {serviceOffers.map((offer) => (
            <Link key={offer.to} to={offer.to}>
              {offer.label}
            </Link>
          ))}
        </div>

        <div className="footer-col">
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

        <div className="footer-col">
          <h4>{t('pubHome.footer.social')}</h4>
          <a href="https://instagram.com/venio.paris" target="_blank" rel="noopener noreferrer">
            Instagram
          </a>
          <a href="mailto:contact@venio.paris">{t('pubHome.footer.email')}</a>
        </div>
      </div>

      <div className="footer-bottom">
        <p>{t('pubHome.footer.tagline', { year: new Date().getFullYear() })}</p>
        <div className="footer-legal">
          <Link to="/legal">{t('pubHome.footer.legal')}</Link>
          <span> | </span>
          <Link to="/cgu">{t('pubHome.footer.terms')}</Link>
          <span> | </span>
          <Link to="/cgv">{t('pubHome.footer.sales')}</Link>
          <span> | </span>
          <Link to="/confidentialite">{t('pubHome.footer.privacy')}</Link>
        </div>
      </div>
    </footer>
  )
}

export default Footer
