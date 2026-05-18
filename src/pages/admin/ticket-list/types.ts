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

export const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  QUESTION: { label: 'Question', color: '#0ea5e9' },
  DEMANDE: { label: 'Demande', color: '#8b5cf6' },
  PROBLEME: { label: 'Probleme', color: '#ef4444' },
}

export const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  BASSE: { label: 'Basse', color: '#64748b' },
  NORMALE: { label: 'Normale', color: '#0ea5e9' },
  HAUTE: { label: 'Haute', color: '#f59e0b' },
  URGENTE: { label: 'Urgente', color: '#ef4444' },
}

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  OUVERT: { label: 'Ouvert', color: '#f59e0b' },
  EN_COURS: { label: 'En cours', color: '#0ea5e9' },
  RESOLU: { label: 'Resolu', color: '#22c55e' },
  FERME: { label: 'Ferme', color: '#64748b' },
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export function isImage(mime: string) { return mime.startsWith('image/') }

export function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
