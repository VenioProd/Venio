import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import fs from 'fs/promises'
import { constants as fsConstants } from 'fs'
import path from 'path'
import auth from '../../middleware/auth.js'
import { requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { getAutomationSchedulerHealth } from '../../automation/scheduler.js'
import { getAllAutomations } from '../../automation/registry.js'
import AutomationLog from '../../automation/models/AutomationLog.js'
import { getCrmSchedulerHealth } from '../../lib/crmScheduler.js'
import { getAutoLockSchedulerHealth } from '../../lib/accounting/autoLock.js'

const router = express.Router()
const RECENT_ERROR_LIMIT = 10

router.use(auth)
router.use(requirePermission(PERMISSIONS.MANAGE_ADMINS))

type CheckStatus = 'ok' | 'warning' | 'error'

async function directoryStatus(directory: string): Promise<CheckStatus> {
  try {
    await fs.access(directory, fsConstants.R_OK | fsConstants.W_OK)
    return 'ok'
  } catch {
    return 'error'
  }
}

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const checkedAt = new Date()
    const mongoState = mongoose.connection.readyState
    let mongoLatencyMs: number | null = null

    if (mongoState === 1 && mongoose.connection.db) {
      const startedAt = Date.now()
      try {
        await mongoose.connection.db.admin().ping()
        mongoLatencyMs = Date.now() - startedAt
      } catch {
        // The public response intentionally contains no driver error details.
      }
    }

    const uploadsRoot = path.resolve(process.cwd(), 'uploads')
    const [documents, tickets, messaging, automationFailures] = await Promise.all([
      directoryStatus(uploadsRoot),
      directoryStatus(path.join(uploadsRoot, 'tickets')),
      directoryStatus(path.join(uploadsRoot, 'internal-messaging')),
      AutomationLog.find({ status: { $in: ['FAILED', 'DEAD_LETTER'] } })
        .sort({ startedAt: -1 })
        .limit(RECENT_ERROR_LIMIT)
        .select('automationKey status startedAt')
        .lean(),
    ])

    const automation = getAutomationSchedulerHealth()
    const crmScheduler = getCrmSchedulerHealth()
    const accountingScheduler = getAutoLockSchedulerHealth()
    const runtimeErrors = [
      ...(automation.lastFailureAt ? [{ source: 'automation_scheduler', occurredAt: automation.lastFailureAt }] : []),
      ...(crmScheduler.lastFailureAt ? [{ source: 'crm_scheduler', occurredAt: crmScheduler.lastFailureAt }] : []),
      ...(accountingScheduler.lastFailureAt
        ? [{ source: 'accounting_scheduler', occurredAt: accountingScheduler.lastFailureAt }]
        : []),
    ]
    const recentErrors = [
      ...runtimeErrors,
      ...automationFailures.map((failure) => ({
        source: `automation:${failure.automationKey}`,
        occurredAt: failure.startedAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, RECENT_ERROR_LIMIT)

    const databaseStatus: CheckStatus = mongoState === 1 && mongoLatencyMs !== null ? 'ok' : 'error'
    const automationStatus: CheckStatus = automation.running ? (automation.lastFailureAt ? 'warning' : 'ok') : 'error'
    const uploadStatus: CheckStatus = [documents, tickets, messaging].every((status) => status === 'ok')
      ? 'ok'
      : 'error'
    const overallStatus: CheckStatus = [databaseStatus, automationStatus, uploadStatus].includes('error')
      ? 'error'
      : recentErrors.length > 0 || !process.env.SMTP_HOST || !process.env.VAPID_PUBLIC_KEY
        ? 'warning'
        : 'ok'

    return res.json({
      status: overallStatus,
      database: { status: databaseStatus, latencyMs: mongoLatencyMs },
      email: { status: process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS ? 'ok' : 'warning' },
      push: { status: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? 'ok' : 'warning' },
      automation: {
        status: automationStatus,
        schedulerRunning: automation.running,
        registeredJobs: getAllAutomations().length,
        lastTickAt: automation.lastTickAt,
      },
      schedulers: {
        crm: { running: crmScheduler.running, lastRunAt: crmScheduler.lastRunAt },
        accounting: { running: accountingScheduler.running, lastRunAt: accountingScheduler.lastRunAt },
      },
      uploads: {
        status: uploadStatus,
        directories: [
          { name: 'uploads', status: documents },
          { name: 'tickets', status: tickets },
          { name: 'messagerie', status: messaging },
        ],
      },
      recentErrors,
      checkedAt: checkedAt.toISOString(),
    })
  } catch (error) {
    next(error)
  }
})

export default router
