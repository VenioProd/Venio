// Types front-end pour le module Comptabilité.
// Volontairement simplifiés par rapport aux schémas Mongoose côté backend :
// on ne typle ici que les champs renvoyés par l'API en JSON.

// ---- Settings ----
export interface ICompanyAddress {
  line1?: string
  line2?: string
  zip?: string
  city?: string
  country?: string
}

export interface ICompanySettings {
  _id?: string
  legalName?: string
  legalForm?: string
  siret?: string
  siren?: string
  vatNumber?: string
  apeNafCode?: string
  rcs?: string
  capitalSocial?: number | null
  address?: ICompanyAddress
  fiscalRegime?: 'REEL_NORMAL' | 'REEL_SIMPLIFIE' | 'MICRO'
  vatPeriodicity?: 'MENSUEL' | 'TRIMESTRIEL' | 'ANNUEL'
  fiscalYearStartMonth?: number
  paymentTermsDays?: number
  latePaymentRateNote?: string
  legalMentions?: string
  isConfigured?: boolean
}

// ---- Fiscal year ----
export interface IFiscalYear {
  _id: string
  code: string
  label: string
  startDate: string
  endDate: string
  status: 'OUVERT' | 'CLOSED'
}

// ---- Chart of accounts ----
export type AccountType = 'ACTIF' | 'PASSIF' | 'CHARGE' | 'PRODUIT' | 'CAPITAUX' | 'SPECIAL'

export interface IChartOfAccount {
  _id: string
  code: string
  label: string
  accountClass: number
  type: AccountType
  isLettrable: boolean
  isActive: boolean
  description?: string
}

// ---- Journals ----
export type JournalType = 'VENTE' | 'ACHAT' | 'BANQUE' | 'CAISSE' | 'OD' | 'AN'

export interface IJournal {
  _id: string
  code: string
  label: string
  type: JournalType
  counterAccount?: string
  description?: string
  isActive: boolean
}

// ---- VAT rates ----
export interface IVatRate {
  _id: string
  value: number
  label: string
  account?: string
  isActive: boolean
}

// ---- Accounting entries ----
export type EntryStatus = 'DRAFT' | 'VALIDATED' | 'LOCKED'
export type EntrySource = 'MANUAL' | 'BILLING' | 'PAYMENT' | 'EXTERNAL'

export interface IAccountingEntry {
  _id: string
  entryNumber: string
  journalCode: string
  date: string
  label: string
  pieceRef?: string
  notes?: string
  status: EntryStatus
  source: EntrySource
  sourceSlug?: string
  totalDebit: number
  totalCredit: number
  autoValidated?: boolean
}

export interface IAccountingLine {
  _id: string
  accountCode: string
  accountLabel: string
  label: string
  debit: number
  credit: number
  lettrage?: string
  date?: string
  journalCode?: string
  entryNumber?: string
  pieceRef?: string
}

// ---- Reports ----
export interface IDashboardKpi {
  revenueMonth: number
  revenueYTD: number
  expensesMonth: number
  expensesYTD: number
  receivables: number
  payables: number
  vatToPay: number
  bankBalance: number
  draftEntriesCount: number
}

export interface IMonthlyPoint {
  label: string
  revenue: number
  expense: number
}

export interface ITopRevenueAccount {
  code: string
  label: string
  amount: number
}

export interface IAccountingDashboard {
  kpi: IDashboardKpi
  fiscalYear: IFiscalYear | null
  monthlyRevenue: IMonthlyPoint[]
  topRevenueAccounts: ITopRevenueAccount[]
}

export interface IGeneralLedgerMovement {
  _id: string
  date: string
  journalCode: string
  entryNumber: string
  pieceRef?: string
  label: string
  debit: number
  credit: number
  runningBalance: number
  lettrage?: string
}

export interface IGeneralLedgerAccount {
  code: string
  label: string
  class?: number
  type?: AccountType
  isLettrable?: boolean
}

export interface IGeneralLedgerData {
  account: IGeneralLedgerAccount
  movements: IGeneralLedgerMovement[]
  totals?: { debit: number; credit: number; closingBalance: number }
  openingBalance?: number
}

export interface ITrialBalanceRow {
  accountCode: string
  accountLabel: string
  accountClass: number
  type: AccountType
  debit: number
  credit: number
  balance: number
}

export interface ITrialBalanceData {
  rows: ITrialBalanceRow[]
  totals?: { debit: number; credit: number }
}

export interface IBalanceSheetLine {
  code: string
  label: string
  accountClass: number
  amount: number
}

export interface IBalanceSheetData {
  asOf?: string
  fiscalYear?: { code?: string; label?: string }
  actif?: IBalanceSheetLine[]
  passif?: IBalanceSheetLine[]
  totalActif: number
  totalPassif: number
  imbalance: number
  resultExercise: number
  notes?: string[]
}

export interface IIncomeGroup {
  group: string
  label: string
  amount: number
}

export interface IIncomeLine {
  code: string
  label: string
  amount: number
}

