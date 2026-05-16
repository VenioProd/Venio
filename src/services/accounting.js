import { apiFetch } from '../lib/api'

// ---- Settings ----
export async function getAccountingSettings() {
  const r = await apiFetch('/api/admin/accounting/settings')
  return r.settings
}

export async function updateAccountingSettings(payload) {
  const r = await apiFetch('/api/admin/accounting/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return r.settings
}

// ---- Fiscal years ----
export async function listFiscalYears() {
  const r = await apiFetch('/api/admin/accounting/fiscal-years')
  return r.fiscalYears
}

export async function createFiscalYear(payload) {
  const r = await apiFetch('/api/admin/accounting/fiscal-years', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return r.fiscalYear
}

export async function closeFiscalYear(id) {
  const r = await apiFetch(`/api/admin/accounting/fiscal-years/${id}/close`, { method: 'POST' })
  return r.fiscalYear
}

// ---- Chart of accounts ----
export async function listAccounts(query = {}) {
  const qs = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== null)
  ).toString()
  const r = await apiFetch(`/api/admin/accounting/chart-of-accounts${qs ? `?${qs}` : ''}`)
  return r.accounts
}

export async function createAccount(payload) {
  const r = await apiFetch('/api/admin/accounting/chart-of-accounts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return r.account
}

export async function updateAccount(id, payload) {
  const r = await apiFetch(`/api/admin/accounting/chart-of-accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return r.account
}

export async function deactivateAccount(id) {
  await apiFetch(`/api/admin/accounting/chart-of-accounts/${id}`, { method: 'DELETE' })
}

export async function seedPCG() {
  return apiFetch('/api/admin/accounting/chart-of-accounts/seed', { method: 'POST' })
}

// ---- Journals ----
export async function listJournals() {
  const r = await apiFetch('/api/admin/accounting/journals')
  return r.journals
}

export async function createJournal(payload) {
  const r = await apiFetch('/api/admin/accounting/journals', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return r.journal
}

export async function updateJournal(id, payload) {
  const r = await apiFetch(`/api/admin/accounting/journals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return r.journal
}

// ---- VAT rates ----
export async function listVatRates() {
  const r = await apiFetch('/api/admin/accounting/vat-rates')
  return r.vatRates
}

export async function updateVatRate(id, payload) {
  const r = await apiFetch(`/api/admin/accounting/vat-rates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return r.vatRate
}

// ---- Entries ----
export async function listEntries(query = {}) {
  const qs = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== null)
  ).toString()
  const r = await apiFetch(`/api/admin/accounting/entries${qs ? `?${qs}` : ''}`)
  return r
}

export async function getEntry(id) {
  const r = await apiFetch(`/api/admin/accounting/entries/${id}`)
  return r
}

export async function createEntry(payload) {
  const r = await apiFetch('/api/admin/accounting/entries', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return r
}

export async function validateEntry(id) {
  const r = await apiFetch(`/api/admin/accounting/entries/${id}/validate`, { method: 'POST' })
  return r.entry
}

export async function bulkValidateEntries(ids) {
  const r = await apiFetch('/api/admin/accounting/entries/bulk-validate', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  })
  return r.results
}

export async function deleteEntry(id) {
  await apiFetch(`/api/admin/accounting/entries/${id}`, { method: 'DELETE' })
}

// ---- Reports ----

function qs(query) {
  const params = new URLSearchParams(
    Object.entries(query || {}).filter(([, v]) => v !== undefined && v !== '' && v !== null)
  ).toString()
  return params ? `?${params}` : ''
}

export async function getAccountingDashboard(query = {}) {
  return apiFetch(`/api/admin/accounting/reports/dashboard${qs(query)}`)
}

export async function getGeneralLedger(query = {}) {
  return apiFetch(`/api/admin/accounting/reports/general-ledger${qs(query)}`)
}

export async function getTrialBalance(query = {}) {
  return apiFetch(`/api/admin/accounting/reports/balance${qs(query)}`)
}

export async function getBalanceSheet(query = {}) {
  return apiFetch(`/api/admin/accounting/reports/balance-sheet${qs(query)}`)
}

export async function getIncomeStatement(query = {}) {
  return apiFetch(`/api/admin/accounting/reports/income-statement${qs(query)}`)
}

export async function getJournalView(query = {}) {
  return apiFetch(`/api/admin/accounting/reports/journal${qs(query)}`)
}

/**
 * Déclenche le téléchargement d'un export CSV pour un rapport.
 * @param {string} reportName  general-ledger / balance / income-statement / balance-sheet
 * @param {Object} params
 */
export async function downloadReportCsv(reportName, params = {}) {
  const url = `/api/admin/accounting/reports/${reportName}${qs({ ...params, format: 'csv' })}`
  const token = localStorage.getItem('auth_token')
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Erreur export CSV')
  }
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = `${reportName}-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

// ---- TVA ----

export async function computeVat(query = {}) {
  return apiFetch(`/api/admin/accounting/vat/compute${qs(query)}`)
}

export async function listVatDeclarations(query = {}) {
  const r = await apiFetch(`/api/admin/accounting/vat/declarations${qs(query)}`)
  return r.declarations || []
}

export async function getVatDeclaration(id) {
  const r = await apiFetch(`/api/admin/accounting/vat/declarations/${id}`)
  return r.declaration
}

export async function createVatDeclaration(payload) {
  const r = await apiFetch('/api/admin/accounting/vat/declarations', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return r.declaration
}

export async function submitVatDeclaration(id, payload = {}) {
  const r = await apiFetch(`/api/admin/accounting/vat/declarations/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return r.declaration
}

export async function deleteVatDeclaration(id) {
  await apiFetch(`/api/admin/accounting/vat/declarations/${id}`, { method: 'DELETE' })
}

// ---- FEC ----

export async function downloadFec(params = {}) {
  const url = `/api/admin/accounting/fec/export${qs(params)}`
  const token = localStorage.getItem('auth_token')
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Erreur export FEC')
  }
  const blob = await res.blob()
  const filename =
    res.headers
      .get('Content-Disposition')
      ?.match(/filename="?([^"]+)"?/)?.[1] || `FEC-${new Date().toISOString().slice(0, 10)}.txt`
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

// ---- Lettrage ----

export async function listUnletteredLines(accountCode) {
  const r = await apiFetch(
    `/api/admin/accounting/lettrage/account/${encodeURIComponent(accountCode)}/unlettered`
  )
  return r
}

export async function listLetteredLines(accountCode) {
  const r = await apiFetch(
    `/api/admin/accounting/lettrage/account/${encodeURIComponent(accountCode)}/lettered`
  )
  return r
}

export async function letterLines(lineIds, code) {
  const r = await apiFetch('/api/admin/accounting/lettrage', {
    method: 'POST',
    body: JSON.stringify({ lineIds, code }),
  })
  return r
}

export async function unletterCode(accountCode, code) {
  const r = await apiFetch(
    `/api/admin/accounting/lettrage/account/${encodeURIComponent(accountCode)}/${encodeURIComponent(
      code
    )}`,
    { method: 'DELETE' }
  )
  return r
}

// ---- External sources (sites tiers comme Arrow) ----

export async function listExternalSources() {
  const r = await apiFetch('/api/admin/accounting/external-sources')
  return r.sources || []
}

export async function getExternalSource(id) {
  const r = await apiFetch(`/api/admin/accounting/external-sources/${id}`)
  return r.source
}

export async function createExternalSource(payload) {
  // Réponse contient `apiKey` et `webhookSecret` UNE SEULE FOIS
  return apiFetch('/api/admin/accounting/external-sources', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateExternalSource(id, payload) {
  const r = await apiFetch(`/api/admin/accounting/external-sources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return r.source
}

export async function deleteExternalSource(id) {
  await apiFetch(`/api/admin/accounting/external-sources/${id}`, { method: 'DELETE' })
}

export async function rotateExternalSourceKey(id) {
  return apiFetch(`/api/admin/accounting/external-sources/${id}/rotate`, { method: 'POST' })
}

// Classification rules
export async function listClassificationRules(sourceId) {
  const r = await apiFetch(`/api/admin/accounting/external-sources/${sourceId}/rules`)
  return r.rules || []
}

export async function createClassificationRule(sourceId, payload) {
  const r = await apiFetch(`/api/admin/accounting/external-sources/${sourceId}/rules`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return r.rule
}

export async function updateClassificationRule(sourceId, ruleId, payload) {
  const r = await apiFetch(
    `/api/admin/accounting/external-sources/${sourceId}/rules/${ruleId}`,
    { method: 'PATCH', body: JSON.stringify(payload) }
  )
  return r.rule
}

export async function deleteClassificationRule(sourceId, ruleId) {
  await apiFetch(`/api/admin/accounting/external-sources/${sourceId}/rules/${ruleId}`, {
    method: 'DELETE',
  })
}

// External transactions (audit trail)
export async function listExternalTransactions(query = {}) {
  return apiFetch(`/api/admin/accounting/external-transactions${qs(query)}`)
}

export async function replayExternalTransaction(id) {
  return apiFetch(`/api/admin/accounting/external-transactions/${id}/replay`, { method: 'POST' })
}

// ---- Audit log ----

export async function listAuditLog(query = {}) {
  return apiFetch(`/api/admin/accounting/audit-log${qs(query)}`)
}

export async function listAuditLogForEntity(entityType, entityId) {
  return apiFetch(
    `/api/admin/accounting/audit-log/entity/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`
  )
}
