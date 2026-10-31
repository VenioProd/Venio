import { translate } from '../i18n'

export const OFFER_IDS = ['vitrine', 'essentiel', 'business', 'ecommerce', 'plateforme'] as const

export type OfferId = (typeof OFFER_IDS)[number]

export const OFFER_LABELS: Record<OfferId, string> = {
  get vitrine() {
    return translate('pubHome.proofs.vitrine')
  },
  get essentiel() {
    return translate('pubHome.proofs.essentiel')
  },
  get business() {
    return translate('pubHome.proofs.business')
  },
  get ecommerce() {
    return translate('pubHome.proofs.ecommerce')
  },
  get plateforme() {
    return translate('pubHome.proofs.plateforme')
  },
}

export interface PublicCaseStudy {
  slug: string
  title: string
  clientName: string
  summary: string
  scope: string[]
  relatedOffers: OfferId[]
  authorization: {
    approvedAt: string
    evidenceLocation: string
  }
}

export interface PublicTestimonial {
  quote: string
  authorName: string
  authorRole: string
  clientName: string
  relatedOffers: OfferId[]
  authorization: {
    approvedAt: string
    evidenceLocation: string
  }
}

/**
 * Intentionally empty until the publication gate described in
 * docs/public/PUBLIC_PROOFS.md is satisfied for each item.
 */
export const PUBLIC_CASE_STUDIES: PublicCaseStudy[] = []
export const PUBLIC_TESTIMONIALS: PublicTestimonial[] = []
