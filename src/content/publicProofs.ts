export const OFFER_IDS = ['vitrine', 'essentiel', 'business', 'ecommerce', 'plateforme'] as const

export type OfferId = (typeof OFFER_IDS)[number]

export const OFFER_LABELS: Record<OfferId, string> = {
  vitrine: 'Vitrine',
  essentiel: 'Essentiel',
  business: 'Business',
  ecommerce: 'E-commerce',
  plateforme: 'Plateforme',
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
