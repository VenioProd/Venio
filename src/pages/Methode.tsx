import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import NeedStart from '../components/qualification/NeedStart'
import { HeroBackdrop } from '../components/systeme'
import Faq from '../components/conversion/Faq'
import { METHODE_FAQ } from '../content/faq'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import { useEffect, useRef } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'
import './Methode.css'

const STEPS = [
  {
    number: '01',
    title: 'pubHome.method.step1Title',
    cadence: 'pubHome.method.step1Cadence',
    deliverables: ['pubHome.method.step1Del1', 'pubHome.method.step1Del2', 'pubHome.method.step1Del3'],
  },
  {
    number: '02',
    title: 'pubHome.method.step2Title',
    cadence: 'pubHome.method.step2Cadence',
    deliverables: ['pubHome.method.step2Del1', 'pubHome.method.step2Del2', 'pubHome.method.step2Del3'],
  },
  {
    number: '03',
    title: 'pubHome.method.step3Title',
    cadence: 'pubHome.method.step3Cadence',
    deliverables: ['pubHome.method.step3Del1', 'pubHome.method.step3Del2', 'pubHome.method.step3Del3'],
  },
  {
    number: '04',
    title: 'pubHome.method.step4Title',
    cadence: 'pubHome.method.step4Cadence',
    deliverables: ['pubHome.method.step4Del1', 'pubHome.method.step4Del2', 'pubHome.method.step4Del3'],
  },
  {
    number: '05',
    title: 'pubHome.method.step5Title',
    cadence: 'pubHome.method.step5Cadence',
    deliverables: ['pubHome.method.step5Del1', 'pubHome.method.step5Del2', 'pubHome.method.step5Del3'],
  },
] as const satisfies readonly {
  number: string
  title: MessageKey
  cadence: MessageKey
  deliverables: readonly MessageKey[]
}[]

const FACTORS = [
  { title: 'pubHome.method.factor1Title', text: 'pubHome.method.factor1Text' },
  { title: 'pubHome.method.factor2Title', text: 'pubHome.method.factor2Text' },
  { title: 'pubHome.method.factor3Title', text: 'pubHome.method.factor3Text' },
  { title: 'pubHome.method.factor4Title', text: 'pubHome.method.factor4Text' },
] as const satisfies readonly { title: MessageKey; text: MessageKey }[]

/** Allume chaque nœud quand son étape atteint le tiers haut de l'écran. */
const useLitNodes = () => {
  const listRef = useRef<HTMLOListElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('li[data-step]') ?? [])
    const lightAll = () => items.forEach((el) => el.classList.add('is-lit'))
    if (typeof IntersectionObserver === 'undefined' || reduced) {
      lightAll()
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-lit')
            io.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.35, rootMargin: '0px 0px -12% 0px' },
    )
    items.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [reduced])

  return listRef
}

const Methode = () => {
  const { t } = useI18n()
  useReveal('.sy-secondary .sy-rv', 'is-in')
  const timelineRef = useLitNodes()

  return (
    <div className="mt-page sy-secondary">
      <SEO
        title={t('pubHome.method.seoTitle')}
        description={t('pubHome.method.seoDescription')}
        keywords={t('pubHome.method.seoKeywords')}
      />
      <StructuredData type="method" />

      <section className="mt-hero sy-secondary-hero">
        <HeroBackdrop />
        <div className="mt-shell mt-hero-body sy-wrap">
          <p className="mt-eyebrow sy-eyebrow">{t('nav.method')}</p>
          <h1 className="sy-secondary-title">
            {t('pubHome.method.title')} <span>{t('pubHome.method.titleAccent')}</span>
          </h1>
          <p className="mt-lede sy-secondary-lede">{t('pubHome.method.lede')}</p>
        </div>
      </section>

      <section className="mt-band mt-band--flush">
        <div className="mt-shell sy-wrap">
          <ol className="mt-timeline" ref={timelineRef}>
            {STEPS.map((step, index) => (
              <li key={step.number} data-step={step.number} style={{ ['--i' as string]: index }}>
                <span className="mt-node" aria-hidden="true">
                  {step.number}
                </span>
                <div className="mt-step sy-glass">
                  <h2>{t(step.title)}</h2>
                  <p className="mt-cad">{t(step.cadence)}</p>
                  <h3 className="mt-lab">{t('pubHome.method.deliverables')}</h3>
                  <ul>
                    {step.deliverables.map((deliverable) => (
                      <li key={deliverable}>{t(deliverable)}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-band">
        <div className="mt-shell mt-split sy-wrap sy-rv">
          <div>
            <p className="mt-eyebrow sy-eyebrow">{t('pubHome.method.delayEyebrow')}</p>
            <h2 className="mt-h2">
              {t('pubHome.method.delayTitle')} <span>{t('pubHome.method.delayTitleAccent')}</span>
            </h2>
            <p className="mt-sub">{t('pubHome.method.delaySub')}</p>
            <p className="mt-sub">
              <Link className="mt-link" to="/services/sites">
                {t('pubHome.method.delayLink')}{' '}
                <span className="sy-arr" aria-hidden="true">
                  →
                </span>
              </Link>
            </p>
          </div>
          <div className="mt-plate sy-glass">
            {FACTORS.map((factor) => (
              <p key={factor.title}>
                <b>{t(factor.title)}</b>
                <span>{t(factor.text)}</span>
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-band">
        <div className="mt-shell sy-wrap">
          <Faq items={METHODE_FAQ} />
        </div>
      </section>

      <NeedStart preset="methode" />
    </div>
  )
}

export default Methode
