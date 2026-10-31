import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import VenioIcon, { type VenioIconName } from './VenioIcon'
import './SitesPricingTable.css'

interface Tier {
  id: string
  num: string
  name: MessageKey
  icon: VenioIconName
  tagline: MessageKey
  featured: boolean
  features: { label: MessageKey; included: boolean }[]
  webmasteringIncludes: MessageKey[]
  ctaLabel: MessageKey
  ctaTo: string
}

const TIERS: Tier[] = [
  {
    id: 'vitrine',
    num: '01',
    name: 'pubHome.proofs.vitrine',
    icon: 'vitrine',
    tagline: 'pubHome.pricing.tag1',
    featured: false,
    features: [
      { label: 'pubHome.pricing.fDesign', included: true },
      { label: 'pubHome.pricing.fResponsive', included: true },
      { label: 'pubHome.pricing.fSeoBasic', included: true },
      { label: 'pubHome.pricing.fContactForm', included: true },
      { label: 'pubHome.pricing.fBlog', included: false },
      { label: 'pubHome.pricing.fClientArea', included: false },
      { label: 'pubHome.pricing.fPayment', included: false },
    ],
    webmasteringIncludes: [
      'pubHome.pricing.wHosting',
      'pubHome.pricing.wContent',
      'pubHome.pricing.wBackups',
      'pubHome.pricing.wSupport',
    ],
    ctaLabel: 'pubHome.pricing.start',
    ctaTo: '/contact',
  },
  {
    id: 'essentiel',
    num: '02',
    name: 'pubHome.proofs.essentiel',
    icon: 'essentiel',
    tagline: 'pubHome.pricing.tag2',
    featured: false,
    features: [
      { label: 'pubHome.pricing.fDesign', included: true },
      { label: 'pubHome.pricing.fResponsive', included: true },
      { label: 'pubHome.pricing.fSeoAdvanced', included: true },
      { label: 'pubHome.pricing.fBlog', included: true },
      { label: 'pubHome.pricing.fContactForm', included: true },
      { label: 'pubHome.pricing.fClientArea', included: false },
      { label: 'pubHome.pricing.fPayment', included: false },
    ],
    webmasteringIncludes: [
      'pubHome.pricing.wHosting',
      'pubHome.pricing.wContent',
      'pubHome.pricing.wBlog',
      'pubHome.pricing.wBackups',
      'pubHome.pricing.wSupport',
    ],
    ctaLabel: 'pubHome.pricing.start',
    ctaTo: '/contact',
  },
  {
    id: 'business',
    num: '03',
    name: 'pubHome.proofs.business',
    icon: 'business',
    tagline: 'pubHome.pricing.tag3',
    featured: true,
    features: [
      { label: 'pubHome.pricing.fDesignPremium', included: true },
      { label: 'pubHome.pricing.fResponsive', included: true },
      { label: 'pubHome.pricing.fSeoAnalytics', included: true },
      { label: 'pubHome.pricing.fBlog', included: true },
      { label: 'pubHome.pricing.fClientAreaSimple', included: true },
      { label: 'pubHome.pricing.fPayment', included: true },
      { label: 'pubHome.pricing.fCustomFeatures', included: false },
    ],
    webmasteringIncludes: [
      'pubHome.pricing.wHosting',
      'pubHome.pricing.wUnlimited',
      'pubHome.pricing.wMonitoring',
      'pubHome.pricing.wPrioritySupport',
    ],
    ctaLabel: 'pubHome.pricing.start',
    ctaTo: '/contact',
  },
  {
    id: 'ecommerce',
    num: '04',
    name: 'pubHome.proofs.ecommerce',
    icon: 'ecommerce',
    tagline: 'pubHome.pricing.tag4',
    featured: false,
    features: [
      { label: 'pubHome.pricing.fCatalog', included: true },
      { label: 'pubHome.pricing.fPaymentMulti', included: true },
      { label: 'pubHome.pricing.fStock', included: true },
      { label: 'pubHome.pricing.fSeoShop', included: true },
      { label: 'pubHome.pricing.fAnalytics', included: true },
      { label: 'pubHome.pricing.fClientAreaFull', included: true },
      { label: 'pubHome.pricing.fCustomFeatures', included: false },
    ],
    webmasteringIncludes: [
      'pubHome.pricing.wHosting',
      'pubHome.pricing.wCatalogStock',
      'pubHome.pricing.wPaymentSecurity',
      'pubHome.pricing.wSupport',
    ],
    ctaLabel: 'pubHome.pricing.start',
    ctaTo: '/contact',
  },
  {
    id: 'plateforme',
    num: '05',
    name: 'pubHome.proofs.plateforme',
    icon: 'plateforme',
    tagline: 'pubHome.pricing.tag5',
    featured: false,
    features: [
      { label: 'pubHome.pricing.fArchitecture', included: true },
      { label: 'pubHome.pricing.fApi', included: true },
      { label: 'pubHome.pricing.fRoles', included: true },
      { label: 'pubHome.pricing.fDashboards', included: true },
      { label: 'pubHome.pricing.fAutomation', included: true },
      { label: 'pubHome.pricing.fSaas', included: true },
      { label: 'pubHome.pricing.fEverything', included: true },
    ],
    webmasteringIncludes: [
      'pubHome.pricing.wHosting',
      'pubHome.pricing.wSla',
      'pubHome.pricing.wMonitoring247',
      'pubHome.pricing.wEvolutions',
    ],
    ctaLabel: 'pubHome.pricing.contactUs',
    ctaTo: '/contact',
  },
]

