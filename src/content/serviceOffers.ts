import { translate } from '../i18n'

export interface ServiceOfferLink {
  label: string
  description: string
  to: string
}

/** Libellés lus à l'accès : ils suivent la langue active. */
export const serviceOffers: readonly ServiceOfferLink[] = [
  {
    get label() {
      return translate('pubHome.offers.sitesLabel')
    },
    get description() {
      return translate('pubHome.offers.sitesDescription')
    },
    to: '/services/sites',
  },
  {
    get label() {
      return translate('pubHome.offers.conseilLabel')
    },
    get description() {
      return translate('pubHome.offers.conseilDescription')
    },
    to: '/conseil-communication',
  },
]
