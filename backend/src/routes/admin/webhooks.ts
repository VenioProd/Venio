import express, { type NextFunction, type Request, type Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import crypto from 'crypto'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { buildActorFromReq, recordAudit } from '../../lib/audit/auditHelpers.js'
import WebhookDelivery, { WEBHOOK_DELIVERY_STATUSES } from '../../models/WebhookDelivery.js'
import WebhookEndpoint from '../../models/WebhookEndpoint.js'
import { attemptDelivery } from '../../lib/webhooks/deliver.js'
import { buildWebhookPayload } from '../../lib/webhookEvents.js'
import { WEBHOOK_EVENT_TYPE_CATALOG } from '../../lib/webhooks/eventTypes.js'
import { assertValidWebhookUrl } from '../../lib/webhooks/urls.js'
import { encryptWebhookSecret, generateWebhookSecret } from '../../lib/webhooks/secret.js'

/**
 * API d'administration du pipeline de webhooks sortants.
 *
 * Auth : JWT admin (auth + requireAdmin), puis permission par route —
 * view_webhooks en lecture, manage_webhooks en écriture.
 *
 * Le secret d'un endpoint n'est JAMAIS renvoyé après la réponse de création
 * ou de rotation : secretEncrypted est `select: false` au niveau du schéma et
 * n'est chargé qu'au moment de signer.
 */
const router = express.Router()

router.use(auth)
router.use(requireAdmin)

const canView = requirePermission(PERMISSIONS.VIEW_WEBHOOKS)
const canManage = requirePermission(PERMISSIONS.MANAGE_WEBHOOKS)

function firstError(req: Request): string | null {
  const errors = validationResult(req)
  return errors.isEmpty() ? null : String(errors.array()[0]?.msg || 'Requête invalide')
}

async function findEndpointOr404(id: string, res: Response) {
  const endpoint = await WebhookEndpoint.findById(id)
  if (!endpoint) {
    res.status(404).json({ error: 'Endpoint introuvable' })
    return null
  }
  return endpoint
}

// ──────────────────────────────────────────────────────────────────────────
// Livraisons — déclarées avant /:id pour que « deliveries » ne soit jamais
// interprété comme un identifiant d'endpoint.
// ──────────────────────────────────────────────────────────────────────────

router.get(
  '/deliveries/:deliveryId',
  canView,
  param('deliveryId').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const delivery = await WebhookDelivery.findById(req.params.deliveryId)
        .populate('endpoint', 'name url isActive')
        .lean()
      if (!delivery) return res.status(404).json({ error: 'Livraison introuvable' })
      return res.json({ delivery })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/deliveries/:deliveryId/replay',
  canManage,
  param('deliveryId').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const source = await WebhookDelivery.findById(req.params.deliveryId)
      if (!source) return res.status(404).json({ error: 'Livraison introuvable' })

      // Rejeu = nouvelle livraison, même eventId et même payload figé.
      const replay = await WebhookDelivery.create({
        endpoint: source.endpoint,
        eventId: source.eventId,
        eventType: source.eventType,
        payload: source.payload,
      })
      const outcome = await attemptDelivery(replay._id)

      await recordAudit({
        action: 'WEBHOOK_DELIVERY_REPLAY',
        actor: buildActorFromReq(req),
        entityType: 'WebhookDelivery',
        entityId: String(replay._id),
        summary: `Rejeu de la livraison ${source._id} (${source.eventType})`,
        extra: { sourceDeliveryId: String(source._id), eventId: source.eventId },
      })

      return res.status(201).json({ delivery: await WebhookDelivery.findById(replay._id).lean(), outcome })
    } catch (err) {
      return next(err)
    }
  },
)

// ──────────────────────────────────────────────────────────────────────────
// Endpoints
// ──────────────────────────────────────────────────────────────────────────

