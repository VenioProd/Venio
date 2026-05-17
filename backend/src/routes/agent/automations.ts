import express, { type Request, type Response, type NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import AutomationLog from '../../automation/models/AutomationLog.js'
import AutomationSettings, {
  getAutomationSettings,
} from '../../automation/models/AutomationSettings.js'
import { getAutomation, getAllAutomations } from '../../automation/registry.js'
import { triggerAutomations } from '../../automation/trigger.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour l'Automation engine (48 jobs).
 *
 * Scopes :
 *   - read:automations            → list registry, logs, settings
 *   - write:automations           → modifier settings (enabled/channels/throttle)
 *   - trigger:automations         → déclencher manuellement un job
 */

const router = express.Router()

function emit(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

// ───────────────────────────────────────────────────────────────────────────
// Registry — liste de toutes les automations enregistrées
// ───────────────────────────────────────────────────────────────────────────

router.get('/automations', requireScope('read:automations'), (_req: Request, res: Response) => {
  const items = getAllAutomations().map((a) => ({
    key: a.key,
    title: a.title,
    triggerType: a.triggerType,
    domain: a.domain,
    schedule: a.schedule,
    channels: a.channels,
    defaultEnabled: a.defaultEnabled,
    retryable: a.retryable,
  }))
  res.json({ items, total: items.length })
})

router.get(
  '/automations/:key',
  requireScope('read:automations'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const a = getAutomation(String(req.params.key))
      if (!a) return respondError(res, 404, 'NOT_FOUND', `Automation ${req.params.key} introuvable`)
      const settings = await getAutomationSettings(a.key)
      res.json({
        key: a.key,
        title: a.title,
        triggerType: a.triggerType,
        domain: a.domain,
        schedule: a.schedule,
        channels: a.channels,
        defaultEnabled: a.defaultEnabled,
        retryable: a.retryable,
        settings,
      })
    } catch (err) {
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// Logs d'exécution
// ───────────────────────────────────────────────────────────────────────────

router.get('/automations/logs', requireScope('read:automations'), async (req, res, next) => {
  try {
    const pag = parsePagination(req)
    const filter: Record<string, unknown> = {}
    if (typeof req.query.automationKey === 'string') filter.automationKey = req.query.automationKey
    if (typeof req.query.status === 'string') filter.status = req.query.status
    const [items, total] = await Promise.all([
      AutomationLog.find(filter).sort({ startedAt: -1 }).skip(pag.skip).limit(pag.limit).lean(),
      AutomationLog.countDocuments(filter),
    ])
    res.json(paginatedResponse(items, pag, total))
  } catch (err) {
    next(err)
  }
})

// ───────────────────────────────────────────────────────────────────────────
// Settings — PATCH (enabled, channels, throttle, escalation)
// ───────────────────────────────────────────────────────────────────────────

router.patch(
  '/automations/:key/settings',
  requireScope('write:automations'),
  param('key').isString().isLength({ min: 1 }),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const a = getAutomation(String(req.params.key))
      if (!a) return respondError(res, 404, 'NOT_FOUND', `Automation ${req.params.key} introuvable`)
      const settings = await getAutomationSettings(a.key)
      const before = settings.toObject()
      if (typeof req.body.enabled === 'boolean') settings.enabled = req.body.enabled
      if (Array.isArray(req.body.channels)) {
        settings.channels = req.body.channels.filter((c: string) =>
          ['in_app', 'email', 'system_log'].includes(c)
        ) as typeof settings.channels
      }
      if (typeof req.body.throttleWindowMinutes === 'number') {
        settings.throttleWindowMinutes = Math.max(0, req.body.throttleWindowMinutes)
      }
      if (typeof req.body.escalationEnabled === 'boolean') {
        settings.escalationEnabled = req.body.escalationEnabled
      }
      if (req.body.config && typeof req.body.config === 'object') {
        settings.config = req.body.config
      }
      await settings.save()
      res.locals.audit = {
        entityType: 'AutomationSettings',
        entityId: String(settings._id),
        entityRef: a.key,
        summary: `Modification settings automation "${a.key}"`,
        before,
        after: settings.toObject(),
      }
      res.json(settings.toObject())
    } catch (err) {
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// Trigger manuel — POST /automations/:key/trigger
// ───────────────────────────────────────────────────────────────────────────

router.post(
  '/automations/:key/trigger',
  requireScope('trigger:automations'),
  param('key').isString().isLength({ min: 1 }),
  body('meta').optional().isObject(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emit(req, res)) return
    try {
      const a = getAutomation(String(req.params.key))
      if (!a) return respondError(res, 404, 'NOT_FOUND', `Automation ${req.params.key} introuvable`)
      // Fire-and-forget : on retourne immédiatement, le log apparaîtra dans
      // /automations/logs après exécution. L'idempotency au niveau API agent
      // (via Idempotency-Key) garantit qu'un retry HTTP ne re-trigger pas.
      triggerAutomations([a.key], (req.body?.meta as Record<string, unknown>) || {})
      res.locals.audit = {
        entityType: 'Automation',
        entityRef: a.key,
        summary: `Déclenchement manuel "${a.key}"`,
        after: { triggered: a.key, meta: req.body?.meta || {} },
      }
      res.status(202).json({ ok: true, triggered: a.key, queuedAt: new Date().toISOString() })
    } catch (err) {
      next(err)
    }
  }
)

// ───────────────────────────────────────────────────────────────────────────
// Liste de tous les settings (lecture)
// ───────────────────────────────────────────────────────────────────────────

router.get('/automations/settings/_all', requireScope('read:automations'), async (_req, res, next) => {
  try {
    const items = await AutomationSettings.find().sort({ key: 1 }).lean()
    res.json({ items })
  } catch (err) {
    next(err)
  }
})

export default router
