import type { Types } from 'mongoose'
import ActivityLog from '../models/ActivityLog.js'

interface LogActivityParams {
  project: Types.ObjectId | string
  action: string
  actor: Types.ObjectId | string
  summary?: string
  metadata?: Record<string, unknown>
}

export async function logActivity({ project, action, actor, summary = '', metadata = {} }: LogActivityParams): Promise<void> {
  try {
    await ActivityLog.create({ project, action, actor, summary, metadata })
  } catch (err) {
    console.error('[ActivityLog] Failed to log activity:', (err as Error).message)
  }
}
