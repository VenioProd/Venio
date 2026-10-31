import { translate, type MessageKey } from '../i18n'

export type PortfolioFilter = 'site' | 'product' | 'b2b'

export type PortfolioCategory = 'site' | 'produit'

export interface PortfolioProject {
  slug: string
  /** Catégorie d'affichage (filtres de la page Réalisations) : un projet, une seule. */
  category: PortfolioCategory
  title: string
  eyebrow: string
  description: string
  tags: string[]
  filters: PortfolioFilter[]
  url: string
  linkLabel: string
  desktopImage: string
  mobileImage: string
  layout: 'wide' | 'standard'
}

// Keep these files outside a prerendered route directory: the prerender step
// recreates /realisations and would otherwise remove its nested static files.
const shot = (name: string) => `/portfolio/${name}.jpg`

// Every entry below links to a reachable published experience. No mock project is
// intentionally included in the public portfolio.
export const PORTFOLIO_PROJECTS: PortfolioProject[] = [
  {
    slug: 'venio',
    category: 'site',
    title: 'Venio',
    get eyebrow() {
      return translate('pubHome.portfolio.venioEyebrow')
    },
    get description() {
      return translate('pubHome.portfolio.venioDescription')
    },
    get tags() {
      return [1, 2, 3].map((n) => translate(`pubHome.portfolio.venioTag${n}` as MessageKey))
    },
    filters: ['site', 'b2b'],
    url: 'https://venio.paris/',
    get linkLabel() {
      return translate('pubHome.portfolio.linkSite')
    },
    desktopImage: shot('venio-desktop'),
    mobileImage: shot('venio-mobile'),
    layout: 'wide',
  },
  {
    slug: 'formatio',
    category: 'site',
    title: 'Formatio',
    get eyebrow() {
      return translate('pubHome.portfolio.formatioEyebrow')
    },
    get description() {
      return translate('pubHome.portfolio.formatioDescription')
    },
    get tags() {
      return [1, 2, 3].map((n) => translate(`pubHome.portfolio.formatioTag${n}` as MessageKey))
    },
    filters: ['site', 'b2b'],
    url: 'https://formatio.paris/',
    get linkLabel() {
      return translate('pubHome.portfolio.linkSite')
    },
    desktopImage: shot('formatio-desktop'),
    mobileImage: shot('formatio-mobile'),
    layout: 'standard',
  },
  {
    slug: 'absys',
    category: 'site',
    title: 'Absys',
    get eyebrow() {
      return translate('pubHome.portfolio.absysEyebrow')
    },
    get description() {
      return translate('pubHome.portfolio.absysDescription')
    },
    get tags() {
      return [1, 2, 3].map((n) => translate(`pubHome.portfolio.absysTag${n}` as MessageKey))
    },
    filters: ['site'],
    url: 'https://absys.school/',
    get linkLabel() {
      return translate('pubHome.portfolio.linkSite')
    },
    desktopImage: shot('absys-desktop'),
    mobileImage: shot('absys-mobile'),
    layout: 'standard',
  },
  {
    slug: 'cauchemar',
    category: 'site',
    title: 'Cauchemar',
    get eyebrow() {
      return translate('pubHome.portfolio.cauchemarEyebrow')
    },
    get description() {
      return translate('pubHome.portfolio.cauchemarDescription')
    },
    get tags() {
      return [1, 2, 3].map((n) => translate(`pubHome.portfolio.cauchemarTag${n}` as MessageKey))
    },
    filters: ['site'],
    url: 'https://cauchemar.me/',
    get linkLabel() {
      return translate('pubHome.portfolio.linkSite')
    },
    desktopImage: shot('cauchemar-desktop'),
    mobileImage: shot('cauchemar-mobile'),
    layout: 'wide',
  },
  {
    slug: 'yumi',
    category: 'produit',
    title: 'Yumi',
    get eyebrow() {
      return translate('pubHome.portfolio.yumiEyebrow')
    },
    get description() {
      return translate('pubHome.portfolio.yumiDescription')
    },
    get tags() {
      return [1, 2, 3].map((n) => translate(`pubHome.portfolio.yumiTag${n}` as MessageKey))
    },
    filters: ['product'],
    url: 'https://yumicv.com/',
    get linkLabel() {
      return translate('pubHome.portfolio.linkProduct')
    },
    desktopImage: shot('yumi-desktop'),
    mobileImage: shot('yumi-mobile'),
    layout: 'wide',
  },
  {
    slug: 'jiraya',
    category: 'produit',
    title: 'Jiraya',
    get eyebrow() {
      return translate('pubHome.portfolio.jirayaEyebrow')
    },
    get description() {
      return translate('pubHome.portfolio.jirayaDescription')
    },
    get tags() {
      return [1, 2, 3].map((n) => translate(`pubHome.portfolio.jirayaTag${n}` as MessageKey))
    },
    filters: ['product', 'b2b'],
    url: 'https://game.susanoo.app/',
    get linkLabel() {
      return translate('pubHome.portfolio.linkProduct')
    },
    desktopImage: shot('jiraya-desktop'),
    mobileImage: shot('jiraya-mobile'),
    layout: 'standard',
  },
  {
    slug: 'hanami',
    category: 'produit',
    title: 'Hanami',
    get eyebrow() {
      return translate('pubHome.portfolio.hanamiEyebrow')
    },
    get description() {
      return translate('pubHome.portfolio.hanamiDescription')
    },
    get tags() {
      return [1, 2, 3].map((n) => translate(`pubHome.portfolio.hanamiTag${n}` as MessageKey))
    },
    filters: ['product'],
    url: 'https://temporary.susanoo.app/hanami/',
    get linkLabel() {
      return translate('pubHome.portfolio.linkExperience')
    },
    desktopImage: shot('hanami-desktop'),
    mobileImage: shot('hanami-mobile'),
    layout: 'standard',
  },
  {
    slug: 'decisio',
    category: 'site',
    title: 'Decisio',
    get eyebrow() {
      return translate('pubHome.portfolio.decisioEyebrow')
    },
    get description() {
      return translate('pubHome.portfolio.decisioDescription')
    },
    get tags() {
      return [1, 2, 3].map((n) => translate(`pubHome.portfolio.decisioTag${n}` as MessageKey))
    },
    filters: ['site', 'b2b'],
    url: 'https://decisio.paris/',
    get linkLabel() {
      return translate('pubHome.portfolio.linkSite')
    },
    desktopImage: shot('decisio-desktop'),
    mobileImage: shot('decisio-mobile'),
    layout: 'wide',
  },
  {
    slug: 'absys-simulator',
    category: 'produit',
    title: 'Absys Simulator',
    get eyebrow() {
      return translate('pubHome.portfolio.absysSimulatorEyebrow')
    },
    get description() {
      return translate('pubHome.portfolio.absysSimulatorDescription')
    },
    get tags() {
      return [1, 2, 3].map((n) => translate(`pubHome.portfolio.absysSimulatorTag${n}` as MessageKey))
    },
    filters: ['product', 'b2b'],
    url: 'https://simulator.absys.school/',
    get linkLabel() {
      return translate('pubHome.portfolio.linkSimulator')
    },
    desktopImage: shot('absys-simulator-desktop'),
    mobileImage: shot('absys-simulator-mobile'),
    layout: 'standard',
  },
]
