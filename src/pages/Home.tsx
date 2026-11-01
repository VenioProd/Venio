import { Fragment, useEffect, useId, useRef, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import TrustLine from '../components/conversion/TrustLine'
import Faq from '../components/conversion/Faq'
import NeedStart from '../components/qualification/NeedStart'
import {
  HeroBackdrop,
  HeroFlow,
  TiltStage,
  FeatureSection,
  RoadmapMock,
  CommunicationMock,
  PlatformMock,
  FormulaGrid,
  Guarantees,
  MethodSteps,
  RefsStrip,
} from '../components/systeme'
import { HOME_FAQ } from '../content/faq'
import { useI18n } from '../context/I18nContext'
import { useReveal } from '../hooks/useReveal'
import './Home.css'

/** Chaque mot monte derrière son masque sans interrompre la phrase accessible. */
function TitleWords({ text, start = 0, accent = false }: { text: string; start?: number; accent?: boolean }) {
  return (
    <>
      {text.split(' ').map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          {index > 0 && ' '}
          <span className="sy-home-word">
            <span
              className={`sy-home-word__inner${accent ? ' sy-gt' : ''}`}
              style={{ '--i': start + index } as CSSProperties}
            >
              {word}
            </span>
          </span>
        </Fragment>
      ))}
    </>
  )
}

