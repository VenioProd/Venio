import mongoose, { Schema, type Document } from 'mongoose'
import type { AutomationLockDoc } from '../types.js'

export interface IAutomationLock extends AutomationLockDoc, Document {}

const AutomationLockSchema = new Schema<IAutomationLock>({
  idempotencyKey: { type: String, required: true, unique: true },
  automationKey: { type: String, required: true, index: true },
  status: {
    type: String,
    enum: ['SUCCESS', 'FAILED', 'SKIPPED', 'DEAD_LETTER'],
    required: true,
  },
  createdAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
})

// TTL: auto-remove expired locks
AutomationLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const AutomationLock = mongoose.model<IAutomationLock>('AutomationLock', AutomationLockSchema)

export default AutomationLock
