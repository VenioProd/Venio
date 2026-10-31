import type { Lead, LeadAlert, WorklistThresholds } from '../../../types/crm.types'
import { translate, type MessageKey } from '../../../i18n'

/**
 * Entrée d'une liste de référence du CRM : `key` est la valeur métier envoyée
 * à l'API, `labelKey` la clé du libellé affiché (à passer à `t()` au rendu).
 */
export interface CrmOption {
  key: string
  labelKey: MessageKey
  color: string
}

export const CRM_STATUSES: CrmOption[] = [
  { key: 'LEAD', labelKey: 'crm.status.lead', color: '#6366f1' },
  { key: 'QUALIFIED', labelKey: 'crm.status.qualified', color: '#0ea5e9' },
  { key: 'CONTACTED', labelKey: 'crm.status.contacted', color: '#8b5cf6' },
  { key: 'DEMO', labelKey: 'crm.status.demo', color: '#f59e0b' },
  { key: 'PROPOSAL', labelKey: 'crm.status.proposal', color: '#f97316' },
  { key: 'WON', labelKey: 'crm.status.won', color: '#22c55e' },
  { key: 'LOST', labelKey: 'crm.status.lost', color: '#ef4444' },
]

export const CRM_PRIORITIES: CrmOption[] = [
  { key: 'BASSE', labelKey: 'crm.priority.low', color: '#64748b' },
  { key: 'NORMALE', labelKey: 'crm.priority.normal', color: '#0ea5e9' },
  { key: 'HAUTE', labelKey: 'crm.priority.high', color: '#f59e0b' },
  { key: 'URGENTE', labelKey: 'crm.priority.urgent', color: '#ef4444' },
]

// i18n-ignore : valeurs métier envoyées à l'API (le libellé affiché passe par SOURCE_LABEL_KEYS)
export const CRM_SOURCES = ['Ads', 'Site', 'Referral', 'R\u00e9seaux sociaux', 'Email', 'Autre']

/** Valeur métier → clé du libellé affiché. Une valeur inconnue est affichée telle quelle. */
export const SOURCE_LABEL_KEYS: Record<string, MessageKey> = {
  Ads: 'crm.source.ads',
  Site: 'crm.source.site',
  Referral: 'crm.source.referral',
  // i18n-ignore : valeur métier envoyée à l'API, clé de la table de libellés
  'R\u00e9seaux sociaux': 'crm.source.social',
  Email: 'crm.source.email',
  Autre: 'crm.source.other',
}

/** Idem pour CRM_SERVICE_TYPES (src/lib/formatUtils.ts), dont les valeurs partent à l'API. */
export const SERVICE_TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  Communication: 'crm.service.communication',
  // i18n-ignore : valeur métier envoyée à l'API, clé de la table de libellés
  'D\u00e9veloppement web': 'crm.service.webDev',
  // i18n-ignore : valeur métier envoyée à l'API, clé de la table de libellés
  'D\u00e9veloppement mobile': 'crm.service.mobileDev',
  // i18n-ignore : valeur métier envoyée à l'API, clé de la table de libellés
  'Conseil strat\u00e9gique': 'crm.service.consulting',
  'Design & UX': 'crm.service.design',
  'Marketing digital': 'crm.service.marketing',
  'SEO/SEA': 'crm.service.seo',
  Formation: 'crm.service.training',
  Maintenance: 'crm.service.maintenance',
  Autre: 'crm.service.other',
}

/** Libellé affiché d'une valeur métier ; une valeur absente de la table reste telle quelle. */
export function labelOfValue(
  t: (key: MessageKey) => string,
  table: Record<string, MessageKey>,
  value: string | undefined | null,
): string {
  if (!value) return ''
  const key = table[value]
  return key ? t(key) : value
}

// Projet / produit concerné par un lead. Les leads historiques n'en ont pas
// (project vide) : l'interface affiche alors « — ».
export const CRM_PROJECTS: CrmOption[] = [
  { key: 'ARTOSERA', labelKey: 'crm.project.artosera', color: '#ec4899' },
  { key: 'VIGNO', labelKey: 'crm.project.vigno', color: '#22c55e' },
  { key: 'ARROW', labelKey: 'crm.project.arrow', color: '#0ea5e9' },
  { key: 'VENIO', labelKey: 'crm.project.venio', color: '#8b5cf6' },
  { key: 'AUTRE', labelKey: 'crm.project.other', color: '#64748b' },
]

export const CRM_TEMPERATURES: CrmOption[] = [
  { key: 'FROID', labelKey: 'crm.temperature.cold', color: '#64748b' },
  { key: 'TIEDE', labelKey: 'crm.temperature.warm', color: '#f59e0b' },
  { key: 'CHAUD', labelKey: 'crm.temperature.hot', color: '#f97316' },
  { key: 'TRES_CHAUD', labelKey: 'crm.temperature.veryHot', color: '#ef4444' },
]

export const STATUS_MAP: Record<string, CrmOption> = Object.fromEntries(CRM_STATUSES.map((s) => [s.key, s]))
export const PRIORITY_MAP: Record<string, CrmOption> = Object.fromEntries(CRM_PRIORITIES.map((p) => [p.key, p]))
export const PROJECT_MAP: Record<string, CrmOption> = Object.fromEntries(CRM_PROJECTS.map((p) => [p.key, p]))
export const TEMPERATURE_MAP: Record<string, CrmOption> = Object.fromEntries(CRM_TEMPERATURES.map((t) => [t.key, t]))

export const EMPTY_FORM = {
  company: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  source: '',
  project: '',
  budget: '',
  priority: 'NORMALE',
  status: 'LEAD',
  nextActionAt: '',
  notes: '',
  serviceType: '',
  leadTemperature: 'TIEDE',
  interactionNotes: '',
  assignedTo: '',
}

// Seuils utilisés tant que le serveur n'a pas répondu. Ils reproduisent les
// valeurs par défaut de CrmSettings ; dès que /crm/worklist a répondu, ce sont
// les seuils réellement configurés qui s'appliquent.
export const DEFAULT_WORKLIST_THRESHOLDS: WorklistThresholds = {
  coldEnabled: true,
  coldDays: 7,
  overdueEnabled: true,
  staleEnabled: true,
  staleDays: 14,
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

const daysSince = (value: string) => Math.floor((Date.now() - new Date(value).getTime()) / MS_PER_DAY)

// Badges d'alerte d'un lead, selon les seuils configurés dans
// /admin/crm/settings — et non selon des constantes en dur.
export const getLeadAlerts = (
  lead: Lead,
  thresholds: WorklistThresholds = DEFAULT_WORKLIST_THRESHOLDS,
): LeadAlert[] => {
  const alerts: LeadAlert[] = []
  if (['WON', 'LOST'].includes(lead.status)) return alerts

  if (thresholds.coldEnabled && lead.lastContactAt) {
    const days = daysSince(lead.lastContactAt)
    if (days >= thresholds.coldDays) {
      alerts.push({ type: 'cold', label: translate('crm.alert.cold', { days }), color: '#64748b' })
    }
  }

  if (thresholds.overdueEnabled && lead.nextActionAt && new Date(lead.nextActionAt) < new Date()) {
    alerts.push({ type: 'overdue', label: translate('crm.alert.overdue'), color: '#ef4444' })
  }

  if (thresholds.staleEnabled && lead.statusChangedAt) {
    const days = daysSince(lead.statusChangedAt)
    if (days >= thresholds.staleDays) {
      alerts.push({ type: 'stale', label: translate('crm.alert.stale', { days }), color: '#f59e0b' })
    }
  }

  return alerts
}
