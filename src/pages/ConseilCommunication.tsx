import React from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import TrustLine from '../components/conversion/TrustLine'
import NeedStart from '../components/qualification/NeedStart'
import { LineIcon, useSpotlight, type LineIconName } from '../components/graphics'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import { useReveal } from '../hooks/useReveal'
import { HeroBackdrop } from '../components/systeme'
import '../styles/monolithe-pages.css'
import '../styles/refonte-pages.css'

interface Prestation {
  index: string
  icon: LineIconName
  label: MessageKey
  title: MessageKey
  text: MessageKey
  delivered: MessageKey
  useless: MessageKey
}

const PRESTATIONS: Prestation[] = [
  {
    index: '01',
    icon: 'loupe',
    label: 'pubHome.advice.svc1Label',
    title: 'pubHome.advice.svc1Title',
    text: 'pubHome.advice.svc1Text',
    delivered: 'pubHome.advice.svc1Delivered',
    useless: 'pubHome.advice.svc1Useless',
  },
  {
    index: '02',
    icon: 'target',
    label: 'pubHome.advice.svc2Label',
    title: 'pubHome.advice.svc2Title',
    text: 'pubHome.advice.svc2Text',
    delivered: 'pubHome.advice.svc2Delivered',
    useless: 'pubHome.advice.svc2Useless',
  },
  {
    index: '03',
    icon: 'calendar',
    label: 'pubHome.advice.svc3Label',
    title: 'pubHome.advice.svc3Title',
    text: 'pubHome.advice.svc3Text',
    delivered: 'pubHome.advice.svc3Delivered',
    useless: 'pubHome.advice.svc3Useless',
  },
  {
    index: '04',
    icon: 'megaphone',
    label: 'pubHome.advice.svc4Label',
    title: 'pubHome.advice.svc4Title',
    text: 'pubHome.advice.svc4Text',
    delivered: 'pubHome.advice.svc4Delivered',
    useless: 'pubHome.advice.svc4Useless',
  },
  {
    index: '05',
    icon: 'spark',
    label: 'pubHome.advice.svc5Label',
    title: 'pubHome.advice.svc5Title',
    text: 'pubHome.advice.svc5Text',
    delivered: 'pubHome.advice.svc5Delivered',
    useless: 'pubHome.advice.svc5Useless',
  },
]

const CUTS: [MessageKey, MessageKey][] = [
  ['pubHome.advice.cut1Before', 'pubHome.advice.cut1After'],
  ['pubHome.advice.cut2Before', 'pubHome.advice.cut2After'],
  ['pubHome.advice.cut3Before', 'pubHome.advice.cut3After'],
  ['pubHome.advice.cut4Before', 'pubHome.advice.cut4After'],
]

