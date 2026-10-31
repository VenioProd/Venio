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
  QUESTION: { labelKey: 'orgs.tickets.category.question', color: '#0ea5e9' },
  DEMANDE: { labelKey: 'orgs.tickets.category.request', color: '#8b5cf6' },
  PROBLEME: { labelKey: 'orgs.tickets.category.problem', color: '#ef4444' },
}

export const PRIORITY_CONFIG: Record<string, { labelKey: MessageKey; color: string }> = {
  BASSE: { labelKey: 'orgs.tickets.priority.low', color: '#64748b' },
  NORMALE: { labelKey: 'orgs.tickets.priority.normal', color: '#0ea5e9' },
  HAUTE: { labelKey: 'orgs.tickets.priority.high', color: '#f59e0b' },
  URGENTE: { labelKey: 'orgs.tickets.priority.urgent', color: '#ef4444' },
}

export const STATUS_CONFIG: Record<string, { labelKey: MessageKey; color: string }> = {
  OUVERT: { labelKey: 'orgs.tickets.status.open', color: '#f59e0b' },
  EN_COURS: { labelKey: 'orgs.tickets.status.inProgress', color: '#0ea5e9' },
  RESOLU: { labelKey: 'orgs.tickets.status.resolved', color: '#22c55e' },
  FERME: { labelKey: 'orgs.tickets.status.closed', color: '#64748b' },
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
