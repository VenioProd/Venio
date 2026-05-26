import express, { type Request, type Response } from 'express'
import auth from '../../../middleware/auth.js'
import { requireAdmin } from '../../../middleware/role.js'
import { getInternSettings } from '../../../models/InternSettings.js'
import { getRecentLogs } from '../../../automation/models/AutomationLog.js'

const router = express.Router()
router.use(auth)

// GET /api/admin/interns/settings/report-notifs
router.get('/settings/report-notifs', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const settings = await getInternSettings()
    const populated = await settings.populate('reportNotifRecipients', 'name email role')
    res.json({ recipients: (populated.reportNotifRecipients as any[]) })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// PATCH /api/admin/interns/settings/report-notifs
router.patch('/settings/report-notifs', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Non autorisé' })
    const { recipientIds } = req.body
    if (!Array.isArray(recipientIds)) return res.status(400).json({ error: 'recipientIds requis' })
    const settings = await getInternSettings()
    settings.reportNotifRecipients = recipientIds
    await settings.save()
    const populated = await settings.populate('reportNotifRecipients', 'name email role')
    res.json({ recipients: (populated.reportNotifRecipients as any[]) })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// POST /api/admin/interns/send-reminders — déclencher manuellement les rappels (bypass idempotency)
router.post('/send-reminders', requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user
    if (user.role !== 'SUPER_ADMIN') return res.status(403).json({ error: 'Non autorisé' })
    const { buildContext } = await import('../../../automation/engine.js')
    const { getAutomation } = await import('../../../automation/registry.js')
    const { createExecutionLog } = await import('../../../automation/models/AutomationLog.js')
    const definition = getAutomation('intern.report_reminder')
    if (!definition) return res.status(404).json({ error: 'Automation introuvable' })
    // Use a unique key with timestamp to bypass the daily idempotency lock
    const ctx = { ...buildContext(), dateKey: `manual:${Date.now()}` }
    const startedAt = new Date()
    const result = await definition.execute(ctx)
    await createExecutionLog({
      automationKey: definition.key,
      executionType: 'cron',
      triggerSource: 'manual_trigger',
      idempotencyKey: ctx.dateKey,
      status: 'SUCCESS',
      startedAt,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      actionsExecuted: result.actionsExecuted,
      recipientsNotified: result.recipientsNotified,
    })
    res.json({
      success: true,
      actionsExecuted: result.actionsExecuted,
      recipientsNotified: result.recipientsNotified,
      details: result.details,
    })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

// GET /api/admin/interns/reminder-logs — logs des rappels envoyés
router.get('/reminder-logs', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const logs = await getRecentLogs('intern.report_reminder', 30)
    res.json({ logs })
  } catch {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
