import { Router, type Request, type Response } from 'express'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import {
  getAllAutomations,
  getAutomation,
  runAutomation,
  buildContext,
  listAutomationSettings,
  getAutomationSettings,
  updateAutomationSettings,
  getRecentLogs,
  getLogStats,
} from '../../automation/index.js'

const router = Router()

router.use(auth)
router.use(requireAdmin)

// GET /api/admin/automations — list all automations with settings
router.get('/', async (_req: Request, res: Response) => {
  try {
    const automations = getAllAutomations()
    const settings = await listAutomationSettings()

    const result = automations.map((a) => {
      const s = settings.find((s) => s.key === a.key)
      return {
        key: a.key,
        title: a.title,
        domain: a.domain,
        triggerType: a.triggerType,
        schedule: a.schedule,
        channels: a.channels,
        defaultEnabled: a.defaultEnabled,
        enabled: s?.enabled ?? a.defaultEnabled,
        throttleWindowMinutes: s?.throttleWindowMinutes ?? 0,
        escalationEnabled: s?.escalationEnabled ?? false,
      }
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/admin/automations/:key — get automation detail
router.get('/:key', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string
    const automation = getAutomation(key)
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' })
    }

    const settings = await getAutomationSettings(key)
    const logs = await getRecentLogs(key, 20)

    res.json({
      key: automation.key,
      title: automation.title,
      domain: automation.domain,
      triggerType: automation.triggerType,
      schedule: automation.schedule,
      channels: automation.channels,
      recipientStrategy: automation.recipientStrategy,
      retryable: automation.retryable,
      maxRetries: automation.maxRetries,
      defaultEnabled: automation.defaultEnabled,
      permissionsScope: automation.permissionsScope,
      settings,
      recentLogs: logs,
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// PATCH /api/admin/automations/:key/settings — update settings
router.patch('/:key/settings', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string
    const automation = getAutomation(key)
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' })
    }

    const updates: Record<string, unknown> = {}
    if (typeof req.body.enabled === 'boolean') updates.enabled = req.body.enabled
    if (Array.isArray(req.body.channels)) updates.channels = req.body.channels
    if (typeof req.body.throttleWindowMinutes === 'number') updates.throttleWindowMinutes = req.body.throttleWindowMinutes
    if (typeof req.body.escalationEnabled === 'boolean') updates.escalationEnabled = req.body.escalationEnabled
    if (req.body.config && typeof req.body.config === 'object') updates.config = req.body.config

    const settings = await updateAutomationSettings(key, updates)
    res.json(settings)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/admin/automations/:key/trigger — manually trigger
router.post('/:key/trigger', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string
    const automation = getAutomation(key)
    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' })
    }

    const ctx = buildContext()
    if (req.body.meta) {
      ctx.meta = req.body.meta
    }

    const result = await runAutomation(automation, ctx)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/admin/automations/:key/logs — execution logs
router.get('/:key/logs', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const logs = await getRecentLogs(key, limit)
    res.json(logs)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/admin/automations/:key/stats — execution stats
router.get('/:key/stats', async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string
    const since = new Date(Date.now() - 30 * 24 * 3600_000) // last 30 days
    const stats = await getLogStats(key, since)
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
