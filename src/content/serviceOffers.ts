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
    label: 'Conseil & communication',
    description: 'Diagnostic, positionnement, plan de communication, contenus et mesure.',
    to: '/conseil-communication',
  },
]
