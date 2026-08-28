export interface ServiceOfferLink {
  label: string
  description: string
  to: string
}

export const serviceOffers: readonly ServiceOfferLink[] = [
  {
    label: 'Sites web',
    description: 'Sites vitrines, e-commerce et plateformes sur mesure.',
    to: '/services/sites',
  },
  {
    label: 'Au-delà du site',
    description: 'Conseil, développement sur mesure et communication.',
    to: '/au-dela-du-site',
  },
]
