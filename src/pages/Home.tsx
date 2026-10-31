import { Fragment, useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import SEO from '../components/SEO'
import StructuredData from '../components/StructuredData'
import { GrainOverlay } from '../components/BrutalDeco'
import { useReveal } from '../hooks/useReveal'
import { useSpotlight } from '../hooks/useSpotlight'
import { InstrumentRings, LineIcon, type LineIconName } from '../components/graphics'
import TierDial, { type HomeTier } from '../components/home/TierDial'
import ProofRadar from '../components/home/ProofRadar'
import DualCta from '../components/conversion/DualCta'
import TrustLine from '../components/conversion/TrustLine'
import Faq from '../components/conversion/Faq'
import NeedStart from '../components/qualification/NeedStart'
import { HOME_FAQ } from '../content/faq'
import { useI18n } from '../context/I18nContext'
import type { MessageKey } from '../i18n'
import '../styles/monolithe-home.css'

type TierN = 1 | 2 | 3 | 4 | 5

const TIER_DEFS: { n: TierN; num: string; thumb: HomeTier['thumb']; icon: HomeTier['icon']; featured: boolean }[] = [
  { n: 1, num: '01', thumb: 'vitrine', icon: 'vitrine', featured: false },
  { n: 2, num: '02', thumb: 'essentiel', icon: 'essentiel', featured: false },
  { n: 3, num: '03', thumb: 'business', icon: 'business', featured: true },
  { n: 4, num: '04', thumb: 'boutique', icon: 'ecommerce', featured: false },
  { n: 5, num: '05', thumb: 'mesure', icon: 'plateforme', featured: false },
]

const ARGUMENTS = [
  { num: '01', titre: 'pubHome.home.arg1Title', texte: 'pubHome.home.arg1Text' },
  { num: '02', titre: 'pubHome.home.arg2Title', texte: 'pubHome.home.arg2Text' },
  { num: '03', titre: 'pubHome.home.arg3Title', texte: 'pubHome.home.arg3Text' },
] as const satisfies readonly { num: string; titre: MessageKey; texte: MessageKey }[]

/* Quatre métiers hors formules. Le conseil marketing ouvre la liste : il a sa
   propre page. Les trois autres ouvrent le formulaire de contact avec le
   besoin déjà coché (?besoin=). */
const METIERS = [
  {
    num: '01',
    nom: 'pubHome.home.job1Name',
    to: '/conseil-communication',
    icon: 'megaphone',
    nouveau: true,
    titre: 'pubHome.home.job1Title',
    texte: 'pubHome.home.job1Text',
    inutile: 'pubHome.home.job1Nope',
  },
  {
    num: '02',
    nom: 'pubHome.home.job2Name',
    to: '/contact?besoin=flou',
    icon: 'doc',
    nouveau: false,
    titre: 'pubHome.home.job2Title',
    texte: 'pubHome.home.job2Text',
    inutile: 'pubHome.home.job2Nope',
  },
  {
    num: '03',
    nom: 'pubHome.home.job3Name',
    to: '/contact?besoin=marque',
    icon: 'glyph',
    nouveau: false,
    titre: 'pubHome.home.job3Title',
    texte: 'pubHome.home.job3Text',
    inutile: 'pubHome.home.job3Nope',
  },
  {
    num: '04',
    nom: 'pubHome.home.job4Name',
    to: '/contact?besoin=outil',
    icon: 'code',
    nouveau: false,
    titre: 'pubHome.home.job4Title',
    texte: 'pubHome.home.job4Text',
    inutile: 'pubHome.home.job4Nope',
  },
] as const satisfies readonly {
  num: string
  nom: MessageKey
  to: string
  icon: LineIconName
  nouveau: boolean
  titre: MessageKey
  texte: MessageKey
  inutile: MessageKey
}[]

/* Les trois temps d'un projet ; l'étape active avance toute seule. */
const ETAPES = [
  { num: '01', titre: 'pubHome.home.step1Title', detail: 'pubHome.home.step1Detail', pole: 'pubHome.home.step1Pole' },
  { num: '02', titre: 'pubHome.home.step2Title', detail: 'pubHome.home.step2Detail', pole: 'pubHome.home.step2Pole' },
  { num: '03', titre: 'pubHome.home.step3Title', detail: 'pubHome.home.step3Detail', pole: 'pubHome.home.step3Pole' },
] as const satisfies readonly { num: string; titre: MessageKey; detail: MessageKey; pole: MessageKey }[]

/** Mots du titre : chacun monte de derrière un masque, au chargement. */
const Mots = ({ texte, depart, accent = false }: { texte: string; depart: number; accent?: boolean }) => {
  const mots = texte.split(' ')
  return (
    <>
      {mots.map((mot, k) => {
        const i = { '--i': depart + k } as CSSProperties
        return (
          <Fragment key={`${mot}-${k}`}>
            <span className="mh-w">
              <span className="mh-w-in" style={i}>
                {accent ? (
                  <span className="vn-shine" style={i}>
                    {mot}
                  </span>
                ) : (
                  mot
                )}
              </span>
            </span>
            {k < mots.length - 1 && ' '}
          </Fragment>
        )
      })}
    </>
  )
}

/* Plaque « Un projet Venio » : un fil lumineux relie les trois temps et
   l'étape active passe de l'une à la suivante. Coupé si le visiteur demande
   moins de mouvement : l'étape du milieu reste alors allumée. */
const ProjectPlate = () => {
  const { t } = useI18n()
  const [live, setLive] = useState(1)

  useEffect(() => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = window.setInterval(() => setLive((i) => (i + 1) % ETAPES.length), 2700)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="mh-pj vn-spot mh-intro" style={{ '--mh-i': 2 } as CSSProperties}>
      <div className="mh-pj-head">
        <span className="mh-mono">{t('pubHome.home.plateTitle')}</span>
        <span className="mh-mono">01 · 02 · 03</span>
      </div>
      <div className="mh-pj-body">
        <span className="mh-pj-wire" aria-hidden="true">
          <i />
        </span>
        <ol className="mh-pj-list">
          {ETAPES.map((e, k) => (
            <li key={e.num} className={k === live ? 'mh-pj-row is-live' : 'mh-pj-row'}>
              <span className="mh-pj-node">{e.num}</span>
              <div>
                <b>{t(e.titre)}</b>
                <p className="mh-mono">{t(e.detail)}</p>
              </div>
              <span className="mh-mono">{t(e.pole)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

const Home = () => {
  const { t } = useI18n()
  const tiers: HomeTier[] = TIER_DEFS.map((d) => ({
    num: d.num,
    name: t(`pubHome.home.tier${d.n}Name`),
    thumb: d.thumb,
    icon: d.icon,
    tag: t(`pubHome.home.tier${d.n}Tag`),
    pourQui: t(`pubHome.home.tier${d.n}Who`),
    incl: [t(`pubHome.home.tier${d.n}Incl1`), t(`pubHome.home.tier${d.n}Incl2`), t(`pubHome.home.tier${d.n}Incl3`)],
    featured: d.featured,
  }))
  const titre = t('pubHome.home.titleMain')
  // Même observateur que les autres pages publiques. Le hero, lui, ne passe
  // pas par là : son entrée est une animation au chargement, jamais
  // conditionnée à un observateur qui pourrait ne pas se déclencher.
  useReveal('.mh-home .mh-reveal', 'mh-visible')
  // Halo qui suit la souris sur les panneaux marqués .vn-spot.
  const rootRef = useSpotlight<HTMLDivElement>()

  return (
    <div className="mh-home" ref={rootRef}>
      <SEO
        title={t('pubHome.home.seoTitle')}
        description={t('pubHome.home.seoDescription')}
        keywords={t('pubHome.home.seoKeywords')}
      />
      <StructuredData type="home" />

      {/* ─── 01 · HERO ─── */}
      <section id="mh-releve">
        <InstrumentRings />
        <GrainOverlay opacity={0.035} />
        <div className="mh-container mh-releve-grid">
          <div className="mh-releve-text vn-fx">
            <p className="mh-eyebrow mh-mono mh-intro" style={{ '--mh-i': 0 } as CSSProperties}>
              <i aria-hidden="true" /> {t('pubHome.home.heroEyebrow')}
            </p>
            <h1 className="mh-releve-title">
              <Mots texte={titre} depart={0} />{' '}
              <Mots texte={t('pubHome.home.titleAccent')} depart={titre.split(' ').length} accent />
            </h1>
            <p className="mh-releve-sub mh-intro" style={{ '--mh-i': 2 } as CSSProperties}>
              {t('pubHome.home.heroSub')}
            </p>

            <div className="mh-intro" style={{ '--mh-i': 3 } as CSSProperties}>
              <DualCta align="start" />
              <TrustLine />
            </div>
          </div>

          <ProjectPlate />
        </div>
      </section>

      {/* ─── 02 · CADRAN DES CINQ FORMULES ─── */}
      <section id="mh-paliers">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> {t('pubHome.home.paliersEyebrow')}
            </p>
            <h2>
              {t('pubHome.home.paliersTitle')} <span className="vn-shine">{t('pubHome.home.paliersTitleAccent')}</span>
            </h2>
            <p className="mh-band-note">{t('pubHome.home.paliersNote')}</p>
          </header>

          <div className="mh-reveal">
            <TierDial tiers={tiers} />
          </div>

          <p className="mh-band-foot mh-reveal">
            <Link className="mh-link" to="/services/sites">
              {t('pubHome.home.paliersLink')} <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </section>

      {/* ─── 03 · AU-DELÀ DU SITE ─── */}
      <section id="mh-metiers">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> {t('pubHome.home.metiersEyebrow')}
            </p>
            <h2>
              {t('pubHome.home.metiersTitle')} <span className="vn-shine">{t('pubHome.home.metiersTitleAccent')}</span>
            </h2>
            <p className="mh-band-note">{t('pubHome.home.metiersNote')}</p>
          </header>

          <div className="mh-jobs">
            {METIERS.map((m, i) => (
              <Link
                key={m.num}
                to={m.to}
                className={`mh-job vn-spot mh-reveal${m.nouveau ? ' mh-job--feat' : ''}`}
                style={{ '--mh-i': i } as CSSProperties}
              >
                <span className="mh-job-head">
                  <LineIcon name={m.icon} delay={i * 80} />
                  {m.nouveau && <span className="mh-tag">{t('pubHome.home.jobNew')}</span>}
                </span>
                <span className="mh-mono mh-job-num">
                  {m.num} · {t(m.nom)}
                </span>
                <h3>{t(m.titre)}</h3>
                <p>{t(m.texte)}</p>
                <div className="mh-job-nope">
                  <span className="mh-mono">{t('pubHome.cta.nope')}</span>
                  <p>{t(m.inutile)}</p>
                </div>
                <span className="mh-job-go">
                  {t('pubHome.home.jobGo')} <span aria-hidden="true">→</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 04 · RADAR DES RÉALISATIONS ─── */}
      <section id="mh-preuve">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> {t('pubHome.home.preuveEyebrow')}
            </p>
            <h2>
              {t('pubHome.home.preuveTitle')} <span className="vn-shine">{t('pubHome.home.preuveTitleAccent')}</span>
            </h2>
          </header>

          <div className="mh-reveal">
            <ProofRadar />
          </div>

          <p className="mh-band-foot mh-reveal">
            <Link className="mh-link" to="/realisations">
              {t('pubHome.home.preuveLink')} <span aria-hidden="true">→</span>
            </Link>
          </p>
        </div>
      </section>

      {/* ─── 05 · TROIS ENGAGEMENTS OPPOSABLES ─── */}
      <section id="mh-engagements">
        <div className="mh-container">
          <header className="mh-band-head mh-reveal">
            <p className="mh-eyebrow mh-mono">
              <i aria-hidden="true" /> {t('pubHome.home.engEyebrow')}
            </p>
            <h2>
              {t('pubHome.home.engTitle')} <span className="vn-shine">{t('pubHome.home.engTitleAccent')}</span>
            </h2>
            <p className="mh-band-note">{t('pubHome.home.engNote')}</p>
          </header>

          <div className="mh-specs">
            {ARGUMENTS.map((a, i) => (
              <article key={a.num} className="mh-spec mh-reveal" style={{ '--mh-i': i } as CSSProperties}>
                <span className="mh-mono mh-spec-num">{a.num}</span>
                <h3>{t(a.titre)}</h3>
                <p>{t(a.texte)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 06 · QUESTIONS FRÉQUENTES ─── */}
      <section id="mh-faq">
        <div className="mh-container mh-reveal">
          <Faq items={HOME_FAQ} />
        </div>
      </section>

      {/* NeedStart : entrée du formulaire de qualification, à la place de l'ancien « appel de trente minutes ». */}
      <NeedStart />
    </div>
  )
}

export default Home
