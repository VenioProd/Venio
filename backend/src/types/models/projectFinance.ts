import type { Document, Types } from 'mongoose'

export interface IBeneficiary extends Document {
  kind: 'ASSOCIE' | 'COMMERCIAL' | 'FREELANCE' | 'APPORTEUR'
  user: Types.ObjectId | null
  displayName: string
  email: string
  siret: string
  vatRegistered: boolean
  defaultAccountCode: string
  settlementMode: 'BANQUE' | 'PAIE'
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface IShareRule {
  beneficiary: Types.ObjectId
  bp: number
}

export interface IShareTemplate extends Document {
  name: string
  rules: IShareRule[]
  createdAt: Date
  updatedAt: Date
}

export interface IShareRuleVersion extends Document {
  project: Types.ObjectId
  version: number
  effectiveFrom: Date
  rules: IShareRule[]
  reason: string
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export interface IFinanceInstallment {
  _id?: Types.ObjectId
  label: string
  percentBp: number
  trigger: {
    kind: 'DATE' | 'MILESTONE'
    dueDate: Date | null
    phase: Types.ObjectId | null
  }
}

export interface IFinanceSubscription {
  amountHtCents: number
  period: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  startDate: Date
  endDate: Date | null
}

export interface IFinancePayer {
  _id?: Types.ObjectId
  kind: 'CLIENT' | 'SUBSIDIARY' | 'THIRD_PARTY'
  user: Types.ObjectId | null
  subsidiary: Types.ObjectId | null
  shareBp: number
  isPrincipal: boolean
  billingContact: {
    name?: string
    addressLine1?: string
    addressLine2?: string
    postalCode?: string
    city?: string
    country?: string
    email?: string
    siret?: string
    vatNumber?: string
  }
  paymentMethod: 'VIREMENT' | 'CB' | 'PRELEVEMENT' | 'STRIPE'
}

export interface IProjectFinance extends Document {
  project: Types.ObjectId
  mode: 'FORFAIT' | 'ECHEANCIER' | 'ABONNEMENT'
  contractHtCents: number | null
  vatRateBp: number
  installments: IFinanceInstallment[]
  subscription: IFinanceSubscription | null
  payers: IFinancePayer[]
  shareActivationDate: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface IProjectPayment extends Document {
  project: Types.ObjectId
  invoice: Types.ObjectId
  payerId: Types.ObjectId | null
  kind: 'PAYMENT' | 'REFUND'
  amountTtcCents: number
  htCents: number
  method: IFinancePayer['paymentMethod']
  receivedAt: Date
  reference: string
  reason: string
  refundOf: Types.ObjectId | null
  ruleVersion: Types.ObjectId | null
  entry: Types.ObjectId
  source: 'MANUAL' | 'STRIPE'
  idempotencyKey: string
  requestHash: string
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export interface IShareAllocation extends Document {
  project: Types.ObjectId
  payment: Types.ObjectId
  beneficiary: Types.ObjectId | null
  amountCents: number
  bp: number | null
  ruleVersion: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}
