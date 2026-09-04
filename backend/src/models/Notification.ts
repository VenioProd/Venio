import mongoose from 'mongoose'
import type { INotification } from '../types/models/index.js'

const notificationSchema = new mongoose.Schema<INotification>(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: [
        'TASK_ASSIGNED',
        'TASK_UPDATED',
        'PROJECT_UPDATE',
        'DOCUMENT_ADDED',
        'TICKET_CREATED',
        'TICKET_REPLY',
        'INTERNAL_MESSAGE',
        'DECISION_SUBMITTED',
        'DECISION_APPROVED',
        'DECISION_REJECTED',
        'DECISION_IMPROVEMENT',
        'SENSITIVE_ACTION_EXECUTED',
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
        // ── Webhooks sortants ──
        'WEBHOOK_ENDPOINT_DISABLED',
        'WEBHOOK_TEST',
        // ── Beta tests ──
        'BETA_BLOCKING_FEEDBACK',
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, default: '' },
    link: { type: String, default: '' },
    isRead: { type: Boolean, default: false },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 })
notificationSchema.index(
  { recipient: 1, 'metadata.dedupeKey': 1 },
  {
    unique: true,
    partialFilterExpression: {
      isRead: false,
      'metadata.dedupeKey': { $type: 'string' },
    },
  },
)

export default mongoose.model<INotification>('Notification', notificationSchema)
