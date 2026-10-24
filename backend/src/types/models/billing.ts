import type { Document, Types } from 'mongoose'
import type { BillingDocumentType, BillingDocumentStatus } from '../enums.js'
import type { IFinancePayer } from './projectFinance.js'

export interface IBillingPayer {
  payerId: Types.ObjectId
  kind: IFinancePayer['kind']
  user: Types.ObjectId | null
  subsidiary: Types.ObjectId | null
  billingContact: IFinancePayer['billingContact']
}

export interface IBillingFinanceLink {
  kind: 'INSTALLMENT' | 'SUBSCRIPTION'
  installmentId: Types.ObjectId | null
  periodStart: Date | null
  periodEnd: Date | null
}

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
  payer: IBillingPayer | null
  financeLink: IBillingFinanceLink | null
  financeKey: string | null
  creditedInvoice: Types.ObjectId | null
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
