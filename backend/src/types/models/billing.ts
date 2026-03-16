import type { Document, Types } from 'mongoose'
import type { BillingDocumentType, BillingDocumentStatus } from '../enums.js'

// ─── BillingDocument ───
export interface IBillingLine {
  _id?: Types.ObjectId
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  total: number
}

export interface IBillingDocument extends Document {
  type: BillingDocumentType
  number: string
  project: Types.ObjectId
  client: Types.ObjectId
  status: BillingDocumentStatus
  issuedAt: Date | null
  dueAt: Date | null
  sentAt: Date | null
  paidAt: Date | null
  lines: IBillingLine[]
  subtotal: number
  taxTotal: number
  total: number
  currency: string
  note: string
  pdfStoragePath: string | null
  reminderSentAt: Date | null
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}
