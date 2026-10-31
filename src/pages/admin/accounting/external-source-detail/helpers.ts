import type { ExternalSourceStatus, ExternalTransactionStatus } from '../../../../types/accounting'
import { formatDateTime as formatLocaleDateTime } from '../../../../i18n/format'
import type { MessageKey } from '../../../../i18n'

export function formatDateTime(d: string | undefined | null): string {
  if (!d) return '—'
  return (
    formatLocaleDateTime(d, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }) || '—'
  )
}

export const STATUS_LABEL_KEYS: Record<string, MessageKey> = {
  ACTIVE: 'accVat.integ.statusActive',
  PAUSED: 'accVat.integ.statusPaused',
  DISABLED: 'accVat.integ.statusDisabled',
}

export function statusBadgeClass(status: ExternalSourceStatus): string {
  if (status === 'ACTIVE') return 'validated'
  if (status === 'PAUSED') return 'draft'
  return 'locked'
}

export const TRANSACTION_STATUSES: { value: string; labelKey: MessageKey }[] = [
  { value: '', labelKey: 'accVat.esd.txAll' },
  { value: 'RECEIVED', labelKey: 'accVat.esd.txReceived' },
  { value: 'CLASSIFIED', labelKey: 'accVat.esd.txClassified' },
  { value: 'POSTED', labelKey: 'accVat.esd.txPosted' },
  { value: 'AWAITING_REVIEW', labelKey: 'accVat.esd.txAwaitingReview' },
  { value: 'REJECTED', labelKey: 'accVat.esd.txRejected' },
  { value: 'DUPLICATE', labelKey: 'accVat.esd.txDuplicate' },
]

export function txStatusClass(status: ExternalTransactionStatus): string {
  if (status === 'POSTED') return 'validated'
  if (status === 'REJECTED') return 'draft'
  if (status === 'AWAITING_REVIEW') return 'draft'
  if (status === 'DUPLICATE') return 'locked'
  return 'locked'
}

export const RULE_TYPE_OPTIONS: { value: string; labelKey: MessageKey }[] = [
  { value: '', labelKey: 'accVat.esd.typeAny' },
  { value: 'SALE', labelKey: 'accVat.esd.typeSale' },
  { value: 'REFUND', labelKey: 'accVat.esd.typeRefund' },
  { value: 'EXPENSE', labelKey: 'accVat.esd.typeExpense' },
  { value: 'FEE', labelKey: 'accVat.esd.typeFee' },
  { value: 'PAYMENT', labelKey: 'accVat.esd.typePayment' },
  { value: 'TRANSFER', labelKey: 'accVat.esd.typeTransfer' },
  { value: 'ADJUSTMENT', labelKey: 'accVat.esd.typeAdjustment' },
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