router.get('/', canView, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const endpoints = await WebhookEndpoint.find().sort({ createdAt: -1 }).populate('createdBy', 'name email').lean()
    // Le catalogue voyage avec la liste : l'UI n'a qu'un appel à faire pour
    // afficher les endpoints et alimenter le sélecteur de types.
    res.json({ endpoints, eventTypes: WEBHOOK_EVENT_TYPE_CATALOG })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/',
  canManage,
  body('name').isString().trim().isLength({ min: 1, max: 120 }).withMessage('Nom requis (max 120 caractères)'),
  body('eventTypes').optional().isArray().withMessage('eventTypes doit être un tableau'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      let url: string
      try {
        url = assertValidWebhookUrl(req.body.url)
      } catch (err) {
        return res.status(400).json({ error: (err as Error).message })
      }

      const secret = generateWebhookSecret()
      const created = await WebhookEndpoint.create({
        name: String(req.body.name).trim(),
        url,
        secretEncrypted: encryptWebhookSecret(secret),
        eventTypes: Array.isArray(req.body.eventTypes) ? req.body.eventTypes.map(String) : [],
        createdBy: req.user?.id || null,
      })

      await recordAudit({
        action: 'WEBHOOK_ENDPOINT_CREATE',
        actor: buildActorFromReq(req),
        entityType: 'WebhookEndpoint',
        entityId: String(created._id),
        entityRef: created.name,
        summary: `Création de l'endpoint ${created.name}`,
        after: { name: created.name, url: created.url, eventTypes: created.eventTypes },
      })

      // Unique occasion où le secret circule en clair.
      return res.status(201).json({ endpoint: await WebhookEndpoint.findById(created._id).lean(), secret })
    } catch (err) {
      return next(err)
    }
  },
)

router.patch(
  '/:id',
  canManage,
  param('id').isMongoId().withMessage('ID invalide'),
  body('name').optional().isString().trim().isLength({ min: 1, max: 120 }).withMessage('Nom invalide'),
  body('eventTypes').optional().isArray().withMessage('eventTypes doit être un tableau'),
  body('isActive').optional().isBoolean().withMessage('isActive doit être un booléen'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const endpoint = await findEndpointOr404(String(req.params.id), res)
      if (!endpoint) return undefined

      const before = {
        name: endpoint.name,
        url: endpoint.url,
        eventTypes: [...endpoint.eventTypes],
        isActive: endpoint.isActive,
      }

      if (req.body.url !== undefined) {
        try {
          endpoint.url = assertValidWebhookUrl(req.body.url)
        } catch (err) {
          return res.status(400).json({ error: (err as Error).message })
        }
      }
      if (req.body.name !== undefined) endpoint.name = String(req.body.name).trim()
      if (Array.isArray(req.body.eventTypes)) endpoint.eventTypes = req.body.eventTypes.map(String)

      if (req.body.isActive === true && !endpoint.isActive) {
        // Réactivation : on repart d'une santé neuve, sinon le prochain échec
        // rebasculerait immédiatement l'endpoint en auto-désactivation.
        endpoint.isActive = true
        endpoint.consecutiveFailures = 0
        endpoint.disabledAt = null
        endpoint.disabledReason = null
      } else if (req.body.isActive === false && endpoint.isActive) {
        endpoint.isActive = false
        endpoint.disabledAt = new Date()
        endpoint.disabledReason = 'MANUAL'
      }

      await endpoint.save()

      await recordAudit({
        action: 'WEBHOOK_ENDPOINT_UPDATE',
        actor: buildActorFromReq(req),
        entityType: 'WebhookEndpoint',
        entityId: String(endpoint._id),
        entityRef: endpoint.name,
        summary: `Mise à jour de l'endpoint ${endpoint.name}`,
        before,
        after: {
          name: endpoint.name,
          url: endpoint.url,
          eventTypes: endpoint.eventTypes,
          isActive: endpoint.isActive,
        },
      })

      return res.json({ endpoint: await WebhookEndpoint.findById(endpoint._id).lean() })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/rotate-secret',
  canManage,
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const endpoint = await findEndpointOr404(String(req.params.id), res)
      if (!endpoint) return undefined

      const secret = generateWebhookSecret()
      endpoint.secretEncrypted = encryptWebhookSecret(secret)
      await endpoint.save()

      await recordAudit({
        action: 'WEBHOOK_ENDPOINT_ROTATE',
        actor: buildActorFromReq(req),
        entityType: 'WebhookEndpoint',
        entityId: String(endpoint._id),
        entityRef: endpoint.name,
        summary: `Rotation du secret de l'endpoint ${endpoint.name}`,
      })

      return res.json({ endpoint: await WebhookEndpoint.findById(endpoint._id).lean(), secret })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/:id/test',
  canManage,
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const endpoint = await findEndpointOr404(String(req.params.id), res)
      if (!endpoint) return undefined

      // L'envoi de test court-circuite emitWebhookEvent : le type WEBHOOK_*
      // y est bloqué par l'anti-boucle, et un test ignore le filtre
      // eventTypes puisque l'admin cible explicitement cet endpoint.
      const eventId = crypto.randomUUID()
      const delivery = await WebhookDelivery.create({
        endpoint: endpoint._id,
        eventId,
        eventType: 'WEBHOOK_TEST',
        payload: buildWebhookPayload(
          eventId,
          {
            type: 'WEBHOOK_TEST',
            title: 'Test de webhook Venio',
            message: `Envoi de test vers « ${endpoint.name} ».`,
            link: '/admin/webhooks',
            metadata: { endpointId: String(endpoint._id) },
          },
          new Date(),
        ),
      })
      const outcome = await attemptDelivery(delivery._id)

      await recordAudit({
        action: 'WEBHOOK_TEST_SENT',
        actor: buildActorFromReq(req),
        entityType: 'WebhookEndpoint',
        entityId: String(endpoint._id),
        entityRef: endpoint.name,
        summary: `Envoi de test vers ${endpoint.name}`,
        extra: { deliveryId: String(delivery._id), ok: outcome?.ok ?? false },
      })

      return res.json({ delivery: await WebhookDelivery.findById(delivery._id).lean(), outcome })
    } catch (err) {
      return next(err)
    }
  },
)

