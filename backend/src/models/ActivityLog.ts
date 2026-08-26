import mongoose from 'mongoose'
import type { IActivityLog } from '../types/models/index.js'

const activityLogSchema = new mongoose.Schema<IActivityLog>(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    action: {
      type: String,
      required: true,
      enum: [
        'PROJECT_CREATED',
        'PROJECT_UPDATED',
        'PROJECT_ARCHIVED',
        'PROJECT_UNARCHIVED',
        'STATUS_CHANGED',
        'TASK_CREATED',
        'TASK_UPDATED',
        'TASK_MOVED',
        'TASK_DELETED',
        'TASK_COMMENT_ADDED',
        'DOCUMENT_UPLOADED',
        'SECTION_CREATED',
        'SECTION_DELETED',
        'ITEM_CREATED',
        'ITEM_DELETED',
        'UPDATE_POSTED',
        'BILLING_CREATED',
        'FICHIER_CLIENT_DEPOSE',
      ],
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    summary: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

activityLogSchema.index({ project: 1, createdAt: -1 })

export default mongoose.model<IActivityLog>('ActivityLog', activityLogSchema)
