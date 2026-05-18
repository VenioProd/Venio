export interface RuleFormConditions {
  type: string
  categoryRegex: string
  descriptionRegex: string
  amountMin: string | number
  amountMax: string | number
  currency: string
  tagsAll: string
  tagsAny: string
}

export interface RuleFormMapping {
  journalCode: string
  debitAccount: string
  creditAccount: string
  vatRateValue: string | number
  useVatFromPayload: boolean
  labelTemplate: string
  autoValidate: boolean
  assignToAuxiliary: boolean
}

export interface RuleForm {
  _id?: string
  name: string
  priority: number | string
  enabled: boolean
  conditions: RuleFormConditions
  mapping: RuleFormMapping
}

export interface InfoForm {
  description: string
  autoValidateAll: boolean
  rateLimitPerMin: number | string
  defaultJournalCode: string
  defaultCustomerAccount: string
  defaultRevenueAccount: string
  defaultExpenseAccount: string
  defaultBankAccount: string
}

export interface TxFilters {
  status: string
  externalId: string
  from: string
  to: string
  page: number
  limit: number
}

export const TABS = [
  { id: 'info', label: 'Informations & mappings' },
  { id: 'rules', label: 'Règles de classification' },
  { id: 'tx', label: 'Historique des transactions' },
] as const

export type TabId = (typeof TABS)[number]['id']
