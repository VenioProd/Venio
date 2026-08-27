import type { Document, Types } from 'mongoose'
import type { NoteVisibility, EscalationAction } from '../enums.js'

// ─── ClientActivity ───
export interface IClientActivity extends Document {
  clientId: Types.ObjectId
  type: string
  label: string
  payload: Record<string, unknown>
  actorId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

// ─── Interaction ───
export type InteractionSubjectType = 'LEAD' | 'CLIENT'
export type InteractionKind = 'EMAIL' | 'CALL' | 'MEETING' | 'NOTE'
export type InteractionDirection = 'OUT' | 'IN' | 'NONE'
export type InteractionDeliveryStatus = 'NONE' | 'SENT' | 'PARTIAL' | 'FAILED'

export interface IInteractionRecipient {
  email: string
  name: string
  status: 'SENT' | 'FAILED'
  error: string
}

export interface IInteraction extends Document {
  subjectType: InteractionSubjectType
  subjectId: Types.ObjectId
  kind: InteractionKind
  direction: InteractionDirection
  occurredAt: Date
  subject: string
  body: string
  pinned: boolean
  author: Types.ObjectId | null
  recipients: IInteractionRecipient[]
  deliveryStatus: InteractionDeliveryStatus
  /** Identifiant du document d'origine, pour rendre la migration idempotente.
   *  Absent hors migration : voir l'index partiel du modèle. */
  migratedFrom?: string
  createdAt: Date
  updatedAt: Date
}

// ─── ClientContact ───
export interface IClientContact extends Document {
  clientId: Types.ObjectId
  firstName: string
  lastName: string
  email: string
  phone: string
  role: string
  isMain: boolean
  notes: string
  createdAt: Date
  updatedAt: Date
}

// ─── ClientNote ───
export interface IClientNote extends Document {
  clientId: Types.ObjectId
  content: string
  createdBy: Types.ObjectId
  visibility: NoteVisibility
  pinned: boolean
  createdAt: Date
  updatedAt: Date
}

// ─── CrmSettings ───
export interface IScoringWeights {
  budgetHigh: number
  budgetMedium: number
  budgetLow: number
  sourceReferral: number
  sourceAds: number
  sourceOther: number
  priorityUrgent: number
  priorityHigh: number
  priorityNormal: number
  hasEmail: number
  hasPhone: number
}

export interface ICrmSettings extends Document {
  roundRobinEnabled: boolean
  autoQualifyEnabled: boolean
  autoLastContactOnContacted: boolean
  autoNextActionOnDemo: boolean
  demoFollowUpDays: number
  autoNextActionOnProposal: boolean
  proposalFollowUpDays: number
  clearNextActionOnClose: boolean
  emailOnAssignment: boolean
  activityLogging: boolean
  coldLeadAlertEnabled: boolean
  coldLeadThresholdDays: number
  coldLeadEmailEnabled: boolean
  overdueAlertEnabled: boolean
  dailyOverdueEmailEnabled: boolean
  dailyOverdueEmailTime: string
  staleLeadAlertEnabled: boolean
  staleLeadThresholdDays: number
  escalationEnabled: boolean
  escalationThresholdDays: number
  escalationAction: EscalationAction
  escalationManagerId: Types.ObjectId | null
  scoringEnabled: boolean
  scoringWeights: IScoringWeights
  duplicateDetectionEnabled: boolean
  duplicateCheckEmail: boolean
  duplicateCheckCompany: boolean
  duplicateCheckPhone: boolean
  proposalReminderEnabled: boolean
  proposalReminderDays: number
  weeklyReportEnabled: boolean
  weeklyReportDay: number
  weeklyReportTime: string
  weeklyReportRecipients: string[]
  // Automation toggles
  invoiceRemindersEnabled: boolean
  taskRemindersEnabled: boolean
  projectNotificationsEnabled: boolean
  briefRemindersEnabled: boolean
  clientHealthAutoUpdate: boolean
  invoiceReminderDays: number
  createdAt: Date
  updatedAt: Date
}
