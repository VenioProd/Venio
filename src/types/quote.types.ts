export type QuoteProposalStatus = 'SENT' | 'SIGNED' | 'EXPIRED'
export type QuoteQuestionType = 'text' | 'longtext' | 'choice' | 'multichoice' | 'boolean' | 'number'

export interface QuoteQuestion {
  _id: string
  type: QuoteQuestionType
  label: string
  help: string
  options: string[]
  required: boolean
  order: number
}

export interface QuoteAnswer {
  question: string
  value: string
}

export interface QuoteLine {
  _id: string
  description: string
  detail: string
  quantity: number
  unitPrice: number
  taxRate: number
  isOptional: boolean
  group: string
  order: number
}

export interface QuoteTotals {
  subtotal: number
  taxTotal: number
  total: number
}

export interface QuoteProposal {
  _id: string
  title: string
  intro: string
  status: QuoteProposalStatus
  expiresAt: string | null
  questions: QuoteQuestion[]
  answers: QuoteAnswer[]
  lines: QuoteLine[]
  selectedOptionalLineIds: string[]
  specification: { content: string }
  signature: { signedAt: string | null; signerName: string }
  totals?: QuoteTotals
}

export interface ClientBillingDocument {
  _id: string
  type: 'QUOTE' | 'INVOICE'
  number: string
  status: string
  total: number
  currency: string
  issuedAt: string | null
  dueAt: string | null
}
