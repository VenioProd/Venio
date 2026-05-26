// ─────────────────────────────────────────────────────────────
// Automation Trigger — fire-and-forget helper for event-driven
// automations from route handlers.
// ─────────────────────────────────────────────────────────────

import { getAutomation } from './registry.js'
import { runAutomation, buildContext } from './engine.js'
import logger from '../lib/logger.js'

/**
 * Trigger one or more event-driven automations in the background.
 * Errors are caught and logged — never throws.
 */
export function triggerAutomations(
  keys: string[],
  meta: Record<string, unknown>
): void {
  const ctx = buildContext(meta)

  for (const key of keys) {
    const automation = getAutomation(key)
    if (!automation) {
      logger.warn(`[AUTOMATION TRIGGER] Unknown automation: ${key}`)
      continue
    }

    // Fire-and-forget
    runAutomation(automation, ctx).catch((err) => {
      logger.error({ data: (err as Error).message }, `[AUTOMATION TRIGGER] ${key} failed:`)
    })
  }
}
