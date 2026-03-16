import type { Document, Types } from 'mongoose'
import type {
  ActivityAction, AuditAction, NotificationType, DocumentType,
} from '../enums.js'

// ─── Sequence ───
export interface ISequence extends Document {
  name: string
  value: number
  prefix: string
  suffix: string
  padding: number
}

// ─── ActivityLog ───
export interface IActivityLog extends Document {
  project: Types.ObjectId
  action: ActivityAction
  actor: Types.ObjectId
  summary: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

// ─── AuditLog ───
export interface IAuditLog extends Document {
  userId: Types.ObjectId | null
  email: string
  action: AuditAction
  ip: string
  userAgent: string
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

// ─── Document ───
export interface IDocument extends Document {
  project: Types.ObjectId
  type: DocumentType
  originalName: string
  storagePath: string
  mimeType: string
  uploadedBy: Types.ObjectId
  uploadedAt: Date
  downloadedAt: Date | null
}

// ─── Message ───
export interface IMessage extends Document {
  project: Types.ObjectId
  sender: Types.ObjectId
  content: string
  readBy: Types.ObjectId[]
  createdAt: Date
  updatedAt: Date
}

// ─── Notification ───
export interface INotification extends Document {
  recipient: Types.ObjectId
  type: NotificationType
  title: string
  message: string
  link: string
  isRead: boolean
  metadata: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}