export interface IIncomeStatementData {
  periodLabel?: string
  charges?: IIncomeLine[]
  produits?: IIncomeLine[]
  chargesByGroup?: IIncomeGroup[]
  produitsByGroup?: IIncomeGroup[]
  totalCharges: number
  totalProduits: number
  result: number
}

// ---- VAT ----
export interface IVatRateBreakdown {
  rate: number
  base: number
  amount: number
}

export interface IDeclarationLine {
  code: string
  label: string
  base: number
  amount: number
}

export interface IVatPreview {
  periodStart: string
  periodEnd: string
  collectedByRate: IVatRateBreakdown[]
  deductibleByRate: IVatRateBreakdown[]
  declarationLines?: IDeclarationLine[]
  totalCollected: number
  totalDeductible: number
  totalDue: number
}

export type VatStatus = 'DRAFT' | 'SUBMITTED'
export type VatType = 'CA3' | 'CA12'

export interface IVatDeclaration {
  _id: string
  type: VatType
  status: VatStatus
  periodStart: string
  periodEnd: string
  regime?: string
  periodicity?: string
  totalCollected: number
  totalDeductible: number
  totalDue: number
  previousCredit: number
  currentCredit: number
  collectedByRate: IVatRateBreakdown[]
  deductibleByRate: IVatRateBreakdown[]
  declarationLines?: IDeclarationLine[]
  notes?: string
  submittedAt?: string
  submittedRef?: string
}

// ---- Lettrage ----
export interface IUnletteredData {
  account: IChartOfAccount | null
  lines: IAccountingLine[]
}

export interface ILetteredGroup {
  code: string
  lineCount: number
  totalDebit: number
  totalCredit: number
  lettrageDate: string
  lines: IAccountingLine[]
}

export interface ILetteredData {
  account: IChartOfAccount | null
  groups: ILetteredGroup[]
}

export interface ILetterResult {
  code: string
  lineCount: number
  totalDebit: number
  totalCredit: number
  partial?: boolean
}

export interface IUnletterResult {
  unlinked: number
}

// ---- External sources ----
export type ExternalSourceStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED'

export interface IExternalSource {
  _id: string
  slug: string
  name: string
  description?: string
  status: ExternalSourceStatus
  apiKeyPrefix?: string
  autoValidateAll: boolean
  rateLimitPerMin: number
  defaultJournalCode?: string
  defaultCustomerAccount?: string
  defaultRevenueAccount?: string
  defaultExpenseAccount?: string
  defaultBankAccount?: string
  totalIngested?: number
  totalRejected?: number
  totalDuplicates?: number
  lastSeenAt?: string
  lastError?: string
  lastErrorAt?: string
  rotatedAt?: string
}

export interface IExternalSourceCreateResult {
  source: IExternalSource
  apiKey: string
  webhookSecret: string
  warning?: string
}

export interface IRotateKeyResult {
  apiKey: string
  webhookSecret: string
  warning?: string
}

export interface IClassificationRuleConditions {
  type?: string
  categoryRegex?: string
  descriptionRegex?: string
  amountMin?: number
  amountMax?: number
  currency?: string
  tagsAll?: string[]
  tagsAny?: string[]
}

export interface IClassificationRuleMapping {
  journalCode?: string
  debitAccount?: string
  creditAccount?: string
  vatRateValue?: number
  useVatFromPayload?: boolean
  labelTemplate?: string
  autoValidate?: boolean
  assignToAuxiliary?: boolean
}

export interface IClassificationRule {
  _id: string
  name: string
  priority: number
  enabled: boolean
  conditions?: IClassificationRuleConditions
  mapping?: IClassificationRuleMapping
  matchCount?: number
  lastMatchedAt?: string
}

export type ExternalTransactionStatus =
  | 'RECEIVED'
  | 'CLASSIFIED'
  | 'POSTED'
  | 'AWAITING_REVIEW'
  | 'REJECTED'
  | 'DUPLICATE'

export interface IExternalTransaction {
  _id: string
  externalId?: string
  status: ExternalTransactionStatus
  receivedAt?: string
  autoValidated?: boolean
  generatedEntry?: string | { _id: string }
  errorReason?: string
  signatureVerified?: boolean
  matchedRule?: string | { name: string }
  rawPayload?: unknown
  normalizedPayload?: unknown
  requestIp?: string
  requestUserAgent?: string
  idempotencyKey?: string
}

export interface IExternalTransactionsList {
  transactions: IExternalTransaction[]
  total: number
  page: number
  limit: number
}

// ---- Audit log ----
export interface IAuditActor {
  type?: string
  userEmail?: string
  externalSourceSlug?: string
}

export interface IAuditDiff {
  field: string
  before: unknown
  after: unknown
}

export interface IAuditEntry {
  _id: string
  action: string
  entityType?: string
  entityId?: string
  entityRef?: string
  actor?: IAuditActor
  summary?: string
  diff?: IAuditDiff[]
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface IAuditListResponse {
  items?: IAuditEntry[]
  logs?: IAuditEntry[]
  total: number
  page: number
  limit: number
}

// ---- Generic seeding result ----
export interface ISeedResult {
  created: { accounts: number; journals: number; vatRates: number }
}
