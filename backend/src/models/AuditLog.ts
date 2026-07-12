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
        'LOGIN_SUCCESS',
        'LOGIN_FAILED',
        'LOGOUT',
        'IMPERSONATION_STARTED',
        'PASSWORD_CHANGED',
        'PASSWORD_RESET',
        'PROFILE_UPDATED',
        'TOOL_ACCESS_VIEWED',
        'TOOL_ACCESS_CREATED',
        'TOOL_ACCESS_UPDATED',
        'TOOL_ACCESS_DELETED',
        'BRUTE_FORCE_DETECTED',
        'SUSPICIOUS_LOGIN',
        'PERMISSION_CHANGED',
        'ACCOUNT_LOCKED',
        'ACCOUNT_UNLOCKED',
        'MFA_ENABLED',
        'MFA_DISABLED',
        'MFA_STEP_UP',
        'MFA_RECOVERY_CODE_USED',
        // ── Comptabilité ──
        'ACCOUNTING_ENTRY_CREATE',
        'ACCOUNTING_ENTRY_UPDATE',
        'ACCOUNTING_ENTRY_VALIDATE',
        'ACCOUNTING_ENTRY_LOCK',
        'ACCOUNTING_ENTRY_DELETE',
        'ACCOUNTING_ENTRY_RESTORE',
        'FISCAL_YEAR_CLOSE',
        'FISCAL_YEAR_REOPEN',
        'VAT_DECLARATION_CREATE',
        'VAT_DECLARATION_SUBMIT',
        'VAT_DECLARATION_DELETE',
        'FEC_EXPORT',
        'LETTRAGE_APPLY',
        'LETTRAGE_REMOVE',
        'CHART_OF_ACCOUNTS_SEED',
        'CHART_OF_ACCOUNTS_DEACTIVATE',
        'BILLING_TO_ENTRY',
        'PAYMENT_TO_ENTRY',
        'EXTERNAL_SOURCE_CREATE',
        'EXTERNAL_SOURCE_UPDATE',
        'EXTERNAL_SOURCE_DELETE',
        'EXTERNAL_SOURCE_ROTATE',
        // ── API Agent ──
        'AGENT_TOKEN_CREATE',
        'AGENT_TOKEN_UPDATE',
        'AGENT_TOKEN_REVOKE',
        'AGENT_AUTH_SUCCESS',
        'AGENT_AUTH_FAIL',
        'AGENT_API_MUTATION',
      ],
    },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

auditLogSchema.index({ userId: 1, createdAt: -1 })
auditLogSchema.index({ action: 1, createdAt: -1 })
auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ 'metadata.tokenId': 1, createdAt: -1 })

export default mongoose.model<IAuditLog>('AuditLog', auditLogSchema)
