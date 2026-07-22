export type PortfolioFilter = 'site' | 'product' | 'b2b'

export interface PortfolioProject {
  slug: string
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
    title: 'Venio',
    eyebrow: 'Studio digital · B2B',
    description:
      'Un site-manifeste brutaliste qui transforme une posture de conseil en expérience éditoriale claire, frontale et immédiatement reconnaissable.',
    tags: ['Direction artistique', 'Design éditorial', 'Développement'],
    filters: ['site', 'b2b'],
    url: 'https://venio.paris/',
    linkLabel: 'Voir le site',
    desktopImage: shot('venio-desktop'),
    mobileImage: shot('venio-mobile'),
    layout: 'wide',
  },
  {
    slug: 'formatio',
    title: 'Formatio',
    eyebrow: 'Formation professionnelle',
    description:
      'Une présence premium et rassurante pour présenter l’expertise, la méthode et les parcours sans tomber dans les codes froids de la formation.',
    tags: ['Branding', 'UX', 'Site vitrine'],
    filters: ['site', 'b2b'],
    url: 'https://formatio.paris/',
    linkLabel: 'Voir le site',
    desktopImage: shot('formatio-desktop'),
    mobileImage: shot('formatio-mobile'),
    layout: 'standard',
  },
  {
    slug: 'absys',
    title: 'Absys',
    eyebrow: 'École · Enseignement supérieur',
    description:
      'Une identité élégante, lumineuse et institutionnelle pour installer une jeune école dans un univers de confiance et d’exigence.',
    tags: ['Identité', 'Web design', 'Acquisition'],
    filters: ['site'],
    url: 'https://absys.school/',
    linkLabel: 'Voir le site',
    desktopImage: shot('absys-desktop'),
    mobileImage: shot('absys-mobile'),
    layout: 'standard',
  },
  {
    slug: 'cauchemar',
    title: 'Cauchemar',
    eyebrow: 'Agence créative',
    description:
      'Une marque qui assume son contraste : inquiétante au premier regard, rassurante dans le fond. Un territoire visuel conçu pour ne pas se faire oublier.',
    tags: ['Concept de marque', 'Art direction', 'Copywriting'],
    filters: ['site'],
    url: 'https://cauchemar.me/',
    linkLabel: 'Voir le site',
    desktopImage: shot('cauchemar-desktop'),
    mobileImage: shot('cauchemar-mobile'),
    layout: 'wide',
  },
  {
    slug: 'yumi',
    title: 'Yumi',
    eyebrow: 'Produit RH · SaaS',
    description:
      'Un créateur de CV pensé à la fois pour les humains et les ATS, porté par une landing produit lisible, internationale et orientée conversion.',
    tags: ['Product design', 'SaaS', 'Conversion'],
    filters: ['product'],
    url: 'https://yumicv.com/',
    linkLabel: 'Voir le produit',
    desktopImage: shot('yumi-desktop'),
    mobileImage: shot('yumi-mobile'),
    layout: 'wide',
  },
  {
    slug: 'jiraya',
    title: 'Jiraya',
    eyebrow: 'EdTech · Simulation',
    description:
      'Une plateforme de business games compétitifs qui rend immédiatement visible la promesse : décider, mesurer et affronter les autres en temps réel.',
    tags: ['Plateforme', 'Temps réel', 'Gamification'],
    filters: ['product', 'b2b'],
    url: 'https://game.susanoo.app/',
    linkLabel: 'Voir le produit',
    desktopImage: shot('jiraya-desktop'),
    mobileImage: shot('jiraya-mobile'),
    layout: 'standard',
  },
  {
    slug: 'hanami',
    title: 'Hanami',
    eyebrow: 'Expérience éditoriale',
    description:
      'Une exploration produit autour de la découverte d’anime : curation par humeur, identité saisonnière et navigation conçue comme un magazine vivant.',
    tags: ['Concept produit', 'UI design', 'Prototype'],
    filters: ['product'],
    url: 'https://temporary.susanoo.app/hanami/',
    linkLabel: 'Voir l’expérience',
    desktopImage: shot('hanami-desktop'),
    mobileImage: shot('hanami-mobile'),
    layout: 'standard',
  },
  {
    slug: 'decisio',
    title: 'Decisio',
    eyebrow: 'Communication juridique · B2B',
    description:
      'Une présence digitale dédiée aux professionnels du droit, conçue pour rendre l’offre, le conseil et la communication juridique immédiatement lisibles.',
    tags: ['Positionnement', 'Communication juridique', 'Site web'],
    filters: ['site', 'b2b'],
    url: 'https://decisio.paris/',
    linkLabel: 'Voir le site',
    desktopImage: shot('decisio-desktop'),
    mobileImage: shot('decisio-mobile'),
    layout: 'wide',
  },
  {
    slug: 'absys-simulator',
    title: 'Absys Simulator',
    eyebrow: 'EdTech · Simulation',
    description:
      'Une plateforme de simulation pédagogique qui donne aux étudiants et aux instructeurs un espace concret pour décider, suivre et analyser.',
    tags: ['Produit EdTech', 'Simulation', 'UX applicative'],
    filters: ['product', 'b2b'],
    url: 'https://simulator.absys.school/',
    linkLabel: 'Voir le simulateur',
    desktopImage: shot('absys-simulator-desktop'),
    mobileImage: shot('absys-simulator-mobile'),
    layout: 'standard',
  },
]
