import type { Document, Types } from 'mongoose'
import type { QualiopiStatus } from '../enums.js'

// ─── Qualiopi ───
export interface IQualiopiSubElement {
  _id?: Types.ObjectId
  title: string
  status: QualiopiStatus
  assignee: Types.ObjectId | null
  dueDate: Date | null
  files: { originalName: string; storagePath: string; mimeType: string; size: number; uploadedAt: Date }[]
  notes: string
  order: number
}

export interface IQualiopiIndicator {
  _id?: Types.ObjectId
  number: number
  title: string
  status: QualiopiStatus
  assignee: Types.ObjectId | null
  startDate: Date | null
  endDate: Date | null
  subElements: IQualiopiSubElement[]
  files: { originalName: string; storagePath: string; mimeType: string; size: number; uploadedAt: Date }[]
  order: number
}

export interface IQualiopiCriterion extends Document {
  number: number
  title: string
  objective: string
  indicators: IQualiopiIndicator[]
  createdAt: Date
  updatedAt: Date
}

/* ── Qualiopi Questionnaires ── */

export interface IQualiopiQuestion {
  type: 'rating' | 'text' | 'multiple_choice'
  label: string
  options: string[]
  required: boolean
  order: number
}

export interface IQualiopiAnswer {
  questionIndex: number
  value: string
}

export interface IQualiopiQuestionnaireResponse {
  _id: Types.ObjectId
  respondentName: string
  respondentEmail: string
  formation: string
  answers: IQualiopiAnswer[]
  submittedAt: Date
}

export interface IQualiopiQuestionnaire extends Document {
  title: string
  description: string
  questions: IQualiopiQuestion[]
  active: boolean
  token: string
  responses: IQualiopiQuestionnaireResponse[]
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}
