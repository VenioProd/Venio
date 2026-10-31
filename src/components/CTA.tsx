import React from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../context/I18nContext'
import './CTA.css'

const CTA = () => {
  const { t } = useI18n()
  return (
    <section className="cta-section">
      <h2 className="cta-title">
        {t('pubHome.shared.ctaTitleA')}
        <br />
        {t('pubHome.shared.ctaTitleB')}
      </h2>
      <p className="cta-text">{t('pubHome.shared.ctaText')}</p>
      <Link to="/contact" className="hero-cta" data-analytics-cta="shared_cta_contact">
        {t('pubHome.shared.ctaButton')}
      </Link>
    </section>
  )
}

export default CTA
