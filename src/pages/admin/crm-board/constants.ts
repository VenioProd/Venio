import type { CrmStatusConfig, Lead, LeadAlert, WorklistThresholds } from '../../../types/crm.types'

export const CRM_STATUSES = [
  { key: 'LEAD', label: 'Lead', color: '#6366f1' },
  { key: 'QUALIFIED', label: 'Qualifi\u00e9', color: '#0ea5e9' },
  { key: 'CONTACTED', label: 'Contact\u00e9', color: '#8b5cf6' },
  { key: 'DEMO', label: 'D\u00e9mo', color: '#f59e0b' },
  { key: 'PROPOSAL', label: 'Proposition', color: '#f97316' },
  { key: 'WON', label: 'Gagn\u00e9', color: '#22c55e' },
  { key: 'LOST', label: 'Perdu', color: '#ef4444' },
]

export const CRM_PRIORITIES = [
  { key: 'BASSE', label: 'Basse', color: '#64748b' },
  { key: 'NORMALE', label: 'Normale', color: '#0ea5e9' },
  { key: 'HAUTE', label: 'Haute', color: '#f59e0b' },
  { key: 'URGENTE', label: 'Urgente', color: '#ef4444' },
]

export const CRM_SOURCES = ['Ads', 'Site', 'Referral', 'R\u00e9seaux sociaux', 'Email', 'Autre']

export const CRM_TEMPERATURES = [
  { key: 'FROID', label: 'Froid \u2744\ufe0f', color: '#64748b' },
  { key: 'TIEDE', label: 'Ti\u00e8de \ud83c\udf24\ufe0f', color: '#f59e0b' },
  { key: 'CHAUD', label: 'Chaud \ud83d\udd25', color: '#f97316' },
  { key: 'TRES_CHAUD', label: 'Tr\u00e8s chaud \ud83d\udd25\ud83d\udd25', color: '#ef4444' },
]

export const STATUS_MAP: Record<string, CrmStatusConfig> = Object.fromEntries(CRM_STATUSES.map((s) => [s.key, s]))
export const PRIORITY_MAP: Record<string, CrmStatusConfig> = Object.fromEntries(CRM_PRIORITIES.map((p) => [p.key, p]))
export const TEMPERATURE_MAP: Record<string, CrmStatusConfig> = Object.fromEntries(
  CRM_TEMPERATURES.map((t) => [t.key, t]),
)

export const EMPTY_FORM = {
  company: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  source: '',
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
      alerts.push({ type: 'cold', label: `Froid (${days}j)`, color: '#64748b' })
    }
  }

  if (thresholds.overdueEnabled && lead.nextActionAt && new Date(lead.nextActionAt) < new Date()) {
    alerts.push({ type: 'overdue', label: 'En retard', color: '#ef4444' })
  }

  if (thresholds.staleEnabled && lead.statusChangedAt) {
    const days = daysSince(lead.statusChangedAt)
    if (days >= thresholds.staleDays) {
      alerts.push({ type: 'stale', label: `Bloqué (${days}j)`, color: '#f59e0b' })
    }
  }

  return alerts
}
