import type { Document, Types } from 'mongoose'

export type QuoteProposalStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'EXPIRED' | 'CANCELLED'
export type QuoteQuestionType = 'text' | 'longtext' | 'choice' | 'multichoice' | 'boolean' | 'number'

export interface IQuoteQuestion {
  _id: Types.ObjectId
  type: QuoteQuestionType
  label: string
  help: string
  options: string[]
  required: boolean
  order: number
}

export interface IQuoteAnswer {
  question: Types.ObjectId
  value: string
}

export interface IQuoteLine {
  _id: Types.ObjectId
  description: string
  detail: string
  quantity: number
  unitPrice: number
  taxRate: number
  isOptional: boolean
  isSelectedByDefault: boolean
  group: string
  order: number
}

export interface IQuoteSignature {
  signedAt: Date | null
  signerUserId: Types.ObjectId | null
  signerName: string
  signerEmail: string
  ip: string
  userAgent: string
  consentText: string
  documentHash: string
  proofVersion: number
}

export interface IQuoteSpecification {
  content: string
  isManual: boolean
  updatedAt: Date | null
}

export interface IQuoteProposal extends Document {
  _id: Types.ObjectId
  project: Types.ObjectId
  client: Types.ObjectId
  createdBy: Types.ObjectId
  title: string
  intro: string
  status: QuoteProposalStatus
  expiresAt: Date | null
  questions: Types.DocumentArray<IQuoteQuestion>
  answers: Types.DocumentArray<IQuoteAnswer>
  lines: Types.DocumentArray<IQuoteLine>
  selectedOptionalLineIds: Types.ObjectId[]
  specification: IQuoteSpecification
  signature: IQuoteSignature
  billingDocument: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}
