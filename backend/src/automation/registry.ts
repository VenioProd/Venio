// ─────────────────────────────────────────────────────────────
// Automation Registry — central registration of all automations
// ─────────────────────────────────────────────────────────────

import type { AutomationDefinition } from './types.js'
import logger from '../lib/logger.js'

const registry = new Map<string, AutomationDefinition>()

/**
 * Register an automation definition.
 */
export function registerAutomation(def: AutomationDefinition): void {
  if (registry.has(def.key)) {
    logger.warn(`[AUTOMATION] Overwriting existing automation: ${def.key}`)
  }
  registry.set(def.key, def)
}

/**
 * Get a single automation by key.
 */
export function getAutomation(key: string): AutomationDefinition | undefined {
  return registry.get(key)
}

/**
 * Get all registered automations.
 */
export function getAllAutomations(): AutomationDefinition[] {
  return Array.from(registry.values())
}

/**
 * Get all cron-based automations.
 */
export function getCronAutomations(): AutomationDefinition[] {
  return getAllAutomations().filter((a) => a.triggerType === 'cron')
}

/**
 * Get automations matching an event type.
 */
export function getEventAutomations(eventType: string): AutomationDefinition[] {
  return getAllAutomations().filter(
    (a) => a.triggerType === 'event' || a.triggerType === 'status_change'
  )
}

/**
 * Get automations by domain.
 */
export function getAutomationsByDomain(domain: string): AutomationDefinition[] {
  return getAllAutomations().filter((a) => a.domain === domain)
}

/**
 * List all registered automation keys with metadata (for admin UI).
 */
export function listAutomationSummaries(): {
  key: string
  title: string
  domain: string
  triggerType: string
  schedule?: string
}[] {
  return getAllAutomations().map((a) => ({
    key: a.key,
    title: a.title,
    domain: a.domain,
    triggerType: a.triggerType,
    schedule: a.schedule,
  }))
}
