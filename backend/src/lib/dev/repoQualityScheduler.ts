import DevProject from '../../models/DevProject.js'
import logger from '../logger.js'
import { refreshProjectCodeMetrics } from './codeMetrics.js'

const REFRESH_INTERVAL_MS = 10 * 60 * 1000
let timer: ReturnType<typeof setInterval> | null = null
let running = false

/**
 * Warms the in-memory repo-quality snapshots used by the dev cockpit.
 *
 * The collection is intentionally performed outside HTTP routes. Repositories
 * without DEV_REPO_ROOT / repoPath simply produce an explicit unavailable state
 * when read; they do not make this job fail.
 */
export async function refreshRepoQualitySnapshots(): Promise<void> {
  if (running) return
  running = true
  try {
    const projects = await DevProject.find({}, { github: 1 }).lean()
    const results = await Promise.allSettled(
      projects.map((project) => refreshProjectCodeMetrics(project.github ?? null)),
    )
    const failures = results.filter((result) => result.status === 'rejected')
    if (failures.length > 0) {
      logger.warn({ failures: failures.length }, '[DEV REPO QUALITY] Some periodic refreshes failed')
    }
  } catch (err) {
    logger.error({ err }, '[DEV REPO QUALITY] Periodic refresh failed')
  } finally {
    running = false
  }
}

export function startRepoQualityScheduler(): void {
  if (timer) return
  timer = setInterval(() => {
    void refreshRepoQualitySnapshots()
  }, REFRESH_INTERVAL_MS)
  void refreshRepoQualitySnapshots()
}

export function stopRepoQualityScheduler(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