router.delete(
  '/:id',
  canManage,
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const endpoint = await findEndpointOr404(String(req.params.id), res)
      if (!endpoint) return undefined

      const { deletedCount } = await WebhookDelivery.deleteMany({ endpoint: endpoint._id })
      await WebhookEndpoint.deleteOne({ _id: endpoint._id })

      await recordAudit({
        action: 'WEBHOOK_ENDPOINT_DELETE',
        actor: buildActorFromReq(req),
        entityType: 'WebhookEndpoint',
        entityId: String(endpoint._id),
        entityRef: endpoint.name,
        summary: `Suppression de l'endpoint ${endpoint.name}`,
        before: { name: endpoint.name, url: endpoint.url },
        extra: { deletedDeliveries: deletedCount || 0 },
      })

      return res.json({ ok: true, deletedDeliveries: deletedCount || 0 })
    } catch (err) {
      return next(err)
    }
  },
)

router.get(
  '/:id/deliveries',
  canView,
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const invalid = firstError(req)
      if (invalid) return res.status(400).json({ error: invalid })

      const filter: Record<string, unknown> = { endpoint: req.params.id }
      const status = String(req.query.status || '')
      if ((WEBHOOK_DELIVERY_STATUSES as readonly string[]).includes(status)) filter.status = status
      const eventType = String(req.query.eventType || '')
      if (eventType) filter.eventType = eventType

      const page = Math.max(Number(req.query.page) || 1, 1)
      const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100)

      const [deliveries, total] = await Promise.all([
        WebhookDelivery.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .select('-payload') // la liste reste légère, le détail porte le payload
          .lean(),
        WebhookDelivery.countDocuments(filter),
      ])

      return res.json({ deliveries, total, page, pages: Math.max(Math.ceil(total / limit), 1) })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
