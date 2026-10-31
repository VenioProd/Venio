import type { ArrowSchoolFormData } from '../../../types/arrow.types'
import type { MessageKey } from '../../../i18n'

/** `key` est la valeur métier envoyée à l'API, `labelKey` la clé du libellé affiché. */
export interface ArrowOption {
  key: string
  labelKey: MessageKey
  color: string
}

export const ARROW_STATUSES: ArrowOption[] = [
  { key: 'A_PROSPECTER', labelKey: 'crm.arrow.status.toProspect', color: '#6366f1' },
  { key: 'CONTACTE', labelKey: 'crm.arrow.status.contacted', color: '#0ea5e9' },
  { key: 'REPONSE', labelKey: 'crm.arrow.status.replied', color: '#8b5cf6' },
  { key: 'DEMO_PLANIFIEE', labelKey: 'crm.arrow.status.demoScheduled', color: '#f59e0b' },
  { key: 'DEMO_FAITE', labelKey: 'crm.arrow.status.demoDone', color: '#f97316' },
  { key: 'PROPOSITION', labelKey: 'crm.arrow.status.proposal', color: '#ec4899' },
  { key: 'SIGNE', labelKey: 'crm.arrow.status.signed', color: '#22c55e' },
  { key: 'NON_INTERESSE', labelKey: 'crm.arrow.status.notInterested', color: '#ef4444' },
]

export const ARROW_SCHOOL_TYPES: { key: string; labelKey: MessageKey }[] = [
  { key: 'LYCEE', labelKey: 'crm.arrow.type.highSchool' },
  { key: 'BTS_IUT', labelKey: 'crm.arrow.type.btsIut' },
  { key: 'UNIVERSITE', labelKey: 'crm.arrow.type.university' },
  { key: 'ECOLE_SUP', labelKey: 'crm.arrow.type.college' },
  { key: 'CFA', labelKey: 'crm.arrow.type.cfa' },
  { key: 'AUTRE', labelKey: 'crm.arrow.type.other' },
]

export const ARROW_TEMPERATURES: ArrowOption[] = [
  { key: 'FROID', labelKey: 'crm.temperature.cold', color: '#64748b' },
  { key: 'TIEDE', labelKey: 'crm.temperature.warm', color: '#f59e0b' },
  { key: 'CHAUD', labelKey: 'crm.temperature.hot', color: '#f97316' },
  { key: 'TRES_CHAUD', labelKey: 'crm.temperature.veryHot', color: '#ef4444' },
]

// i18n-ignore : valeurs métier envoyées à l'API (le libellé affiché passe par ARROW_SOURCE_LABEL_KEYS)
export const ARROW_SOURCES = ['LinkedIn', 'Prospection terrain', 'Réseau', 'Référence', 'Site web', 'Salon', 'Autre']

/** Valeur métier → clé du libellé affiché. Une valeur inconnue est affichée telle quelle. */
export const ARROW_SOURCE_LABEL_KEYS: Record<string, MessageKey> = {
  LinkedIn: 'crm.arrow.source.linkedin',
  'Prospection terrain': 'crm.arrow.source.field',
  Réseau: 'crm.arrow.source.network',
  Référence: 'crm.arrow.source.referral',
  'Site web': 'crm.arrow.source.website',
  Salon: 'crm.arrow.source.tradeShow',
  Autre: 'crm.source.other',
}

export const STATUS_MAP: Record<string, ArrowOption> = Object.fromEntries(ARROW_STATUSES.map((s) => [s.key, s]))
export const TEMPERATURE_MAP: Record<string, ArrowOption> = Object.fromEntries(
  ARROW_TEMPERATURES.map((t) => [t.key, t]),
)
export const SCHOOL_TYPE_MAP: Record<string, { key: string; labelKey: MessageKey }> = Object.fromEntries(
  ARROW_SCHOOL_TYPES.map((t) => [t.key, t]),
)

export const EMPTY_RELANCE = { date: null, done: false, note: '' }

export const EMPTY_FORM: ArrowSchoolFormData = {
  name: '',
  schoolType: 'AUTRE',
  city: '',
  region: '',
  studentCount: '',
  emailGeneral: '',
  contactName: '',
  contactRole: '',
  contactEmail: '',
  contactPhone: '',
  status: 'A_PROSPECTER',
  temperature: 'TIEDE',
  source: '',
  notes: '',
  nextActionAt: '',
  lastContactAt: '',
  assignedTo: '',
  relances: [],
}