const SitesPricingTable: React.FC = () => {
  const { t } = useI18n()
  const [wmActive, setWmActive] = useState(false)

  return (
    <div className="pricing-table">
      {/* Toggle webmastering */}
      <div className="pricing-toggle-wrap">
        <span className={`pricing-toggle-label ${!wmActive ? 'active' : ''}`}>{t('pubHome.pricing.withoutWm')}</span>
        <button
          className={`pricing-toggle ${wmActive ? 'on' : ''}`}
          aria-label={t('pubHome.pricing.toggleLabel')}
          aria-pressed={wmActive}
          onClick={() => setWmActive(!wmActive)}
        >
          <span className="pricing-toggle-knob" />
        </button>
        <span className={`pricing-toggle-label ${wmActive ? 'active' : ''}`}>{t('pubHome.pricing.withWm')}</span>
        <span className="pricing-toggle-badge">{t('pubHome.pricing.recommended')}</span>
      </div>

      {/* Note webmastering */}
      {wmActive && <p className="pricing-wm-note">{t('pubHome.pricing.wmNote')}</p>}

      {/* Grille des paliers */}
      <div className="pricing-grid">
        {TIERS.map((tier) => (
          <div key={tier.id} className={`pricing-card${tier.featured ? ' pricing-card--featured' : ''}`}>
            {tier.featured && <span className="pricing-card__badge">{t('pubHome.pricing.mostChosen')}</span>}

            <VenioIcon name={tier.icon} size={28} className="pricing-card__icon" />
            <div className="pricing-card__tier">{t('pubHome.pricing.tier', { num: tier.num })}</div>
            <div className="pricing-card__name">{t(tier.name)}</div>
            <div className="pricing-card__tagline">{t(tier.tagline)}</div>

            <div className="pricing-card__price-block">
              <div className="pricing-card__price-label">{t('pubHome.pricing.construction')}</div>
              <div className="pricing-card__price-main">{t('pubHome.pricing.onQuote')}</div>

              {wmActive && (
                <div className="pricing-card__price-monthly">
                  <div className="pricing-card__price-label">{t('pubHome.pricing.monthlyMaintenance')}</div>
                  <div className="pricing-card__price-monthly-val">
                    {t('pubHome.pricing.onQuote')}
                    <span>{t('pubHome.pricing.perMonth')}</span>
                  </div>
                </div>
              )}
            </div>

            {wmActive && (
              <div className="pricing-card__wm-block">
                <div className="pricing-card__wm-label">{t('pubHome.pricing.includedMonthly')}</div>
                <ul className="pricing-card__wm-list">
                  {tier.webmasteringIncludes.map((item) => (
                    <li key={item}>{t(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            <ul className="pricing-card__features">
              {tier.features.map((f) => (
                <li key={f.label} className={f.included ? '' : 'excluded'}>
                  <span className="feature-icon">{f.included ? '✓' : '–'}</span>
                  {t(f.label)}
                </li>
              ))}
            </ul>

            <Link to={tier.ctaTo} className="pricing-card__cta" data-analytics-cta={`pricing_${tier.id}`}>
              {t(tier.ctaLabel)}
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SitesPricingTable
