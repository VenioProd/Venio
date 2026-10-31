import { intlLocale, translate, type MessageKey } from '../i18n'

/**
 * Format a number as currency for display (active language: fr 1 234,56 / en 1,234.56)
 */
export function formatCurrency(value: unknown, currency = 'EUR'): string {
  if (value === '' || value == null || Number.isNaN(Number(value))) return ''
  const n = Number(value)
  return n.toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Parse user input to number (accepts comma or dot as decimal separator, spaces ignored)
 */
export function parseCurrency(input: unknown): number | '' {
  if (input === '' || input == null) return ''
  const s = String(input).replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(s)
  return Number.isNaN(n) ? '' : n
}

/**
 * Format Date or ISO string to datetime-local value (YYYY-MM-DDTHH:mm)
 */
export function toDateTimeLocal(isoOrDate: string | Date | null | undefined): string {
  if (!isoOrDate) return ''
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${day}T${h}:${min}`
}

/**
 * Parse datetime-local value to ISO string
 */
export function fromDateTimeLocal(value: string): string {
  if (!value || !value.trim()) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/** Types de service CRM / comptes clients (lead -> client) */
export const CRM_SERVICE_TYPES = [
  'Communication',
  // i18n-ignore: valeur métier stockée, affichée via serviceTypeLabel()
  'Développement web',
  // i18n-ignore: valeur métier stockée, affichée via serviceTypeLabel()
  'Développement mobile',
  // i18n-ignore: valeur métier stockée, affichée via serviceTypeLabel()
  'Conseil stratégique',
  'Design & UX',
  'Marketing digital',
  'SEO/SEA',
  'Formation',
  'Maintenance',
  'Autre',
]

/** Suggestions for service types (admin project form) */
export const SUGGESTIONS_SERVICE_TYPES = [
  'Design',
  // i18n-ignore: valeur métier stockée, affichée via serviceTypeLabel()
  'Développement',
  'Conseil',
  // i18n-ignore: valeur métier stockée, affichée via serviceTypeLabel()
  'Stratégie',
  // i18n-ignore: valeur métier stockée, affichée via serviceTypeLabel()
  'Rédaction',
  'SEO',
  'Maquettage',
  // i18n-ignore: valeur métier stockée, affichée via serviceTypeLabel()
  'Intégration',
  'Formation',
  'Maintenance',
  'Autre',
]

/** Suggestions for deliverable types */
export const SUGGESTIONS_DELIVERABLE_TYPES = [
  'Maquettes',
  'Code source',
  'Documentation',
  'Cahier des charges',
  'Rapport',
  'Contenu',
  'Assets',
  'Lien',
  'Fichiers',
  'Autre',
]

/** Suggestions for tags */
export const SUGGESTIONS_TAGS = [
  'urgent',
  'refonte',
  'nouveau',
  'maintenance',
  'prestation',
  // i18n-ignore: tag libre stocké tel quel
  'récurrent',
  'prioritaire',
]

// Les valeurs ci-dessus sont des données métier (stockées / envoyées à l'API) : seul leur affichage est traduit.
const SERVICE_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  Communication: 'shared.serviceType.communication',
  // i18n-ignore: valeur métier stockée, affichée via serviceTypeLabel()
  'Développement web': 'shared.serviceType.webDevelopment',
  // i18n-ignore: valeur métier stockée, affichée via serviceTypeLabel()
  'Développement mobile': 'shared.serviceType.mobileDevelopment',
  // i18n-ignore: valeur métier stockée, affichée via serviceTypeLabel()
  'Conseil stratégique': 'shared.serviceType.strategicConsulting',
  'Design & UX': 'shared.serviceType.designUx',
  'Marketing digital': 'shared.serviceType.digitalMarketing',
  'SEO/SEA': 'shared.serviceType.seoSea',
  Formation: 'shared.serviceType.training',
  Maintenance: 'shared.serviceType.maintenance',
  Autre: 'shared.serviceType.other',
  Design: 'shared.serviceType.design',
  Développement: 'shared.serviceType.development',
  Conseil: 'shared.serviceType.consulting',
  Stratégie: 'shared.serviceType.strategy',
  Rédaction: 'shared.serviceType.copywriting',
  SEO: 'shared.serviceType.seo',
  Maquettage: 'shared.serviceType.mockups',
  Intégration: 'shared.serviceType.integration',
}

/** Libellé affiché d'un type de service (CRM_SERVICE_TYPES / SUGGESTIONS_SERVICE_TYPES) ; valeur inconnue : renvoyée telle quelle. */
export function serviceTypeLabel(value: string): string {
  const key = SERVICE_TYPE_LABEL_KEYS[value]
  return key ? translate(key) : value
}

const DELIVERABLE_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  Maquettes: 'shared.deliverableType.mockups',
  'Code source': 'shared.deliverableType.sourceCode',
  Documentation: 'shared.deliverableType.documentation',
  'Cahier des charges': 'shared.deliverableType.specs',
  Rapport: 'shared.deliverableType.report',
  Contenu: 'shared.deliverableType.content',
  Assets: 'shared.deliverableType.assets',
  Lien: 'shared.deliverableType.link',
  Fichiers: 'shared.deliverableType.files',
  Autre: 'shared.deliverableType.other',
}

/** Libellé affiché d'un type de livrable (SUGGESTIONS_DELIVERABLE_TYPES) ; valeur inconnue : renvoyée telle quelle. */
export function deliverableTypeLabel(value: string): string {
  const key = DELIVERABLE_TYPE_LABEL_KEYS[value]
  return key ? translate(key) : value
}