const ConseilCommunication: React.FC = () => {
  const { t } = useI18n()
  useReveal('.sy-secondary .sy-rv', 'is-in')
  const jobsRef = useSpotlight<HTMLDivElement>()

  return (
    <div className="mp-page sy-secondary">
      <SEO
        title={t('pubHome.advice.seoTitle')}
        description={t('pubHome.advice.seoDescription')}
        keywords={t('pubHome.advice.seoKeywords')}
      />
      <StructuredData type="conseil-communication" />

      <section className="rp-hero sy-secondary-hero">
        <HeroBackdrop />
        <div className="mp-container rp-hero-grid sy-wrap">
          <div>
            <p className="rp-mono rp-eb sy-eyebrow">{t('pubHome.advice.heroEyebrow')}</p>
            <h1 className="rp-h1 rp-h1--wide sy-secondary-title">
              {t('pubHome.advice.title')} <span className="rp-acc vn-shine">{t('pubHome.advice.titleAccent')}</span>
            </h1>
            <p className="rp-lede sy-secondary-lede">{t('pubHome.advice.lede')}</p>
            <div className="rp-ctas vn-fx">
              <Link
                to="/contact?besoin=com"
                className="mc-btn mc-btn--primary"
                data-analytics-cta="conseil_hero_besoin"
              >
                {t('pubHome.cta.describeNeed')}
              </Link>
            </div>
            <div className="rp-trust">
              <TrustLine />
            </div>
          </div>
          <div className="rp-plate sy-glass">
            <div className="rp-plate-h">
              <span className="rp-mono">{t('pubHome.advice.cutsTitle')}</span>
              <span className="rp-mono rp-acc">{t('pubHome.advice.cutsBadge')}</span>
            </div>
            <div className="rp-plate-b">
              {CUTS.map(([before, after]) => (
                <p key={before} className="rp-cut">
                  <s>{t(before)}</s>
                  <span className="rp-mono rp-acc">→ {t(after)}</span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="prestations" className="rp-sec">
        <div className="mp-container sy-rv sy-wrap">
          <p className="rp-mono rp-eb sy-eyebrow">{t('pubHome.advice.servicesEyebrow')}</p>
          <h2>
            {t('pubHome.advice.servicesTitle')}{' '}
            <span className="rp-acc">{t('pubHome.advice.servicesTitleAccent')}</span>
          </h2>
          <div className="rp-services">
            {PRESTATIONS.map((p, i) => (
              <article key={p.index} className="rp-svc sy-glass">
                <LineIcon name={p.icon} delay={i * 90} />
                <div>
                  <span className="rp-mono">
                    {p.index} · {t(p.label)}
                  </span>
                  <h3>{t(p.title)}</h3>
                  <p>{t(p.text)}</p>
                  <p className="rp-liv">{t('pubHome.advice.delivered', { value: t(p.delivered) })}</p>
                </div>
                <div className="rp-nope">
                  <span className="rp-mono">{t('pubHome.cta.nope')}</span>
                  <p>{t(p.useless)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="et-aussi" className="rp-sec">
        <div className="mp-container sy-rv sy-wrap">
          <p className="rp-mono rp-eb sy-eyebrow">{t('pubHome.advice.moreEyebrow')}</p>
          <h2>
            {t('pubHome.advice.moreTitle')} <span className="rp-acc">{t('pubHome.advice.moreTitleAccent')}</span>
          </h2>
          <div className="rp-jobs" ref={jobsRef}>
            <Link
              to="/contact?besoin=marque"
              className="rp-job vn-spot sy-glass"
              data-analytics-cta="conseil_job_marque"
            >
              <LineIcon name="glyph" />
              <span className="rp-mono">{t('pubHome.advice.brandLabel')}</span>
              <h3>{t('pubHome.advice.brandTitle')}</h3>
              <p>{t('pubHome.advice.brandText')}</p>
              <div className="rp-nope">
                <span className="rp-mono">{t('pubHome.cta.nope')}</span>
                <p>{t('pubHome.advice.brandNope')}</p>
              </div>
              <span className="rp-go">
                {t('pubHome.advice.go').replace(/\s*→$/, '')}{' '}
                <span className="sy-arr" aria-hidden="true">
                  →
                </span>
              </span>
            </Link>
            <Link to="/contact?besoin=outil" className="rp-job vn-spot sy-glass" data-analytics-cta="conseil_job_outil">
              <LineIcon name="code" />
              <span className="rp-mono">{t('pubHome.advice.devLabel')}</span>
              <h3>{t('pubHome.advice.devTitle')}</h3>
              <p>{t('pubHome.advice.devText')}</p>
              <div className="rp-nope">
                <span className="rp-mono">{t('pubHome.cta.nope')}</span>
                <p>{t('pubHome.advice.devNope')}</p>
              </div>
              <span className="rp-go">
                {t('pubHome.advice.go').replace(/\s*→$/, '')}{' '}
                <span className="sy-arr" aria-hidden="true">
                  →
                </span>
              </span>
            </Link>
          </div>
        </div>
      </section>

      <NeedStart preset="conseil" />
    </div>
  )
}

export default ConseilCommunication
