import React from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import ServiceOfferLinks from '../components/ServiceOfferLinks'
import Faq from '../components/conversion/Faq'
import TrustLine from '../components/conversion/TrustLine'
import NeedStart from '../components/qualification/NeedStart'
import { FormulaThumb, InstrumentRings, useSpotlight, type FormulaKind } from '../components/graphics'
import { SITES_FAQ } from '../content/faq'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'
import '../styles/refonte-pages.css'

interface Formula {
  kind: FormulaKind
  label: MessageKey
  title: MessageKey
  text: MessageKey
  included: MessageKey[]
  to: string
}

/** Aucun prix affiché : le devis pose le périmètre, le calendrier et le prix. */
const FORMULAS: Formula[] = [
  {
    kind: 'vitrine',
    label: 'pubHome.sites.formula1Label',
    title: 'pubHome.sites.formula1Title',
    text: 'pubHome.sites.formula1Text',
    included: ['pubHome.sites.formula1Incl1', 'pubHome.sites.formula1Incl2', 'pubHome.sites.formula1Incl3'],
    to: '/contact?besoin=site&formule=vitrine',
  },
  {
    kind: 'essentiel',
    label: 'pubHome.sites.formula2Label',
    title: 'pubHome.sites.formula2Title',
    text: 'pubHome.sites.formula2Text',
    included: ['pubHome.sites.formula2Incl1', 'pubHome.sites.formula2Incl2', 'pubHome.sites.formula2Incl3'],
    to: '/contact?besoin=site&formule=essentiel',
  },
  {
    kind: 'business',
    label: 'pubHome.sites.formula3Label',
    title: 'pubHome.sites.formula3Title',
    text: 'pubHome.sites.formula3Text',
    included: ['pubHome.sites.formula3Incl1', 'pubHome.sites.formula3Incl2', 'pubHome.sites.formula3Incl3'],
    to: '/contact?besoin=site&formule=business',
  },
  {
    kind: 'boutique',
    label: 'pubHome.sites.formula4Label',
    title: 'pubHome.sites.formula4Title',
    text: 'pubHome.sites.formula4Text',
    included: ['pubHome.sites.formula4Incl1', 'pubHome.sites.formula4Incl2', 'pubHome.sites.formula4Incl3'],
    to: '/contact?besoin=site&formule=boutique',
  },
  {
    kind: 'mesure',
    label: 'pubHome.sites.formula5Label',
    title: 'pubHome.sites.formula5Title',
    text: 'pubHome.sites.formula5Text',
    included: ['pubHome.sites.formula5Incl1', 'pubHome.sites.formula5Incl2', 'pubHome.sites.formula5Incl3'],
    to: '/contact?besoin=outil&formule=mesure',
  },
]

const ServicesSites: React.FC = () => {
  const { t } = useI18n()
  useReveal('.mp-page .mp-reveal', 'mp-visible')
  const tiersRef = useSpotlight<HTMLDivElement>()

  return (
    <div className="mp-page">
      <SEO
        title={t('pubHome.sites.seoTitle')}
        description={t('pubHome.sites.seoDescription')}
        keywords={t('pubHome.sites.seoKeywords')}
      />
      <StructuredData type="service-sites" />

      <section className="rp-hero">
        <InstrumentRings />
        <div className="mp-container">
          <p className="rp-mono rp-eb">
            <i aria-hidden="true" />
            {t('pubHome.sites.heroEyebrow')}
          </p>
          <h1 className="rp-h1">
            {t('pubHome.sites.title')} <span className="rp-acc vn-shine">{t('pubHome.sites.titleAccent')}</span>
          </h1>
          <p className="rp-lede">{t('pubHome.sites.lede')}</p>
          <div className="rp-ctas vn-fx">
            <Link to="/contact?besoin=site" className="mc-btn mc-btn--primary" data-analytics-cta="sites_hero_besoin">
              {t('pubHome.cta.describeNeed')}
            </Link>
            <a href="#formules" className="mc-btn mc-btn--ghost">
              {t('pubHome.sites.ctaCompare')}
            </a>
          </div>
          <div className="rp-trust">
            <TrustLine />
          </div>
        </div>
      </section>

      <section className="rp-sec">
        <div className="mp-container mp-reveal">
          <p className="rp-mono rp-eb">
            <i aria-hidden="true" />
            {t('pubHome.sites.versusEyebrow')}
          </p>
          <div className="rp-versus">
            <div className="rp-vs-col rp-vs-no">
              <span className="rp-mono">{t('pubHome.sites.vsNoLabel')}</span>
              <h3>{t('pubHome.sites.vsNoTitle')}</h3>
              <ul>
                <li>{t('pubHome.sites.vsNo1')}</li>
                <li>{t('pubHome.sites.vsNo2')}</li>
                <li>{t('pubHome.sites.vsNo3')}</li>
              </ul>
            </div>
            <div className="rp-vs-mid" aria-hidden="true">
              <span>VS</span>
            </div>
            <div className="rp-vs-col rp-vs-yes">
              <span className="rp-mono rp-acc">Venio</span>
              <h3>{t('pubHome.sites.vsYesTitle')}</h3>
              <ul>
                <li>{t('pubHome.sites.vsYes1')}</li>
                <li>{t('pubHome.sites.vsYes2')}</li>
                <li>{t('pubHome.sites.vsYes3')}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="formules" className="rp-sec">
        <div className="mp-container mp-reveal">
          <p className="rp-mono rp-eb">
            <i aria-hidden="true" />
            {t('pubHome.sites.formulasEyebrow')}
          </p>
          <h2>
            {t('pubHome.sites.formulasTitle')} <span className="rp-acc">{t('pubHome.sites.formulasTitleAccent')}</span>
          </h2>
          <p className="rp-sub">{t('pubHome.sites.formulasSub')}</p>
          <div className="rp-tiers" ref={tiersRef}>
            {FORMULAS.map((f) => (
              <article key={f.kind} className="rp-tier vn-spot">
                <FormulaThumb kind={f.kind} />
                <span className="rp-mono">{t(f.label)}</span>
                <h3>{t(f.title)}</h3>
                <p>{t(f.text)}</p>
                <ul>
                  {f.included.map((item) => (
                    <li key={item}>{t(item)}</li>
                  ))}
                </ul>
                <Link to={f.to} className="rp-go" data-analytics-cta={`sites_formule_${f.kind}`}>
                  {t('pubHome.sites.formulaGo')}
                </Link>
              </article>
            ))}
          </div>
          <p className="rp-tier-note">{t('pubHome.sites.tierNote')}</p>
        </div>
      </section>

      <section className="rp-see-also">
        <div className="mp-container">
          <ServiceOfferLinks currentPath="/services/sites" />
        </div>
      </section>

      <section className="rp-faq-sec">
        <div className="mp-container mp-reveal">
          <Faq items={SITES_FAQ} />
        </div>
      </section>

      <NeedStart preset="sites" />
    </div>
  )
}

export default ServicesSites
