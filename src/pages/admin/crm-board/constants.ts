import type { CrmStatusConfig, Lead, LeadAlert } from '@/types/crm.types'

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
export const TEMPERATURE_MAP: Record<string, CrmStatusConfig> = Object.fromEntries(CRM_TEMPERATURES.map((t) => [t.key, t]))

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

// Helper to calculate lead alerts
export const getLeadAlerts = (lead: Lead): LeadAlert[] => {
  const alerts: LeadAlert[] = []
  const now = new Date()

  // Lead froid (7+ jours sans contact)
  if (lead.lastContactAt && !['WON', 'LOST'].includes(lead.status)) {
    const daysSince = Math.floor((now.getTime() - new Date(lead.lastContactAt).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince >= 7) {
      alerts.push({ type: 'cold', label: `Froid (${daysSince}j)`, color: '#64748b' })
    }
  }

  // Action en retard
  if (lead.nextActionAt && new Date(lead.nextActionAt) < now && !['WON', 'LOST'].includes(lead.status)) {
    alerts.push({ type: 'overdue', label: 'En retard', color: '#ef4444' })
  }

  // Statut bloqu\u00e9 (14+ jours)
  if (lead.statusChangedAt && !['WON', 'LOST'].includes(lead.status)) {
    const daysSince = Math.floor((now.getTime() - new Date(lead.statusChangedAt).getTime()) / (1000 * 60 * 60 * 24))
    if (daysSince >= 14) {
      alerts.push({ type: 'stale', label: `Bloqu\u00e9 (${daysSince}j)`, color: '#f59e0b' })
    }
  }

  return alerts
}
