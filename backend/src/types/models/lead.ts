import type { Document, Types } from 'mongoose'
import type { CrmStatus, ProjectPriority, LeadTemperature } from '../enums.js'

// ─── Lead ───
export interface ILead extends Document {
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  callList: string
  lastCallOutcome: string | null
  lastCallAt: Date | null
  phoneInvalid: boolean
  extraInfo: Record<string, string>
  doNotCall: boolean
  source: string
  /** Projet concerné : ARTOSERA, VIGNO, ARROW, VENIO, AUTRE ou '' (non renseigné). */
  project: '' | 'ARTOSERA' | 'VIGNO' | 'ARROW' | 'VENIO' | 'AUTRE'
  legacyArrowSchoolId?: Types.ObjectId
  /** Entité du groupe qui porte l'affaire (VENIO par défaut). */
  entity: 'VENIO' | 'CREATIO' | 'DECISIO' | 'FORMATIO' | 'ARROW'
  status: CrmStatus
  priority: ProjectPriority
  budget: number | null
  nextActionAt: Date | null
  followUpNotifiedFor: Date | null
  lastContactAt: Date | null
  notes: string
  serviceType: string
  leadTemperature: LeadTemperature
  interactionNotes: string
  assignedTo: Types.ObjectId | null
  createdBy: Types.ObjectId | null
  statusChangedAt: Date | null
  clientAccountId: Types.ObjectId | null
  externalRep: Types.ObjectId | null
  closingHandoff: { at: Date; to: Types.ObjectId | null; by: Types.ObjectId; repNotes?: string } | null
  score: number | null
  lostReason: string
  lostComment: string
  probability: number | null
  expectedCloseAt: Date | null
  tags: string[]
  sourceDetail: string
  utm: Record<string, string> | null
  sector: string
  companySize: string
  nextActionLabel: string
  nextActionType: '' | 'CALL' | 'EMAIL' | 'MEETING' | 'TASK' | 'OTHER'
  lastInteractionAt: Date | null
  interactionsCount: number
  archivedAt: Date | null
  automationPausedAt: Date | null
  wonProcessedAt: Date | null
  // ── Dédoublonnage (3B) ──
  /** E-mail de contact normalisé (trim + minuscules), pour la détection de doublons. */
  contactEmailNormalized: string
  /** Téléphone normalisé (chiffres seuls, +33/0033 ramené à 0). */
  contactPhoneNormalized: string
  /** Nom d'entreprise normalisé (minuscules, sans accents ni ponctuation). */
  companyNormalized: string
  // ── RGPD (chantier 3D) ──
  consent: {
    status: 'UNKNOWN' | 'GRANTED' | 'WITHDRAWN'
    basis: 'CONSENT' | 'LEGITIMATE_INTEREST' | 'CONTRACT'
    source: string
    at: Date | null
  }
  doNotContact: boolean
  doNotContactAt: Date | null
  doNotContactReason: string
  anonymizedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// ─── LeadActivity ───
export interface ILeadActivity extends Document {
  leadId: Types.ObjectId
  type: string
  label: string
  payload: Record<string, unknown>
  actorId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

// ─── SalesCommission ───
export interface ISalesCommission extends Document {
  rep: Types.ObjectId
  lead: Types.ObjectId
  client: Types.ObjectId
  project: Types.ObjectId
  invoice: Types.ObjectId
  payment: Types.ObjectId
  kind: 'PAYMENT' | 'REFUND'
  baseHtCents: number
  rateBp: number
  amountCents: number
  receivedAt: Date
  status: 'DUE' | 'PAID'
  paidAt: Date | null
  paidBy: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}
