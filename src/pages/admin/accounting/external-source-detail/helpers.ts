import type { ExternalSourceStatus, ExternalTransactionStatus } from '../../../../types/accounting'

export function formatDateTime(d: string | undefined | null): string {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('fr-FR')
  } catch {
    return '—'
  }
}

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  PAUSED: 'En pause',
  DISABLED: 'Désactivée',
}

export function statusBadgeClass(status: ExternalSourceStatus): string {
  if (status === 'ACTIVE') return 'validated'
  if (status === 'PAUSED') return 'draft'
  return 'locked'
}

export const TRANSACTION_STATUSES = [
  { value: '', label: 'Tous statuts' },
  { value: 'RECEIVED', label: 'Reçue' },
  { value: 'CLASSIFIED', label: 'Classifiée' },
  { value: 'POSTED', label: 'Publiée' },
  { value: 'AWAITING_REVIEW', label: 'Revue à faire' },
  { value: 'REJECTED', label: 'Rejetée' },
  { value: 'DUPLICATE', label: 'Doublon' },
]

export function txStatusClass(status: ExternalTransactionStatus): string {
  if (status === 'POSTED') return 'validated'
  if (status === 'REJECTED') return 'draft'
  if (status === 'AWAITING_REVIEW') return 'draft'
  if (status === 'DUPLICATE') return 'locked'
  return 'locked'
}

export const RULE_TYPE_OPTIONS = [
  { value: '', label: 'Tout type' },
  { value: 'SALE', label: 'Vente (SALE)' },
  { value: 'REFUND', label: 'Remboursement (REFUND)' },
  { value: 'EXPENSE', label: 'Dépense (EXPENSE)' },
  { value: 'FEE', label: 'Frais (FEE)' },
  { value: 'PAYMENT', label: 'Paiement (PAYMENT)' },
  { value: 'TRANSFER', label: 'Transfert (TRANSFER)' },
  { value: 'ADJUSTMENT', label: 'Ajustement (ADJUSTMENT)' },
]

export const EMPTY_RULE = {
  name: '',
  priority: 100,
  enabled: true,
  conditions: {
    type: '',
    categoryRegex: '',
    descriptionRegex: '',
    amountMin: '',
    amountMax: '',
    currency: '',
    tagsAll: '',
    tagsAny: '',
  },
  mapping: {
    journalCode: '',
    debitAccount: '',
    creditAccount: '',
    vatRateValue: '',
    useVatFromPayload: false,
    labelTemplate: '',
    autoValidate: false,
    assignToAuxiliary: false,
  },
}

export function parseTagsInput(value: string | undefined | null): string[] {
  if (!value) return []
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function tagsToInput(tags: string[] | undefined): string {
  if (!Array.isArray(tags)) return ''
  return tags.join(', ')
}
