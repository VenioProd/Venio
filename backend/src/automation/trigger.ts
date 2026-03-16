// ─────────────────────────────────────────────────────────────
// Automation Trigger — fire-and-forget helper for event-driven
// automations from route handlers.
// ─────────────────────────────────────────────────────────────

import { getAutomation } from './registry.js'
import { runAutomation, buildContext } from './engine.js'

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
      console.warn(`[AUTOMATION TRIGGER] Unknown automation: ${key}`)
      continue
    }

    // Fire-and-forget
    runAutomation(automation, ctx).catch((err) => {
      console.error(`[AUTOMATION TRIGGER] ${key} failed:`, (err as Error).message)
    })
  }
}