export default function Home() {
  const { t } = useI18n()
  const uid = useId()
  const titleRef = useRef<HTMLHeadingElement>(null)
  const lead = t('pubHome.sys.h1Lead')
  const accent = t('pubHome.sys.h1Accent')
  const methodTitleId = `${uid}-method`
  const platformsTitleId = `${uid}-platforms`

  useReveal('.sy-home .sy-rv', 'is-in')

  useEffect(() => {
    const title = titleRef.current
    if (!title) return
    let disposed = false
    // Un même dégradé traverse tous les mots, y compris après un retour à la ligne.
    const paintTitle = () => {
      if (disposed) return
      const bounds = title.getBoundingClientRect()
      if (!bounds.width) return
      const words = Array.from(title.querySelectorAll<HTMLElement>('.sy-gt')).map((word) => ({
        word,
        left: word.getBoundingClientRect().left - bounds.left,
      }))
      words.forEach(({ word, left }) => {
        word.style.backgroundSize = `${bounds.width}px 100%`
        word.style.backgroundPosition = `${-left}px 0`
      })
    }
    paintTitle()
    window.addEventListener('resize', paintTitle)
    void document.fonts?.ready.then(paintTitle)
    document.fonts?.addEventListener?.('loadingdone', paintTitle)
    return () => {
      disposed = true
      window.removeEventListener('resize', paintTitle)
      document.fonts?.removeEventListener?.('loadingdone', paintTitle)
    }
  }, [lead, accent])

  return (
    <div className="sy-home">
      <SEO
        title={t('pubHome.home.seoTitle')}
        description={t('pubHome.home.seoDescription')}
        keywords={t('pubHome.home.seoKeywords')}
      />
      <StructuredData type="home" />

      <section className="sy-home-hero" aria-labelledby={`${uid}-hero`}>
        <HeroBackdrop canvas />
        <div className="sy-wrap sy-home-hero__intro">
          <p className="sy-home-kicker sy-home-fade" style={{ '--i': 0 } as CSSProperties}>
            <i aria-hidden="true" />
            {t('pubHome.sys.kicker')}
          </p>
          <h1 id={`${uid}-hero`} ref={titleRef} className="sy-home-h1" aria-label={`${lead} ${accent}`}>
            <TitleWords text={lead} /> <TitleWords text={accent} start={lead.split(' ').length} accent />
          </h1>
          <p className="sy-home-lede sy-home-fade" style={{ '--i': 1 } as CSSProperties}>
            {t('pubHome.sys.lede')}
          </p>
          <div className="sy-home-ctas sy-home-fade" style={{ '--i': 2 } as CSSProperties}>
            <Link className="sy-btn sy-btn--primary" to="/contact">
              {t('pubHome.sys.ctaPrimary')}
              <span className="sy-arr" aria-hidden="true">
                →
              </span>
            </Link>
            <a className="sy-btn" href="#strategie">
              {t('pubHome.sys.ctaSecondary')}
            </a>
          </div>
          <div className="sy-home-trust sy-home-fade" style={{ '--i': 3 } as CSSProperties}>
            <TrustLine />
          </div>
        </div>
        <div className="sy-wrap sy-home-fade" style={{ '--i': 4 } as CSSProperties}>
          <HeroFlow />
        </div>
      </section>

      <div className="sy-sec sy-wrap">
        <FeatureSection
          id="strategie"
          color="#a78bfa"
          eyebrow={t('pubHome.sys.stratEyebrow')}
          title={t('pubHome.sys.stratTitle')}
          accent={t('pubHome.sys.stratAccent')}
          sub={t('pubHome.sys.stratSub')}
          chips={[t('pubHome.sys.stratChip1'), t('pubHome.sys.stratChip2'), t('pubHome.sys.stratChip3')]}
          delivered={t('pubHome.sys.stratDelivered')}
          notFor={t('pubHome.sys.stratNotFor')}
          cta={{ to: '/contact?besoin=flou', label: t('pubHome.sys.stratCta') }}
          visual={
            <TiltStage glow="#a78bfa" caption={t('pubHome.sys.illustration')}>
              <RoadmapMock />
            </TiltStage>
          }
        />
      </div>

      <div className="sy-sec sy-wrap">
        <FeatureSection
          id="communication"
          color="#38bdf8"
          reverse
          tag={t('pubHome.sys.newTag')}
          eyebrow={t('pubHome.sys.comEyebrow')}
          title={t('pubHome.sys.comTitle')}
          accent={t('pubHome.sys.comAccent')}
          sub={t('pubHome.sys.comSub')}
          chips={[
            t('pubHome.sys.comChip1'),
            t('pubHome.sys.comChip2'),
            t('pubHome.sys.comChip3'),
            t('pubHome.sys.comChip4'),
          ]}
          delivered={t('pubHome.sys.comDelivered')}
          notFor={t('pubHome.sys.comNotFor')}
          cta={{ to: '/conseil-communication', label: t('pubHome.sys.comCta') }}
          visual={
            <TiltStage glow="#38bdf8" caption={t('pubHome.sys.illustration')}>
              <CommunicationMock />
            </TiltStage>
          }
        />
      </div>

      <section id="plateformes" className="sy-sec" aria-labelledby={platformsTitleId}>
        <div className="sy-wrap">
          <FeatureSection
            id="plateformes-offre"
            titleId={platformsTitleId}
            color="#5eead4"
            eyebrow={t('pubHome.sys.platEyebrow')}
            title={t('pubHome.sys.platTitle')}
            accent={t('pubHome.sys.platAccent')}
            sub={t('pubHome.sys.platSub')}
            chips={[
              t('pubHome.sys.platChip1'),
              t('pubHome.sys.platChip2'),
              t('pubHome.sys.platChip3'),
              t('pubHome.sys.platChip4'),
            ]}
            delivered={t('pubHome.sys.platDelivered')}
            notFor={t('pubHome.sys.platNotFor')}
            cta={{ to: '/contact?besoin=outil', label: t('pubHome.sys.platCta') }}
            visual={
              <TiltStage glow="#5eead4" caption={t('pubHome.sys.illustration')}>
                <PlatformMock />
              </TiltStage>
            }
          />
          <FormulaGrid />
        </div>
      </section>

      <div className="sy-sec sy-wrap sy-home-guarantees">
        <Guarantees />
      </div>

      <section id="methode" className="sy-sec sy-wrap" aria-labelledby={methodTitleId}>
        <header className="sy-head">
          <p className="sy-eyebrow sy-rv">{t('pubHome.sys.methodEyebrow')}</p>
          <h2 id={methodTitleId} className="sy-h2 sy-rv" style={{ '--d': 1 } as CSSProperties}>
            {t('pubHome.sys.methodTitle')} <span className="sy-gt">{t('pubHome.sys.methodAccent')}</span>
          </h2>
          <p className="sy-sub sy-rv" style={{ '--d': 2 } as CSSProperties}>
            {t('pubHome.sys.methodSub')}
          </p>
        </header>
        <MethodSteps />
        <p className="sy-home-method-link sy-rv">
          <Link className="sy-btn sy-btn--sm" to="/methode">
            {t('pubHome.sys.methodLink')}
            <span className="sy-arr" aria-hidden="true">
              →
            </span>
          </Link>
        </p>
      </section>

      <div className="sy-sec sy-wrap sy-home-refs">
        <RefsStrip />
      </div>

      <section id="faq" className="sy-sec sy-wrap sy-home-faq" aria-label={t('pubHome.conversion.faqEyebrow')}>
        <div className="sy-rv">
          <Faq items={HOME_FAQ} />
        </div>
      </section>

      <NeedStart preset="home" />
    </div>
  )
}
