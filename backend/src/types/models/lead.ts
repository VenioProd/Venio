import type { Document, Types } from 'mongoose'
import type { CrmStatus, ProjectPriority, LeadTemperature } from '../enums.js'

// ─── Lead ───
export interface ILead extends Document {
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  source: string
  /** Projet concerné : ARTOSERA, VIGNO, ARROW, VENIO, AUTRE ou '' (non renseigné). */
  project: '' | 'ARTOSERA' | 'VIGNO' | 'ARROW' | 'VENIO' | 'AUTRE'
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
