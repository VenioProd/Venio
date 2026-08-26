import mongoose from 'mongoose'
import type { NotificationType } from '../types/enums.js'

export type NotificationChannel = 'inApp' | 'push' | 'email'

export interface ChannelPreferences {
  inApp: boolean
  push: boolean
  email: boolean
}

export interface INotificationPreferences {
  user: mongoose.Types.ObjectId
  // Map<NotificationType, ChannelPreferences>
  prefs: Record<NotificationType, ChannelPreferences>
}

const channelSchema = new mongoose.Schema<ChannelPreferences>(
  {
    inApp: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
  },
  { _id: false },
)

const notificationPreferencesSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    prefs: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  { timestamps: true },
)

export default mongoose.model('NotificationPreferences', notificationPreferencesSchema)

export const NOTIFICATION_TYPES: NotificationType[] = [
  'TASK_ASSIGNED',
  'TASK_UPDATED',
  'PROJECT_UPDATE',
  'DOCUMENT_ADDED',
  'TICKET_CREATED',
  'TICKET_REPLY',
  'INTERNAL_MESSAGE',
  'PHASE_VALIDATION_REQUESTED',
  'PHASE_VALIDATED',
  'PHASE_REVISION_REQUESTED',
  'CHANGE_REQUEST_CREATED',
  'CHANGE_REQUEST_REPLY',
  'CHANGE_REQUEST_QUALIFIED',
  'CHANGE_REQUEST_QUOTE_SENT',
  'CHANGE_REQUEST_DELIVERED',
  'CHANGE_REQUEST_PLANNED',
  'CLIENT_FILE_UPLOADED',
]

export function defaultChannelPrefs(): ChannelPreferences {
  return { inApp: true, push: true, email: true }
}

export function defaultPreferences(): Record<NotificationType, ChannelPreferences> {
  const result = {} as Record<NotificationType, ChannelPreferences>
  for (const type of NOTIFICATION_TYPES) {
    result[type] = defaultChannelPrefs()
  }
  return result
}
