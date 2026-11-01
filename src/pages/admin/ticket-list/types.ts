import { translate } from '../../../i18n'
import { formatDateTime } from '../../../i18n/format'
import type { MessageKey } from '../../../i18n'

export interface TicketFile {
  filename: string
  originalName: string
  mimetype: string
  size: number
}

export interface TicketReply {
  _id: string
  authorName: string
  authorAvatarUrl?: string
  message: string
  attachments?: TicketFile[]
  createdAt: string
}

export interface Ticket {
  _id: string
  title: string
  message: string
  category: 'QUESTION' | 'DEMANDE' | 'PROBLEME'
  priority: 'BASSE' | 'NORMALE' | 'HAUTE' | 'URGENTE'
  status: 'OUVERT' | 'EN_COURS' | 'RESOLU' | 'FERME'
  authorName: string
  authorAvatarUrl?: string
  attachments?: TicketFile[]
  replies: TicketReply[]
  isArchived?: boolean
  archivedAt?: string
  createdAt: string
  updatedAt: string
}

export interface KpiData {
  totalCreated: number
  archived: number
  resolved: number
  open: number
  inProgress: number
  byCategory: Record<string, number>
  byPriority: Record<string, number>
  totalReplies: number
  avgResponseTime: number | null
  resolutionRate: number
  topAuthors: { name: string; count: number }[]
}

export const CATEGORY_CONFIG: Record<string, { labelKey: MessageKey; color: string }> = {
  QUESTION: { labelKey: 'orgs.tickets.category.question', color: 'var(--primary)' },
  DEMANDE: { labelKey: 'orgs.tickets.category.request', color: 'var(--cat-2)' },
  PROBLEME: { labelKey: 'orgs.tickets.category.problem', color: 'var(--critical)' },
}

export const PRIORITY_CONFIG: Record<string, { labelKey: MessageKey; color: string }> = {
  BASSE: { labelKey: 'orgs.tickets.priority.low', color: 'var(--text-secondary)' },
  NORMALE: { labelKey: 'orgs.tickets.priority.normal', color: 'var(--primary)' },
  HAUTE: { labelKey: 'orgs.tickets.priority.high', color: 'var(--warning)' },
  URGENTE: { labelKey: 'orgs.tickets.priority.urgent', color: 'var(--critical)' },
}

export const STATUS_CONFIG: Record<string, { labelKey: MessageKey; color: string }> = {
  OUVERT: { labelKey: 'orgs.tickets.status.open', color: 'var(--warning)' },
  EN_COURS: { labelKey: 'orgs.tickets.status.inProgress', color: 'var(--primary)' },
  RESOLU: { labelKey: 'orgs.tickets.status.resolved', color: 'var(--good)' },
  FERME: { labelKey: 'orgs.tickets.status.closed', color: 'var(--text-secondary)' },
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return translate('orgs.tickets.file.sizeBytes', { value: bytes })
  if (bytes < 1024 * 1024) return translate('orgs.tickets.file.sizeKilo', { value: (bytes / 1024).toFixed(0) })
  return translate('orgs.tickets.file.sizeMega', { value: (bytes / (1024 * 1024)).toFixed(1) })
}

export function isImage(mime: string) {
  return mime.startsWith('image/')
}

export function formatDate(d: string) {
  return formatDateTime(d, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
