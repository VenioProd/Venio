// ─────────────────────────────────────────────────────────────
// Automation Scheduler — runs registered cron automations
// ─────────────────────────────────────────────────────────────

import { getCronAutomations } from './registry.js'
import { runAutomation, buildContext } from './engine.js'


let intervalId: ReturnType<typeof setInterval> | null = null
const CHECK_INTERVAL_MS = 60_000 // 60 seconds

/**
 * Parse schedule string and check if it should run now.
 * Supports: "HH:MM", "monday:HH:MM", "daily HH:MM"
 */
function shouldRunNow(schedule: string | undefined, now: Date): boolean {
  if (!schedule) return false

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
  const now = new Date()
  const cronJobs = getCronAutomations()

  const dueJobs = cronJobs.filter((job) => shouldRunNow(job.schedule, now))

  if (dueJobs.length === 0) return

  console.log(`[AUTOMATION SCHEDULER] ${dueJobs.length} job(s) due at ${now.toLocaleTimeString('fr-FR')}`)

  // Run all due jobs concurrently
  const results = await Promise.allSettled(
    dueJobs.map(async (job) => {
      const ctx = buildContext()
      const result = await runAutomation(job, ctx)
      return { key: job.key, ...result }
    })
  )

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { key, status } = r.value
      if (status !== 'SKIPPED') {
        console.log(`[AUTOMATION SCHEDULER] ${key}: ${status}`)
      }
    } else {
      console.error(`[AUTOMATION SCHEDULER] Unhandled error:`, r.reason)
    }
  }
}

/**
 * Start the automation scheduler.
 */
export function startAutomationScheduler(): void {
  if (intervalId) {
    console.warn('[AUTOMATION SCHEDULER] Already running')
    return
  }

  console.log('[AUTOMATION SCHEDULER] Starting (check every 60s)')
  intervalId = setInterval(tick, CHECK_INTERVAL_MS)

  // Run once immediately
  tick().catch((err) => console.error('[AUTOMATION SCHEDULER] Initial tick error:', err))
}

/**
 * Stop the automation scheduler.
 */
export function stopAutomationScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    console.log('[AUTOMATION SCHEDULER] Stopped')
  }
}
