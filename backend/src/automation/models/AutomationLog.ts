import mongoose, { Schema, type Document } from 'mongoose'
import type { AutomationLogDoc } from '../types.js'

export interface IAutomationLog extends AutomationLogDoc, Document {}

const AutomationLogSchema = new Schema<IAutomationLog>(
  {
    automationKey: { type: String, required: true, index: true },
    executionType: { type: String, required: true },
    triggerSource: { type: String, required: true },
    entityType: { type: String },
    entityId: { type: String },
    idempotencyKey: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED', 'SKIPPED', 'DEAD_LETTER'],
      required: true,
    },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date },
    durationMs: { type: Number },
    errorMessage: { type: String },
    actionsExecuted: [{ type: String }],
    recipientsNotified: [{ type: String }],
    retryCount: { type: Number, default: 0 },
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
)

// Auto-expire old logs after 90 days
AutomationLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 })

const AutomationLog = mongoose.model<IAutomationLog>('AutomationLog', AutomationLogSchema)

export default AutomationLog

// ── Helpers ────────────────────────────────────────────────
export async function createExecutionLog(
  data: Omit<AutomationLogDoc, 'retryCount'> & { retryCount?: number }
): Promise<IAutomationLog> {
  return AutomationLog.create({ ...data, retryCount: data.retryCount ?? 0 })
}

export async function getRecentLogs(
  automationKey: string,
  limit = 20
): Promise<IAutomationLog[]> {
  return AutomationLog.find({ automationKey })
    .sort({ startedAt: -1 })
    .limit(limit)
}

export async function getLogStats(
  automationKey: string,
  since: Date
): Promise<{ total: number; success: number; failed: number; skipped: number }> {
  const logs = await AutomationLog.aggregate([
    { $match: { automationKey, startedAt: { $gte: since } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ])
  const stats = { total: 0, success: 0, failed: 0, skipped: 0 }
  for (const l of logs) {
    const c = l.count as number
    stats.total += c
    if (l._id === 'SUCCESS') stats.success = c
    else if (l._id === 'FAILED' || l._id === 'DEAD_LETTER') stats.failed += c
    else if (l._id === 'SKIPPED') stats.skipped = c
  }
  return stats
}
