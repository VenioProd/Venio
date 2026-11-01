import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '../context/I18nContext'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import QualificationForm from '../components/qualification/QualificationForm'
import { HeroBackdrop } from '../components/systeme'
import '../styles/monolithe-pages.css'
import './Contact.css'

const Contact = () => {
  const location = useLocation()
  const { t } = useI18n()

  return (
    <div className="mp-page sy-secondary">
      <SEO
        title={t('pubForms.contact.seoTitle')}
        description={t('pubForms.contact.seoDescription')}
        keywords={t('pubForms.contact.seoKeywords')}
      />
      <StructuredData type="contact" />

      <section className="mp-hero mp-contact-hero sy-secondary-hero">
        <HeroBackdrop />
        <div className="mp-container mp-hero-content sy-wrap">
          <p className="mp-eyebrow sy-eyebrow">{t('pubForms.contact.eyebrow')}</p>
          <h1 className="mp-title mp-contact-title sy-secondary-title">
            {t('pubForms.contact.titleLead')} <span className="mp-accent">{t('pubForms.contact.titleAccent')}</span>
          </h1>
          <p className="mp-lede sy-secondary-lede">{t('pubForms.contact.lede')}</p>
        </div>
      </section>

      <section className="mp-contact-body">
        <div className="mp-container sy-wrap">
          {/* La clé relance le formulaire quand un lien /contact?besoin=… est suivi depuis la page elle-même. */}
          <QualificationForm key={location.search} />
          <p className="mp-contact-direct">
            {t('pubForms.contact.directLead')} <a href="mailto:contact@venio.paris">contact@venio.paris</a> ·{' '}
            {t('pubForms.contact.directData')} <Link to="/confidentialite">{t('pubForms.contact.privacyLink')}</Link>.
          </p>
        </div>
      </section>
    </div>
  )
}

export default Contact
