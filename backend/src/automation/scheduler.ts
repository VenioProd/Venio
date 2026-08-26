// ─────────────────────────────────────────────────────────────
// Automation Scheduler — runs registered cron automations
// ─────────────────────────────────────────────────────────────

import { getCronAutomations } from './registry.js'
import { runAutomation, buildContext } from './engine.js'
import type { AutomationDefinition } from './types.js'
import logger from '../lib/logger.js'

let intervalId: ReturnType<typeof setInterval> | null = null
const CHECK_INTERVAL_MS = 60_000 // 60 seconds
let lastTickAt: string | null = null
let lastFailureAt: string | null = null

/**
 * Parse schedule string and check if it should run now.
 * Supports: "HH:MM", "monday:HH:MM", "daily HH:MM", "* * * * *", "*\/N * * * *"
 */
export function shouldRunNow(schedule: string | undefined, now: Date): boolean {
  if (!schedule) return false

  // Expressions cron à la minute : le tick du scheduler étant de 60 s, une
  // expression "* * * * *" est due à chaque passage, "*/N" une minute sur N.
  const everyMinute = schedule.match(/^\*(?:\/(\d{1,2}))?\s+\*\s+\*\s+\*\s+\*$/)
  if (everyMinute) {
    const step = Number(everyMinute[1] || 1)
    if (!Number.isFinite(step) || step <= 1) return true
    return now.getMinutes() % step === 0
  }

  const hours = now.getHours()
  const minutes = now.getMinutes()
  const currentTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`

  // "monday:07:00" format
  const dayMatch = schedule.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday):(\d{2}:\d{2})$/i)
  if (dayMatch) {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const targetDay = dayNames.indexOf(dayMatch[1].toLowerCase())
    if (now.getDay() !== targetDay) return false
    return currentTime === dayMatch[2]
  }

  // "HH:MM" format (daily)
  if (/^\d{2}:\d{2}$/.test(schedule)) {
    return currentTime === schedule
  }

  return false
}

/**
 * Run all cron automations that are scheduled for the current time.
 */
async function tick(): Promise<void> {
  lastTickAt = new Date().toISOString()
  const now = new Date()
  const cronJobs = getCronAutomations()

  const dueJobs = cronJobs.filter((job) => shouldRunNow(job.schedule, now))

  if (dueJobs.length === 0) return

  logger.info(`[AUTOMATION SCHEDULER] ${dueJobs.length} job(s) due at ${now.toLocaleTimeString('fr-FR')}`)

  // Run all due jobs concurrently
  const results = await Promise.allSettled(
    dueJobs.map(async (job) => {
      const ctx = buildContext()
      const result = await runAutomation(job, ctx)
      return { key: job.key, ...result }
    }),
  )

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { key, status } = r.value
      if (status !== 'SKIPPED') {
        logger.info(`[AUTOMATION SCHEDULER] ${key}: ${status}`)
      }
    } else {
      lastFailureAt = new Date().toISOString()
      logger.error({ data: r.reason }, `[AUTOMATION SCHEDULER] Unhandled error:`)
    }
  }
}

/**
 * Start the automation scheduler.
 */
export function startAutomationScheduler(): void {
  if (intervalId) {
    logger.warn('[AUTOMATION SCHEDULER] Already running')
    return
  }

  logger.info('[AUTOMATION SCHEDULER] Starting (check every 60s)')
  intervalId = setInterval(tick, CHECK_INTERVAL_MS)

  // Run once immediately
  tick().catch((err) => logger.error({ data: err }, '[AUTOMATION SCHEDULER] Initial tick error:'))
}

/**
 * Stop the automation scheduler.
 */
export function stopAutomationScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logger.info('[AUTOMATION SCHEDULER] Stopped')
  }
}

/** Minimal, secret-free runtime information for the admin health endpoint. */
export function getAutomationSchedulerHealth(): {
  running: boolean
  lastTickAt: string | null
  lastFailureAt: string | null
} {
  return { running: intervalId !== null, lastTickAt, lastFailureAt }
}
