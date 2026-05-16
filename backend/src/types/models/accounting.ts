import type { Document, Types } from 'mongoose'
import type {
  AccountType,
  JournalType,
  FiscalRegime,
  VatPeriodicity,
  VatRateCode,
  FiscalYearStatus,
  AccountingEntryStatus,
  AccountingEntrySource,
  VatDeclarationType,
  VatDeclarationStatus,
  ExternalSourceStatus,
  ExternalTransactionStatus,
} from '../enums.js'

// ─── CompanySettings (singleton) ───
export interface IAddress {
  line1: string
  line2: string
  zip: string
  city: string
  country: string
}

export interface IIban {
  _id?: Types.ObjectId
  label: string
  iban: string
  bic: string
  bankName: string
  bankAccount: string
  isDefault: boolean
}

export interface ICompanySettings extends Document {
  singletonKey: string
  legalName: string
  legalForm: string
  siret: string
  siren: string
  apeNafCode: string
  rcs: string
  vatNumber: string
  capitalSocial: number | null
  address: IAddress
  contactEmail: string
  contactPhone: string
  website: string
  logoPath: string
  fiscalRegime: FiscalRegime
  vatPeriodicity: VatPeriodicity
  fiscalYearStartMonth: number
  currency: string
  ibanList: IIban[]
  paymentTermsDays: number
  legalMentions: string
  invoiceFooterNote: string
  latePaymentRateNote: string
  isConfigured: boolean
  createdAt: Date
  updatedAt: Date
}

// ─── FiscalYear ───
export interface IFiscalYear extends Document {
  code: string
  label: string
  startDate: Date
  endDate: Date
  status: FiscalYearStatus
  closedAt: Date | null
  closedBy: Types.ObjectId | null
  openingEntryId: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

// ─── ChartOfAccount ───
export interface IAuxiliaryRef {
  kind: 'CLIENT' | 'SUPPLIER' | 'OTHER' | null
  id: Types.ObjectId | null
}

export interface IChartOfAccount extends Document {
  code: string
  label: string
  accountClass: number
  type: AccountType
  parent: Types.ObjectId | null
  isAuxiliary: boolean
  auxiliaryOf: string
  auxiliaryRef: IAuxiliaryRef
  isLettrable: boolean
  isActive: boolean
  description: string
  createdAt: Date
  updatedAt: Date
}

// ─── Journal ───
export interface IJournal extends Document {
  code: string
  label: string
  type: JournalType
  counterAccount: string
  description: string
  isActive: boolean
  isSystem: boolean
  createdAt: Date
  updatedAt: Date
}

// ─── VatRate ───
export interface IVatRate extends Document {
  code: VatRateCode
  label: string
  rate: number
  collectedAccount: string
  deductibleAccount: string
  declarationLine: string
  isActive: boolean
  legend: string
  createdAt: Date
  updatedAt: Date
}

// ─── AccountingEntry ───
export interface ISourceRef {
  kind: string
  id: Types.ObjectId | null
}

export interface IAccountingEntry extends Document {
  journal: Types.ObjectId
  journalCode: string
  fiscalYear: Types.ObjectId
  entryNumber: string
  date: Date
  label: string
  pieceRef: string
  status: AccountingEntryStatus
  source: AccountingEntrySource
  sourceRef: ISourceRef
  externalSource: Types.ObjectId | null
  idempotencyKey: string | null
  totalDebit: number
  totalCredit: number
  currency: string
  createdBy: Types.ObjectId | null
  validatedBy: Types.ObjectId | null
  validatedAt: Date | null
  lockedAt: Date | null
  archivedAt: Date | null
  notes: string
  createdAt: Date
  updatedAt: Date
}

// ─── AccountingLine ───
export interface IAccountingLine extends Document {
  entry: Types.ObjectId
  journalCode: string
  fiscalYear: Types.ObjectId
  date: Date
  account: Types.ObjectId
  accountCode: string
  accountLabel: string
  label: string
  debit: number
  credit: number
  lettrage: string
  lettrageDate: Date | null
  vatRate: Types.ObjectId | null
  vatRateValue: number | null
  currency: string
  originalAmount: number | null
  originalCurrency: string
  auxiliaryRef: IAuxiliaryRef
  sortIndex: number
  createdAt: Date
  updatedAt: Date
}

// ─── VatDeclaration ───
export interface IVatLine {
  code: string
  label: string
  base: number
  amount: number
}

export interface IVatRateBreakdown {
  rate: number
  base: number
  amount: number
}

export interface IVatDeclaration extends Document {
  type: VatDeclarationType
  regime: FiscalRegime
  periodicity: VatPeriodicity
  periodStart: Date
  periodEnd: Date
  fiscalYear: Types.ObjectId | null
  collectedByRate: IVatRateBreakdown[]
  deductibleByRate: IVatRateBreakdown[]
  totalCollected: number
  totalDeductible: number
  totalDue: number
  previousCredit: number
  currentCredit: number
  declarationLines: IVatLine[]
  status: VatDeclarationStatus
  submittedAt: Date | null
  submittedBy: Types.ObjectId | null
  submittedRef: string
  notes: string
  createdBy: Types.ObjectId | null
  createdAt: Date
  updatedAt: Date
}

// ─── ExternalSource ───
export interface IExternalSource extends Document {
  slug: string
  name: string
  description: string
  apiKeyHash: string
  apiKeyPrefix: string
  webhookSecret: string
  timestampToleranceSec: number
  status: ExternalSourceStatus
  autoValidateAll: boolean
  rateLimitPerMin: number
  defaultJournalCode: string
  defaultCustomerAccount: string
  defaultRevenueAccount: string
  defaultExpenseAccount: string
  defaultBankAccount: string
  defaultVatCollectedAccount: string
  defaultVatDeductibleAccount: string
  lastSeenAt: Date | null
  lastErrorAt: Date | null
  lastError: string
  totalIngested: number
  totalRejected: number
  totalDuplicates: number
  createdBy: Types.ObjectId | null
  rotatedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// ─── ExternalTransaction ───
export interface IExternalTransaction extends Document {
  source: Types.ObjectId
  sourceSlug: string
  externalId: string
  idempotencyKey: string
  status: ExternalTransactionStatus
  errorReason: string
  matchedRule: Types.ObjectId | null
  autoValidated: boolean
  rawPayload: unknown
  normalizedPayload: unknown
  generatedEntry: Types.ObjectId | null
  requestIp: string
  requestUserAgent: string
  signatureVerified: boolean
  receivedAt: Date
  processedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// ─── ClassificationRule ───
export interface IRuleConditions {
  type: string
  categoryRegex: string
  descriptionRegex: string
  amountMin: number | null
  amountMax: number | null
  currency: string
  tagsAll: string[]
  tagsAny: string[]
}

export interface IRuleMapping {
  journalCode: string
  debitAccount: string
  creditAccount: string
  vatRateValue: number | null
  useVatFromPayload: boolean
  labelTemplate: string
  autoValidate: boolean
  assignToAuxiliary: boolean
}

export interface IClassificationRule extends Document {
  source: Types.ObjectId
  name: string
  priority: number
  enabled: boolean
  conditions: IRuleConditions
  mapping: IRuleMapping
  matchCount: number
  lastMatchedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
