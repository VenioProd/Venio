// ─────────────────────────────────────────────────────────────
// Automation Engine — executes automations with idempotency,
// logging, retries, and settings checks.
// ─────────────────────────────────────────────────────────────

import { getAutomationSettings } from './models/AutomationSettings.js'
import { createExecutionLog } from './models/AutomationLog.js'
import { acquireLock, releaseLock, updateLockStatus } from './idempotency.js'
import type {
  AutomationDefinition,
  AutomationContext,
  AutomationResult,
  ExecutionStatus,
} from './types.js'
import logger from '../lib/logger.js'

/**
 * Run a single automation with full lifecycle:
 * 1. Load settings → check if enabled
 * 2. Build idempotency key → acquire lock
 * 3. Evaluate conditions
 * 4. Execute actions
 * 5. Log result
 * 6. Retry on failure if retryable
 */
export async function runAutomation(
  definition: AutomationDefinition,
  context: AutomationContext,
  retryCount = 0
): Promise<{ status: ExecutionStatus; result?: AutomationResult; error?: string }> {
  const startedAt = new Date()

  // 1. Load settings
  const settings = await getAutomationSettings(definition.key, {
    enabled: definition.defaultEnabled,
    channels: definition.channels,
  })

  if (!settings.enabled) {
    await createExecutionLog({
      automationKey: definition.key,
      executionType: definition.triggerType,
      triggerSource: 'scheduler',
      idempotencyKey: `disabled:${definition.key}:${context.dateKey}`,
      status: 'SKIPPED',
      startedAt,
      finishedAt: new Date(),
      durationMs: 0,
      actionsExecuted: [],
      recipientsNotified: [],
      retryCount,
    })
    return { status: 'SKIPPED' }
  }

  // Inject settings into context
  context.settings = settings

  // 2. Build idempotency key & acquire lock
  const idempotencyKey = definition.buildIdempotencyKey(context)
  const lockAcquired = await acquireLock(idempotencyKey, definition.key)

  if (!lockAcquired) {
    return { status: 'SKIPPED' }
  }

  try {
    // 3. Evaluate conditions
    const shouldRun = await definition.evaluate(context)

    if (!shouldRun) {
      await updateLockStatus(idempotencyKey, 'SKIPPED')
      await createExecutionLog({
        automationKey: definition.key,
        executionType: definition.triggerType,
        triggerSource: 'scheduler',
        idempotencyKey,
        status: 'SKIPPED',
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        actionsExecuted: [],
        recipientsNotified: [],
        retryCount,
      })
      return { status: 'SKIPPED' }
    }

    // 4. Execute
    const result = await definition.execute(context)
    const finishedAt = new Date()

    // 5. Log success
    await createExecutionLog({
      automationKey: definition.key,
      executionType: definition.triggerType,
      triggerSource: 'scheduler',
      idempotencyKey,
      status: 'SUCCESS',
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      actionsExecuted: result.actionsExecuted,
      recipientsNotified: result.recipientsNotified,
      retryCount,
      payload: result.details,
    })

    return { status: 'SUCCESS', result }
  } catch (err) {
    const errorMessage = (err as Error).message || 'Unknown error'
    const finishedAt = new Date()

    // 6. Retry logic
    if (definition.retryable && retryCount < definition.maxRetries) {
      await releaseLock(idempotencyKey)

      // Exponential backoff: 1s, 4s, 9s...
      const backoffMs = Math.pow(retryCount + 1, 2) * 1000
      await new Promise((resolve) => setTimeout(resolve, backoffMs))

      return runAutomation(definition, context, retryCount + 1)
    }

    // Dead letter
    const finalStatus: ExecutionStatus =
      retryCount >= definition.maxRetries ? 'DEAD_LETTER' : 'FAILED'

    await updateLockStatus(idempotencyKey, finalStatus)
    await createExecutionLog({
      automationKey: definition.key,
      executionType: definition.triggerType,
      triggerSource: 'scheduler',
      idempotencyKey,
      status: finalStatus,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      errorMessage,
      actionsExecuted: [],
      recipientsNotified: [],
      retryCount,
    })

    logger.error(`[AUTOMATION] ${definition.key} ${finalStatus}: ${errorMessage}`)
    return { status: finalStatus, error: errorMessage }
  }
}

/**
 * Build a standard AutomationContext for the current moment.
 */
export function buildContext(meta?: Record<string, unknown>): AutomationContext {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')

  // ISO week number
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)

  return {
    now,
    dateKey: `${yyyy}-${mm}-${dd}`,
    weekKey: `${yyyy}-W${String(weekNo).padStart(2, '0')}`,
    monthKey: `${yyyy}-${mm}`,
    settings: null as unknown as AutomationContext['settings'], // filled by engine
    meta,
  }
}
