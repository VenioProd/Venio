// ─────────────────────────────────────────────────────────────
// Idempotency Service — prevents duplicate automation runs
// ─────────────────────────────────────────────────────────────

import AutomationLock from './models/AutomationLock.js'
import type { ExecutionStatus } from './types.js'

const DEFAULT_LOCK_TTL_HOURS = 25 // slightly over 24h for daily jobs

/**
 * Try to acquire an idempotency lock.
 * Returns true if the lock was acquired (automation should run).
 * Returns false if already executed successfully for this key.
 */
export async function acquireLock(
  idempotencyKey: string,
  automationKey: string,
  ttlHours: number = DEFAULT_LOCK_TTL_HOURS
): Promise<boolean> {
  try {
    await AutomationLock.create({
      idempotencyKey,
      automationKey,
      status: 'SUCCESS' as ExecutionStatus,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + ttlHours * 3600_000),
    })
    return true
  } catch (err: unknown) {
    // Duplicate key = already locked
    if ((err as { code?: number }).code === 11000) {
      return false
    }
    throw err
  }
}

/**
 * Release a lock (mark as failed so it can be retried).
 */
export async function releaseLock(idempotencyKey: string): Promise<void> {
  await AutomationLock.deleteOne({ idempotencyKey })
}

/**
 * Update lock status (e.g. after failure).
 */
export async function updateLockStatus(
  idempotencyKey: string,
  status: ExecutionStatus
): Promise<void> {
  await AutomationLock.updateOne({ idempotencyKey }, { $set: { status } })
}

/**
 * Check if a lock exists and is successful.
 */
export async function isAlreadyExecuted(idempotencyKey: string): Promise<boolean> {
  const lock = await AutomationLock.findOne({ idempotencyKey, status: 'SUCCESS' })
  return !!lock
}
