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
    label: 'Communication',
    description: 'Identité de marque, contenus et cohérence éditoriale.',
    to: '/services/communication',
  },
  {
    label: 'Conseil',
    description: 'Audit, priorités et décisions stratégiques.',
    to: '/services/conseil',
  },
  {
    label: 'Développement',
    description: 'Applications et outils métier qui durent.',
    to: '/services/developpement',
  },
]
