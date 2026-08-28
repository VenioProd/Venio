export type CrmStatus = 'LEAD' | 'QUALIFIED' | 'CONTACTED' | 'DEMO' | 'PROPOSAL' | 'WON' | 'LOST'
export type CrmPriority = 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
export type CrmTemperature = 'FROID' | 'TIEDE' | 'CHAUD' | 'TRES_CHAUD'

export interface CrmStatusConfig {
  key: string
  label: string
  color: string
}

export interface Lead {
  _id: string
  company: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  source?: string
  budget?: number | null
  priority?: string
  status: string
  nextActionAt?: string | null
  lastContactAt?: string | null
  statusChangedAt?: string | null
  notes?: string
  serviceType?: string
  leadTemperature?: string
  interactionNotes?: string
  assignedTo?: string | null
  clientAccountId?: string | null
  score?: number | null
  createdAt?: string
  updatedAt?: string
}

export interface LeadAlert {
  type: 'cold' | 'overdue' | 'stale'
  label: string
  color: string
}

export interface LeadFormData {
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  source: string
  budget: string
  priority: string
  status: string
  nextActionAt: string
  notes: string
  serviceType: string
  leadTemperature: string
  interactionNotes: string
  assignedTo: string
}

export interface PipelineColumn {
  status: string
  leads: Lead[]
}

export interface AdminUser {
  _id: string
  name: string
  email: string
  role: string
}

/** Seuils d'alerte effectifs, renvoyés par le serveur avec la file de travail. */
export interface WorklistThresholds {
  coldEnabled: boolean
  coldDays: number
  overdueEnabled: boolean
  staleEnabled: boolean
  staleDays: number
}

export type WorklistGroupKey = 'overdue' | 'today' | 'upcoming' | 'drifting'

export type WorklistGroups = Record<WorklistGroupKey, Lead[]>

/** Délais de relance configurés, pré-remplis au moment de marquer un contact. */
export interface WorklistFollowUp {
  demoDays: number
  proposalDays: number
  defaultDays: number
}

export interface WorklistResponse {
  groups: WorklistGroups
  thresholds: WorklistThresholds
  /** Motifs de perte configurés, proposés par le dialogue de clôture. */
  lostReasons: string[]
  followUp: WorklistFollowUp
  counts: Record<WorklistGroupKey, number>
}
