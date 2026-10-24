export interface ProjectRef {
  _id: string
  name: string
}
export interface ShareTotals {
  dueCents: number
  paidCents: number
  remainingCents: number
}
export interface Beneficiary {
  _id: string
  kind: string
  user: string | null
  displayName: string
  email: string
  siret: string
  vatRegistered: boolean
  defaultAccountCode: string
  settlementMode: string
  isActive: boolean
}
export interface ShareRule {
  beneficiary: string
  bp: number
}
export interface ShareTemplate {
  _id: string
  name: string
  rules: ShareRule[]
}
export interface RuleVersion {
  _id: string
  rules: ShareRule[]
  version: number
  effectiveFrom: string
  reason: string
}
export interface FinanceSummary {
  invoicedHtCents: number
  invoicedTtcCents: number
  receivedTtcCents: number
  receivedHtCents: number
  remainingTtcCents: number
  directCostsCents: number
  marginCents: number
  beneficiaries: (ShareTotals & { beneficiary: string | null })[]
}
export interface BillingContact {
  name: string
  email: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  city: string
  country: string
  siret: string
  vatNumber: string
}
export interface Payer {
  _id?: string
  kind: string
  user: string | null
  subsidiary: string | null
  shareBp: number
  isPrincipal: boolean
  billingContact?: Partial<BillingContact>
  paymentMethod: string
}
export interface Installment {
  _id?: string
  label: string
  percentBp: number
  trigger: { kind: string; dueDate: string | null; phase: string | null }
}
export interface Finance {
  _id?: string
  mode: string
  contractHtCents: number | null
  vatRateBp: number
  shareActivationDate: string | null
  installments: Installment[]
  payers: Payer[]
  subscription: { amountHtCents: number; period: string; startDate: string; endDate: string | null } | null
}
export interface Invoice {
  _id: string
  number: string
  status: string
  dueAt?: string | null
  payerName: string
  payer?: { payerId: string; billingContact?: Partial<BillingContact> }
  htCents: number
  totalTtcCents: number
  remainingTtcCents: number
  historical: boolean
  creditedInvoice?: string | null
  financeLink?: { kind: string; installmentId?: string; periodStart?: string }
}
export interface ScheduleInvoice {
  _id: string
  number: string
  status: string
  total: number
  payer?: { payerId: string; billingContact?: Partial<BillingContact> }
}
export interface Schedule extends Installment {
  htCents: number
  status: string
  payers: { payerId: string; htCents: number; vatCents: number; ttcCents: number }[]
  invoices: ScheduleInvoice[]
}
export interface SubscriptionState {
  nextPeriodStart: string | null
  periods: { periodStart: string; periodEnd: string; invoices: ScheduleInvoice[] }[]
}
export interface FinanceResponse {
  finance: Finance | null
  ruleVersion: RuleVersion | null
  summary: FinanceSummary
  schedule: Schedule[]
  subscriptionState?: SubscriptionState
}
export interface Dashboard {
  totals: Omit<FinanceSummary, 'beneficiaries'>
  projects: (FinanceSummary & { project: ProjectRef; mode: string; invoices: Invoice[]; costs: ProjectCost[] })[]
  overdueInvoices: (Invoice & { project: ProjectRef })[]
  toInvoice: {
    kind: string
    project: ProjectRef
    label: string
    date: string | null
    ttcCents: number
    invoiceId?: string
    installmentId?: string
  }[]
  beneficiaries: (ShareTotals & { _id: string; displayName: string; isActive: boolean })[]
  cashForecast: { month: string; expectedTtcCents: number; volume: number }[]
}
export interface Payment {
  _id: string
  invoice: string
  kind: string
  amountTtcCents: number
  htCents: number
  receivedAt: string
  method: string
  reference: string
  reason?: string
  refundOf?: string | null
  source?: 'MANUAL' | 'STRIPE'
}
export interface Statement extends ShareTotals {
  beneficiary: { _id: string; displayName: string }
  unattachedPaidCents: number
  projects: (ShareTotals & { project: ProjectRef })[]
  allocations: {
    _id: string
    project: ProjectRef
    receivedAt: string
    invoiceNumber: string
    paymentHtCents: number
    bp: number
    amountCents: number
  }[]
  settlements: {
    _id: string
    project: ProjectRef | null
    kind: string
    htCents: number
    vatCents: number
    paidAt: string
    invoiceRef: string
    note: string
    mode: string
    reversalOf: string | null
  }[]
}
export interface CostLine {
  _id: string
  accountCode: string
  label: string
  debit: number
  credit: number
  entry: { _id: string; date: string; label: string }
}
export interface ProjectCost {
  _id: string
  entry: string
  supplier: string
  htCents: number
  vatCents: number
}
