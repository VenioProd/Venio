import { apiFetch, apiDownload } from '../lib/api'
import type {
  IAccountingDashboard,
  IAccountingEntry,
  IAccountingLine,
  IAuditEntry,
  IAuditListResponse,
  IBalanceSheetData,
  IChartOfAccount,
  IClassificationRule,
  IClassificationRuleConditions,
  IClassificationRuleMapping,
  ICompanySettings,
  IExternalSource,
  IExternalSourceCreateResult,
  IExternalTransaction,
  IExternalTransactionsList,
  IFiscalYear,
  IGeneralLedgerData,
  IIncomeStatementData,
  IJournal,
  ILetterResult,
  ILetteredData,
  ISeedResult,
  ITrialBalanceData,
  IUnletteredData,
  IUnletterResult,
  IRotateKeyResult,
  IVatDeclaration,
  IVatPreview,
  IVatRate,
  VatType,
} from '../types/accounting'

// ---- Settings ----
export async function getAccountingSettings(): Promise<ICompanySettings> {
  const r = await apiFetch<{ settings: ICompanySettings }>('/api/admin/accounting/settings')
  return r.settings
}

export async function updateAccountingSettings(
  payload: Partial<ICompanySettings>
): Promise<ICompanySettings> {
  const r = await apiFetch<{ settings: ICompanySettings }>('/api/admin/accounting/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return r.settings
}

// ---- Fiscal years ----
export async function listFiscalYears(): Promise<IFiscalYear[]> {
  const r = await apiFetch<{ fiscalYears: IFiscalYear[] }>('/api/admin/accounting/fiscal-years')
  return r.fiscalYears
}

export interface CreateFiscalYearPayload {
  code: string
  label: string
  startDate: string
  endDate: string
}

export async function createFiscalYear(payload: CreateFiscalYearPayload): Promise<IFiscalYear> {
  const r = await apiFetch<{ fiscalYear: IFiscalYear }>('/api/admin/accounting/fiscal-years', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return r.fiscalYear
}

export async function closeFiscalYear(id: string): Promise<IFiscalYear> {
  const r = await apiFetch<{ fiscalYear: IFiscalYear }>(
    `/api/admin/accounting/fiscal-years/${id}/close`,
    { method: 'POST' }
  )
  return r.fiscalYear
}

// ---- Chart of accounts ----
export interface ListAccountsQuery {
  search?: string
  accountClass?: string | number
  type?: string
  active?: boolean
}

function buildQueryString(query: object | undefined): string {
  if (!query) return ''
  const entries: [string, string][] = []
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === '' || v === null) continue
    entries.push([k, String(v)])
  }
  if (entries.length === 0) return ''
  return `?${new URLSearchParams(entries).toString()}`
}

export async function listAccounts(query: ListAccountsQuery = {}): Promise<IChartOfAccount[]> {
  const r = await apiFetch<{ accounts: IChartOfAccount[] }>(
    `/api/admin/accounting/chart-of-accounts${buildQueryString(query)}`
  )
  return r.accounts
}

export interface CreateAccountPayload {
  code: string
  label: string
  accountClass: number
  type: string
  isLettrable: boolean
  description?: string
}

