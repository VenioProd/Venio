import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import ProofRadar from '../components/home/ProofRadar'
import NeedStart from '../components/qualification/NeedStart'
import { HeroBackdrop } from '../components/systeme'
import Faq from '../components/conversion/Faq'
import { APROPOS_FAQ } from '../content/faq'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import { useReveal } from '../hooks/useReveal'
import '../styles/monolithe-pages.css'
import './APropos.css'

const POLES = [
  { name: 'Decisio', desc: 'pubHome.poles.legal', link: 'https://decisio.paris' },
  { name: 'Creatio', desc: 'pubHome.poles.courses', link: 'https://creatio.paris' },
  { name: 'Formatio', desc: 'pubHome.poles.training', link: 'https://formatio.paris' },
] as const satisfies readonly { name: string; desc: MessageKey; link: string }[]

const APropos = () => {
  const { t } = useI18n()
  useReveal('.sy-secondary .sy-rv', 'is-in')
  return (
    <div className="mp-page sy-secondary">
      <SEO
        title={t('pubHome.about.seoTitle')}
        description={t('pubHome.about.seoDescription')}
        keywords={t('pubHome.about.seoKeywords')}
      />
      <StructuredData type="apropos" />

      <section className="ap-hero sy-secondary-hero">
        <HeroBackdrop />
        <div className="ap-shell ap-hero-body sy-wrap">
          <p className="ap-eyebrow sy-eyebrow">{t('pubHome.about.eyebrow')}</p>
          <h1 className="sy-secondary-title">
            {t('pubHome.about.title')} <span>{t('pubHome.about.titleAccent')}</span>
          </h1>
          <p className="ap-lede sy-secondary-lede">{t('pubHome.about.lede')}</p>
        </div>
      </section>

      <section className="ap-band ap-band--flush">
        <div className="ap-shell ap-manif sy-wrap sy-rv">
          <div className="ap-plate sy-glass">
            <div className="ap-plate-h">
              <h2>{t('pubHome.about.refuseTitle')}</h2>
              <span className="ap-no" aria-hidden="true">
                ✕
              </span>
            </div>
            <ul className="ap-list ap-list--no">
              <li>{t('pubHome.about.refuse1')}</li>
              <li>{t('pubHome.about.refuse2')}</li>
              <li>{t('pubHome.about.refuse3')}</li>
              <li>{t('pubHome.about.refuse4')}</li>
            </ul>
          </div>
          <div className="ap-plate sy-glass">
            <div className="ap-plate-h">
              <h2>{t('pubHome.about.assumeTitle')}</h2>
              <span className="ap-yes" aria-hidden="true">
                ✓
              </span>
            </div>
            <ul className="ap-list ap-list--yes">
              <li>{t('pubHome.about.assume1')}</li>
              <li>{t('pubHome.about.assume2')}</li>
              <li>{t('pubHome.about.assume3')}</li>
              <li>{t('pubHome.about.assume4')}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="ap-band">
        <div className="ap-shell sy-wrap sy-rv">
          <p className="ap-eyebrow sy-eyebrow">{t('pubHome.about.liveEyebrow')}</p>
          <h2 className="ap-h2">
            {t('pubHome.about.liveTitle')} <span>{t('pubHome.about.liveTitleAccent')}</span>
          </h2>
          <p className="ap-sub">{t('pubHome.about.liveSub')}</p>
          <div className="ap-radar">
            <ProofRadar />
          </div>
        </div>
      </section>

      {/* §I — Le refus */}
      <section className="mp-block">
        <div className="mp-container sy-wrap sy-rv">
          <div className="mp-head">
            <span className="mp-index" aria-hidden="true">
              I
            </span>
            <span className="mp-kicker">{t('pubHome.about.refusalKicker')}</span>
          </div>
          <div className="mp-prose">
            <p className="mp-strong">{t('pubHome.about.refusalStrong')}</p>
            <p>{t('pubHome.about.refusalP1')}</p>
            <p>{t('pubHome.about.refusalP2')}</p>
            <p>{t('pubHome.about.refusalP3')}</p>
          </div>
        </div>
      </section>

      {/* §II — La méthode */}
      <section className="mp-block">
        <div className="mp-container sy-wrap sy-rv">
          <div className="mp-head">
            <span className="mp-index" aria-hidden="true">
              II
            </span>
            <span className="mp-kicker">{t('pubHome.about.methodKicker')}</span>
          </div>
          <div className="mp-piliers">
            <div className="mp-pilier sy-glass">
              <span className="mp-pilier-num">01</span>
              <h3 className="mp-pilier-titre">{t('pubHome.about.pillar1Title')}</h3>
              <p className="mp-pilier-texte">{t('pubHome.about.pillar1Text')}</p>
            </div>
            <div className="mp-pilier sy-glass">
              <span className="mp-pilier-num">02</span>
              <h3 className="mp-pilier-titre">{t('pubHome.about.pillar2Title')}</h3>
              <p className="mp-pilier-texte">{t('pubHome.about.pillar2Text')}</p>
            </div>
            <div className="mp-pilier sy-glass">
              <span className="mp-pilier-num">03</span>
              <h3 className="mp-pilier-titre">{t('pubHome.about.pillar3Title')}</h3>
              <p className="mp-pilier-texte">{t('pubHome.about.pillar3Text')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* §III — Comment on travaille */}
      <section className="mp-block">
        <div className="mp-container sy-wrap sy-rv">
          <div className="mp-head">
            <span className="mp-index" aria-hidden="true">
              III
            </span>
            <span className="mp-kicker">{t('pubHome.about.workKicker')}</span>
          </div>
          <div className="mp-prose">
            <p className="mp-strong">{t('pubHome.about.workStrong')}</p>
            <p>{t('pubHome.about.workP1')}</p>
            <p>{t('pubHome.about.workP2')}</p>
          </div>
        </div>
      </section>

      {/* §IV — Nos pôles */}
      <section id="poles" className="mp-block">
        <div className="mp-container sy-wrap sy-rv">
          <div className="mp-head">
            <span className="mp-index" aria-hidden="true">
              IV
            </span>
            <span className="mp-kicker">{t('pubHome.about.polesKicker')}</span>
          </div>
          <div className="mp-prose">
            <p className="mp-strong">{t('pubHome.about.polesStrong')}</p>
            <p>{t('pubHome.about.polesP')}</p>
          </div>

          <div style={{ marginTop: 'var(--mp-sp-l)' }}>
            {POLES.map((p) => (
              <a key={p.name} className="mp-row sy-glass" href={p.link} target="_blank" rel="noopener noreferrer">
                <div>
                  <div className="mp-row-name">{p.name}</div>
                  <div className="mp-row-desc">{t(p.desc)}</div>
                </div>
                <span className="mp-row-go">
                  {t('pubHome.about.polesGo')} <span className="mp-ar">↗</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* §V — Questions fréquentes */}
      <section className="mp-block">
        <div className="mp-container sy-wrap sy-rv">
          <Faq items={APROPOS_FAQ} />
        </div>
      </section>

      <NeedStart preset="a-propos" />
    </div>
  )
}

export default APropos
