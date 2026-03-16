import mongoose from 'mongoose'
import type { IAuditLog } from '../types/models/index.js'

const auditLogSchema = new mongoose.Schema<IAuditLog>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    email: { type: String, default: '' },
    action: {
      type: String,
      required: true,
      enum: [
        'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT',
        'PASSWORD_CHANGED', 'PASSWORD_RESET', 'PROFILE_UPDATED',
        'TOOL_ACCESS_VIEWED', 'TOOL_ACCESS_CREATED', 'TOOL_ACCESS_UPDATED', 'TOOL_ACCESS_DELETED',
        'BRUTE_FORCE_DETECTED', 'SUSPICIOUS_LOGIN',
        'PERMISSION_CHANGED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED',
      ],
    },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
)

auditLogSchema.index({ userId: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })
auditLogSchema.index({ createdAt: -1 })

export default mongoose.model<IAuditLog>('AuditLog', auditLogSchema)