export async function createAccount(payload: CreateAccountPayload): Promise<IChartOfAccount> {
  const r = await apiFetch<{ account: IChartOfAccount }>('/api/admin/accounting/chart-of-accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return r.account
}

export async function updateAccount(
  id: string,
  payload: Partial<CreateAccountPayload>
): Promise<IChartOfAccount> {
  const r = await apiFetch<{ account: IChartOfAccount }>(
    `/api/admin/accounting/chart-of-accounts/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
  return r.account
}

export async function deactivateAccount(id: string): Promise<void> {
  await apiFetch(`/api/admin/accounting/chart-of-accounts/${id}`, { method: 'DELETE' })
}

export async function seedPCG(): Promise<ISeedResult> {
  return apiFetch<ISeedResult>('/api/admin/accounting/chart-of-accounts/seed', {
    method: 'POST',
  })
}

// ---- Journals ----
export async function listJournals(): Promise<IJournal[]> {
  const r = await apiFetch<{ journals: IJournal[] }>('/api/admin/accounting/journals')
  return r.journals
}

export interface CreateJournalPayload {
  code: string
  label: string
  type: string
  counterAccount?: string
  description?: string
  isActive?: boolean
}

export async function createJournal(payload: CreateJournalPayload): Promise<IJournal> {
  const r = await apiFetch<{ journal: IJournal }>('/api/admin/accounting/journals', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return r.journal
}

export async function updateJournal(
  id: string,
  payload: Partial<CreateJournalPayload>
): Promise<IJournal> {
  const r = await apiFetch<{ journal: IJournal }>(`/api/admin/accounting/journals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return r.journal
}

// ---- VAT rates ----
export async function listVatRates(): Promise<IVatRate[]> {
  const r = await apiFetch<{ vatRates: IVatRate[] }>('/api/admin/accounting/vat-rates')
  return r.vatRates
}

export async function updateVatRate(
  id: string,
  payload: Partial<IVatRate>
): Promise<IVatRate> {
  const r = await apiFetch<{ vatRate: IVatRate }>(`/api/admin/accounting/vat-rates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return r.vatRate
}

// ---- Entries ----
export interface ListEntriesQuery {
  journal?: string
  status?: string
  source?: string
  from?: string
  to?: string
  search?: string
  page?: number
  limit?: number
}

export interface ListEntriesResponse {
  entries: IAccountingEntry[]
  total: number
  page: number
  limit: number
}

export async function listEntries(query: ListEntriesQuery = {}): Promise<ListEntriesResponse> {
  return apiFetch<ListEntriesResponse>(
    `/api/admin/accounting/entries${buildQueryString(query)}`
  )
}

export interface EntryWithLinesResponse {
  entry: IAccountingEntry
  lines: IAccountingLine[]
}

export async function getEntry(id: string): Promise<EntryWithLinesResponse> {
  return apiFetch<EntryWithLinesResponse>(`/api/admin/accounting/entries/${id}`)
}

export interface CreateEntryLinePayload {
  account: string
  label: string
  debit: number
  credit: number
}

export interface CreateEntryPayload {
  journal: string
  date: string
  label: string
  pieceRef?: string
  notes?: string
  status?: 'DRAFT' | 'VALIDATED'
  lines: CreateEntryLinePayload[]
}

export async function createEntry(
  payload: CreateEntryPayload
): Promise<EntryWithLinesResponse> {
  return apiFetch<EntryWithLinesResponse>('/api/admin/accounting/entries', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function validateEntry(id: string): Promise<IAccountingEntry> {
  const r = await apiFetch<{ entry: IAccountingEntry }>(
    `/api/admin/accounting/entries/${id}/validate`,
    { method: 'POST' }
  )
  return r.entry
}

export interface BulkValidateResult {
  ok?: boolean
  success?: boolean
  id?: string
  error?: string
}

export async function bulkValidateEntries(ids: string[]): Promise<BulkValidateResult[]> {
  const r = await apiFetch<{ results: BulkValidateResult[] }>(
    '/api/admin/accounting/entries/bulk-validate',
    {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }
  )
  return r.results
}

export async function deleteEntry(id: string): Promise<void> {
  await apiFetch(`/api/admin/accounting/entries/${id}`, { method: 'DELETE' })
}

// ---- Reports ----

export interface DashboardQuery {
  from?: string
  to?: string
  fiscalYear?: string
}

export async function getAccountingDashboard(
  query: DashboardQuery = {}
): Promise<IAccountingDashboard> {
  return apiFetch<IAccountingDashboard>(
    `/api/admin/accounting/reports/dashboard${buildQueryString(query)}`
  )
}

export interface GeneralLedgerQuery {
  accountCode: string
  from?: string
  to?: string
  fiscalYear?: string
  includeOpening?: boolean
}

export async function getGeneralLedger(query: GeneralLedgerQuery): Promise<IGeneralLedgerData> {
  return apiFetch<IGeneralLedgerData>(
    `/api/admin/accounting/reports/general-ledger${buildQueryString(query)}`
  )
}

export interface TrialBalanceQuery {
  from?: string
  to?: string
  fiscalYear?: string
  accountClass?: string | number
  includeZero?: boolean
}

export async function getTrialBalance(
  query: TrialBalanceQuery = {}
): Promise<ITrialBalanceData> {
  return apiFetch<ITrialBalanceData>(
    `/api/admin/accounting/reports/balance${buildQueryString(query)}`
  )
}

export interface BalanceSheetQuery {
  fiscalYear?: string
  asOf?: string
}

export async function getBalanceSheet(query: BalanceSheetQuery = {}): Promise<IBalanceSheetData> {
  return apiFetch<IBalanceSheetData>(
    `/api/admin/accounting/reports/balance-sheet${buildQueryString(query)}`
  )
}

export interface IncomeStatementQuery {
  fiscalYear?: string
  from?: string
  to?: string
}

export async function getIncomeStatement(
  query: IncomeStatementQuery = {}
): Promise<IIncomeStatementData> {
  return apiFetch<IIncomeStatementData>(
    `/api/admin/accounting/reports/income-statement${buildQueryString(query)}`
  )
}

export interface JournalViewQuery {
  journal?: string
  from?: string
  to?: string
  fiscalYear?: string
}

export async function getJournalView(query: JournalViewQuery = {}): Promise<unknown> {
  return apiFetch<unknown>(
    `/api/admin/accounting/reports/journal${buildQueryString(query)}`
  )
}

/**
 * Déclenche le téléchargement d'un export CSV pour un rapport.
 */
export async function downloadReportCsv(
  reportName: string,
  params: Record<string, unknown> = {}
): Promise<void> {
  const url = `/api/admin/accounting/reports/${reportName}${buildQueryString({
    ...params,
    format: 'csv',
  })}`
  const { blob, filename } = await apiDownload(url)
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename ?? `${reportName}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

// ---- TVA ----

export interface ComputeVatQuery {
  from: string
  to: string
}

export async function computeVat(query: ComputeVatQuery): Promise<IVatPreview> {
  return apiFetch<IVatPreview>(
    `/api/admin/accounting/vat/compute${buildQueryString(query)}`
  )
}

export interface ListVatDeclarationsQuery {
  status?: string
  type?: string
}

export async function listVatDeclarations(
  query: ListVatDeclarationsQuery = {}
): Promise<IVatDeclaration[]> {
  const r = await apiFetch<{ declarations: IVatDeclaration[] }>(
    `/api/admin/accounting/vat/declarations${buildQueryString(query)}`
  )
  return r.declarations || []
}

export async function getVatDeclaration(id: string): Promise<IVatDeclaration> {
  const r = await apiFetch<{ declaration: IVatDeclaration }>(
    `/api/admin/accounting/vat/declarations/${id}`
  )
  return r.declaration
}

export interface CreateVatDeclarationPayload {
  type: VatType
  periodStart: string
  periodEnd: string
  previousCredit?: number
  notes?: string
}

export async function createVatDeclaration(
  payload: CreateVatDeclarationPayload
): Promise<IVatDeclaration> {
  const r = await apiFetch<{ declaration: IVatDeclaration }>(
    '/api/admin/accounting/vat/declarations',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
  return r.declaration
}

export async function submitVatDeclaration(
  id: string,
  payload: { submittedRef?: string } = {}
): Promise<IVatDeclaration> {
  const r = await apiFetch<{ declaration: IVatDeclaration }>(
    `/api/admin/accounting/vat/declarations/${id}/submit`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
  return r.declaration
}

export async function deleteVatDeclaration(id: string): Promise<void> {
  await apiFetch(`/api/admin/accounting/vat/declarations/${id}`, { method: 'DELETE' })
}

// ---- FEC ----

export interface DownloadFecParams {
  from?: string
  to?: string
  fiscalYear?: string
}

export async function downloadFec(params: DownloadFecParams = {}): Promise<void> {
  const url = `/api/admin/accounting/fec/export${buildQueryString(params)}`
  const { blob, filename } = await apiDownload(url)
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename ?? `FEC-${new Date().toISOString().slice(0, 10)}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

// ---- Lettrage ----

export async function listUnletteredLines(accountCode: string): Promise<IUnletteredData> {
  return apiFetch<IUnletteredData>(
    `/api/admin/accounting/lettrage/account/${encodeURIComponent(accountCode)}/unlettered`
  )
}

export async function listLetteredLines(accountCode: string): Promise<ILetteredData> {
  return apiFetch<ILetteredData>(
    `/api/admin/accounting/lettrage/account/${encodeURIComponent(accountCode)}/lettered`
  )
}

export async function letterLines(lineIds: string[], code?: string): Promise<ILetterResult> {
  const body: { lineIds: string[]; code?: string } = { lineIds }
  if (code) body.code = code
  return apiFetch<ILetterResult>('/api/admin/accounting/lettrage', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function unletterCode(
  accountCode: string,
  code: string
): Promise<IUnletterResult> {
  return apiFetch<IUnletterResult>(
    `/api/admin/accounting/lettrage/account/${encodeURIComponent(
      accountCode
    )}/${encodeURIComponent(code)}`,
    { method: 'DELETE' }
  )
}

// ---- External sources ----

export async function listExternalSources(): Promise<IExternalSource[]> {
  const r = await apiFetch<{ sources: IExternalSource[] }>(
    '/api/admin/accounting/external-sources'
  )
  return r.sources || []
}

export async function getExternalSource(id: string): Promise<IExternalSource> {
  const r = await apiFetch<{ source: IExternalSource }>(
    `/api/admin/accounting/external-sources/${id}`
  )
  return r.source
}

export interface CreateExternalSourcePayload {
  slug: string
  name: string
  description?: string
  autoValidateAll?: boolean
  rateLimitPerMin?: number
  defaultJournalCode?: string
  defaultCustomerAccount?: string
  defaultRevenueAccount?: string
  defaultExpenseAccount?: string
  defaultBankAccount?: string
}

export async function createExternalSource(
  payload: CreateExternalSourcePayload
): Promise<IExternalSourceCreateResult> {
  return apiFetch<IExternalSourceCreateResult>('/api/admin/accounting/external-sources', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface UpdateExternalSourcePayload {
  description?: string
  status?: string
  autoValidateAll?: boolean
  rateLimitPerMin?: number
  defaultJournalCode?: string
  defaultCustomerAccount?: string
  defaultRevenueAccount?: string
  defaultExpenseAccount?: string
  defaultBankAccount?: string
}

export async function updateExternalSource(
  id: string,
  payload: UpdateExternalSourcePayload
): Promise<IExternalSource> {
  const r = await apiFetch<{ source: IExternalSource }>(
    `/api/admin/accounting/external-sources/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
  return r.source
}

export async function deleteExternalSource(id: string): Promise<void> {
  await apiFetch(`/api/admin/accounting/external-sources/${id}`, { method: 'DELETE' })
}

export async function rotateExternalSourceKey(id: string): Promise<IRotateKeyResult> {
  return apiFetch<IRotateKeyResult>(`/api/admin/accounting/external-sources/${id}/rotate`, {
    method: 'POST',
  })
}

// Classification rules
export async function listClassificationRules(sourceId: string): Promise<IClassificationRule[]> {
  const r = await apiFetch<{ rules: IClassificationRule[] }>(
    `/api/admin/accounting/external-sources/${sourceId}/rules`
  )
  return r.rules || []
}

export interface ClassificationRulePayload {
  name: string
  priority: number
  enabled: boolean
  conditions: IClassificationRuleConditions
  mapping: IClassificationRuleMapping
}

export async function createClassificationRule(
  sourceId: string,
  payload: ClassificationRulePayload
): Promise<IClassificationRule> {
  const r = await apiFetch<{ rule: IClassificationRule }>(
    `/api/admin/accounting/external-sources/${sourceId}/rules`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  )
  return r.rule
}

export async function updateClassificationRule(
  sourceId: string,
  ruleId: string,
  payload: Partial<ClassificationRulePayload>
): Promise<IClassificationRule> {
  const r = await apiFetch<{ rule: IClassificationRule }>(
    `/api/admin/accounting/external-sources/${sourceId}/rules/${ruleId}`,
    { method: 'PATCH', body: JSON.stringify(payload) }
  )
  return r.rule
}

export async function deleteClassificationRule(
  sourceId: string,
  ruleId: string
): Promise<void> {
  await apiFetch(
    `/api/admin/accounting/external-sources/${sourceId}/rules/${ruleId}`,
    { method: 'DELETE' }
  )
}

// External transactions (audit trail)
export interface ListExternalTransactionsQuery {
  sourceSlug?: string
  status?: string
  externalId?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

export async function listExternalTransactions(
  query: ListExternalTransactionsQuery = {}
): Promise<IExternalTransactionsList> {
  return apiFetch<IExternalTransactionsList>(
    `/api/admin/accounting/external-transactions${buildQueryString(query)}`
  )
}

export async function replayExternalTransaction(id: string): Promise<IExternalTransaction> {
  return apiFetch<IExternalTransaction>(
    `/api/admin/accounting/external-transactions/${id}/replay`,
    { method: 'POST' }
  )
}

// ---- Audit log ----

export interface ListAuditLogQuery {
  action?: string
  entityType?: string
  from?: string
  to?: string
  page?: number
  limit?: number
}

export async function listAuditLog(
  query: ListAuditLogQuery = {}
): Promise<IAuditListResponse> {
  return apiFetch<IAuditListResponse>(
    `/api/admin/accounting/audit-log${buildQueryString(query)}`
  )
}

export async function listAuditLogForEntity(
  entityType: string,
  entityId: string
): Promise<IAuditListResponse> {
  return apiFetch<IAuditListResponse>(
    `/api/admin/accounting/audit-log/entity/${encodeURIComponent(
      entityType
    )}/${encodeURIComponent(entityId)}`
  )
}
