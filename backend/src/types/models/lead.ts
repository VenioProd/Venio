import type { Document, Types } from 'mongoose'
import type { CrmStatus, ProjectPriority, LeadTemperature } from '../enums.js'

// ─── Lead ───
export interface ILead extends Document {
  company: string
  contactName: string
  contactEmail: string
  contactPhone: string
  source: string
  status: CrmStatus
  priority: ProjectPriority
  budget: number | null
  nextActionAt: Date | null
  lastContactAt: Date | null
  notes: string
  serviceType: string
  leadTemperature: LeadTemperature
  interactionNotes: string
  assignedTo: Types.ObjectId | null
  createdBy: Types.ObjectId | null
  statusChangedAt: Date | null
  clientAccountId: Types.ObjectId | null
  score: number | null
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
