import express, { type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import auth from '../../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../../middleware/role.js'
import { PERMISSIONS } from '../../../lib/permissions.js'
import ExternalSource from '../../../models/ExternalSource.js'
import ExternalTransaction from '../../../models/ExternalTransaction.js'
import ClassificationRule from '../../../models/ClassificationRule.js'
import AuditLog from '../../../models/AuditLog.js'
import { generateApiKey, generateWebhookSecret } from '../../../lib/external/apiKey.js'
import { resetForSource } from '../../../lib/external/rateLimit.js'
import type { IExternalSource } from '../../../types/models/index.js'
import { sensitiveAction } from '../../../lib/security/sensitiveActions.js'

/**
 * Admin — gestion des ExternalSource + ClassificationRule.
 *
 * Permission : MANAGE_EXTERNAL_SOURCES (réservée SUPER_ADMIN).
 * Sécurité :
 *   - On ne renvoie JAMAIS l'apiKeyHash ni le webhookSecret dans GET.
 *   - apiKey en clair + webhookSecret en clair ne sont renvoyés qu'aux
 *     endpoints POST / et POST /:id/rotate (UNE SEULE FOIS).
 */

const router = express.Router()

router.use(auth)
router.use(requireAdmin)
router.use(requirePermission(PERMISSIONS.MANAGE_EXTERNAL_SOURCES))

const SECRET_WARNING = 'Cette clé et ce secret ne seront PLUS jamais affichés. Stockez-les de manière sécurisée.'

const PUBLIC_FIELDS = {
  apiKeyHash: 0,
  webhookSecret: 0,
} as const

function isValidObjectId(value: unknown): boolean {
  return mongoose.isValidObjectId(value)
}

type SanitizedSource = Omit<Record<string, unknown>, 'apiKeyHash' | 'webhookSecret'>

function sanitizeSource(doc: IExternalSource | Record<string, unknown> | null): SanitizedSource | null {
  if (!doc) return null
  const obj =
    typeof (doc as { toObject?: unknown }).toObject === 'function'
      ? (doc as unknown as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(doc as Record<string, unknown>) }
  delete (obj as Record<string, unknown>).apiKeyHash
  delete (obj as Record<string, unknown>).webhookSecret
  return obj
}

// ----------------------------------------------------------------------------
// CRUD ExternalSource
// ----------------------------------------------------------------------------

router.get('/', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const sources = await ExternalSource.find({}, PUBLIC_FIELDS).sort({ slug: 1 }).lean()
    res.json({ sources })
  } catch (err) {
    next(err)
  }
})

router.post(
  '/',
  sensitiveAction('EXTERNAL_SOURCE_CREATE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        slug,
        name,
        description,
        autoValidateAll,
        rateLimitPerMin,
        timestampToleranceSec,
        defaultJournalCode,
        defaultCustomerAccount,
        defaultRevenueAccount,
        defaultExpenseAccount,
        defaultBankAccount,
        defaultVatCollectedAccount,
        defaultVatDeductibleAccount,
        status,
      } = (req.body || {}) as Record<string, unknown>

      if (!slug || !name) {
        const err = new Error('slug et name requis') as Error & { status?: number }
        err.status = 400
        throw err
      }

      const cleanSlug = String(slug).toLowerCase().trim()
      if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(cleanSlug)) {
        const err = new Error('slug invalide (lettres minuscules, chiffres, tirets)') as Error & { status?: number }
        err.status = 400
        throw err
      }

      const existing = await ExternalSource.findOne({ slug: cleanSlug })
      if (existing) {
        const err = new Error('Slug déjà utilisé') as Error & { status?: number }
        err.status = 409
        throw err
      }

      const { plain: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = await generateApiKey()
      const webhookSecret = generateWebhookSecret()

      const source = await ExternalSource.create({
        slug: cleanSlug,
        name: String(name),
        description: description ? String(description) : '',
        apiKeyHash,
        apiKeyPrefix,
        webhookSecret,
        timestampToleranceSec: timestampToleranceSec != null ? Number(timestampToleranceSec) : undefined,
        status: status ? String(status) : 'ACTIVE',
        autoValidateAll: Boolean(autoValidateAll),
        rateLimitPerMin: rateLimitPerMin != null ? Number(rateLimitPerMin) : undefined,
        defaultJournalCode: defaultJournalCode ? String(defaultJournalCode) : undefined,
        defaultCustomerAccount: defaultCustomerAccount ? String(defaultCustomerAccount) : undefined,
        defaultRevenueAccount: defaultRevenueAccount ? String(defaultRevenueAccount) : undefined,
        defaultExpenseAccount: defaultExpenseAccount ? String(defaultExpenseAccount) : undefined,
        defaultBankAccount: defaultBankAccount ? String(defaultBankAccount) : undefined,
        defaultVatCollectedAccount: defaultVatCollectedAccount ? String(defaultVatCollectedAccount) : undefined,
        defaultVatDeductibleAccount: defaultVatDeductibleAccount ? String(defaultVatDeductibleAccount) : undefined,
        createdBy: req.user?.id || null,
      })

      AuditLog.create({
        userId: req.user?.id || null,
        email: req.user?.email || '',
        action: 'EXTERNAL_SOURCE_CREATE',
        ip: String(req.headers['x-forwarded-for'] || req.ip || ''),
        userAgent: String(req.headers['user-agent'] || ''),
        metadata: {
          entityType: 'ExternalSource',
          entityId: source._id,
          entityRef: source.slug,
          summary: `Création source externe ${source.slug}`,
          after: {
            slug: source.slug,
            name: source.name,
            status: source.status,
            autoValidateAll: source.autoValidateAll,
            defaultJournalCode: source.defaultJournalCode,
          },
          // On ne logge JAMAIS apiKey/webhookSecret en clair, mais on note le prefix
          // pour pouvoir tracer une fuite éventuelle.
          apiKeyPrefix: source.apiKeyPrefix,
        },
      }).catch(() => {})

      res.status(201).json({
        source: sanitizeSource(source),
        apiKey,
        webhookSecret,
        warning: SECRET_WARNING,
      })
    } catch (err) {
      const e = err as Error & { status?: number; code?: number }
      if (e.status) {
        res.status(e.status).json({ error: e.message })
        return
      }
      if (e.code === 11000) {
        res.status(409).json({ error: 'Slug déjà utilisé' })
        return
      }
      next(err)
    }
  },
)

router.get('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!isValidObjectId(req.params.id)) {
      res.status(404).json({ error: 'Source introuvable' })
      return
    }
    const source = await ExternalSource.findById(req.params.id, PUBLIC_FIELDS).lean()
    if (!source) {
      res.status(404).json({ error: 'Source introuvable' })
      return
    }
    const [rulesCount, txCount] = await Promise.all([
      ClassificationRule.countDocuments({ source: source._id }),
      ExternalTransaction.countDocuments({ source: source._id }),
    ])
    res.json({ source, stats: { rulesCount, txCount } })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!isValidObjectId(req.params.id)) {
      res.status(404).json({ error: 'Source introuvable' })
      return
    }
    const source = await ExternalSource.findById(req.params.id)
    if (!source) {
      res.status(404).json({ error: 'Source introuvable' })
      return
    }

    const editable = [
      'name',
      'description',
      'status',
      'autoValidateAll',
      'rateLimitPerMin',
      'timestampToleranceSec',
      'defaultJournalCode',
      'defaultCustomerAccount',
      'defaultRevenueAccount',
      'defaultExpenseAccount',
      'defaultBankAccount',
      'defaultVatCollectedAccount',
      'defaultVatDeductibleAccount',
    ] as const
    const before = sanitizeSource(source.toObject())
    const body = (req.body || {}) as Record<string, unknown>
    for (const f of editable) {
      if (body[f] !== undefined) {
        ;(source as unknown as Record<string, unknown>)[f] = body[f]
      }
    }
    await source.save()

    // Si le quota a changé, on reset le compteur in-memory
    if (body.rateLimitPerMin !== undefined) {
      resetForSource(String(source._id))
    }

    const after = sanitizeSource(source.toObject())
    AuditLog.create({
      userId: req.user?.id || null,
      email: req.user?.email || '',
      action: 'EXTERNAL_SOURCE_UPDATE',
      ip: String(req.headers['x-forwarded-for'] || req.ip || ''),
      userAgent: String(req.headers['user-agent'] || ''),
      metadata: {
        entityType: 'ExternalSource',
        entityId: source._id,
        entityRef: source.slug,
        summary: `Modification source ${source.slug}`,
        before,
        after,
      },
    }).catch(() => {})

    res.json({ source: after })
  } catch (err) {
    const e = err as Error & { status?: number }
    if (e.status) {
      res.status(e.status).json({ error: e.message })
      return
    }
    next(err)
  }
})

router.delete(
  '/:id',
  sensitiveAction('EXTERNAL_SOURCE_DELETE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isValidObjectId(req.params.id)) {
        res.status(404).json({ error: 'Source introuvable' })
        return
      }
      const source = await ExternalSource.findById(req.params.id)
      if (!source) {
        res.status(404).json({ error: 'Source introuvable' })
        return
      }
      const before = sanitizeSource(source.toObject())
      // On conserve les ExternalTransaction (10 ans), on supprime les rules.
      const rulesDeleted = await ClassificationRule.deleteMany({ source: source._id })
      await source.deleteOne()
      resetForSource(String(source._id))
      AuditLog.create({
        userId: req.user?.id || null,
        email: req.user?.email || '',
        action: 'EXTERNAL_SOURCE_DELETE',
        ip: String(req.headers['x-forwarded-for'] || req.ip || ''),
        userAgent: String(req.headers['user-agent'] || ''),
        metadata: {
          entityType: 'ExternalSource',
          entityId: source._id,
          entityRef: source.slug,
          summary: `Suppression source ${source.slug}`,
          before,
          rulesDeleted: rulesDeleted.deletedCount || 0,
        },
      }).catch(() => {})
      res.json({ ok: true })
    } catch (err) {
      next(err)
    }
  },
)

router.post(
  '/:id/rotate',
  sensitiveAction('EXTERNAL_SOURCE_ROTATE'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isValidObjectId(req.params.id)) {
        res.status(404).json({ error: 'Source introuvable' })
        return
      }
      const source = await ExternalSource.findById(req.params.id)
      if (!source) {
        res.status(404).json({ error: 'Source introuvable' })
        return
      }
      const previousPrefix = source.apiKeyPrefix
      const { plain: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = await generateApiKey()
      const webhookSecret = generateWebhookSecret()
      source.apiKeyHash = apiKeyHash
      source.apiKeyPrefix = apiKeyPrefix
      source.webhookSecret = webhookSecret
      source.rotatedAt = new Date()
      await source.save()
      AuditLog.create({
        userId: req.user?.id || null,
        email: req.user?.email || '',
        action: 'EXTERNAL_SOURCE_ROTATE',
        ip: String(req.headers['x-forwarded-for'] || req.ip || ''),
        userAgent: String(req.headers['user-agent'] || ''),
        metadata: {
          entityType: 'ExternalSource',
          entityId: source._id,
          entityRef: source.slug,
          summary: `Rotation des credentials ${source.slug}`,
          previousApiKeyPrefix: previousPrefix,
          newApiKeyPrefix: apiKeyPrefix,
          rotatedAt: source.rotatedAt,
        },
      }).catch(() => {})
      res.json({
        source: sanitizeSource(source),
        apiKey,
        webhookSecret,
        warning: SECRET_WARNING,
      })
    } catch (err) {
      next(err)
    }
  },
)

// ----------------------------------------------------------------------------
// ClassificationRule (rattachées à une source)
// ----------------------------------------------------------------------------

router.get('/:id/rules', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!isValidObjectId(req.params.id)) {
      res.status(404).json({ error: 'Source introuvable' })
      return
    }
    const rules = await ClassificationRule.find({ source: req.params.id }).sort({ priority: -1, createdAt: 1 }).lean()
    res.json({ rules })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/rules', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!isValidObjectId(req.params.id)) {
      res.status(404).json({ error: 'Source introuvable' })
      return
    }
    const source = await ExternalSource.findById(req.params.id).lean()
    if (!source) {
      res.status(404).json({ error: 'Source introuvable' })
      return
    }

    const { name, priority, enabled, conditions, mapping } = (req.body || {}) as Record<string, unknown>
    if (!name) {
      res.status(400).json({ error: 'name requis' })
      return
    }
    const rule = await ClassificationRule.create({
      source: source._id,
      name: String(name),
      priority: priority != null ? Number(priority) : 100,
      enabled: enabled !== false,
      conditions: (conditions as Record<string, unknown>) || {},
      mapping: (mapping as Record<string, unknown>) || {},
    })
    res.status(201).json({ rule })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id/rules/:ruleId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!isValidObjectId(req.params.id) || !isValidObjectId(req.params.ruleId)) {
      res.status(404).json({ error: 'Règle introuvable' })
      return
    }
    const rule = await ClassificationRule.findOne({
      _id: req.params.ruleId,
      source: req.params.id,
    })
    if (!rule) {
      res.status(404).json({ error: 'Règle introuvable' })
      return
    }
    const fields = ['name', 'priority', 'enabled', 'conditions', 'mapping'] as const
    const body = (req.body || {}) as Record<string, unknown>
    for (const f of fields) {
      if (body[f] !== undefined) {
        ;(rule as unknown as Record<string, unknown>)[f] = body[f]
      }
    }
    await rule.save()
    res.json({ rule })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id/rules/:ruleId', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!isValidObjectId(req.params.id) || !isValidObjectId(req.params.ruleId)) {
      res.status(404).json({ error: 'Règle introuvable' })
      return
    }
    const rule = await ClassificationRule.findOneAndDelete({
      _id: req.params.ruleId,
      source: req.params.id,
    })
    if (!rule) {
      res.status(404).json({ error: 'Règle introuvable' })
      return
    }
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// ----------------------------------------------------------------------------
// Transactions par source
// ----------------------------------------------------------------------------

router.get('/:id/transactions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!isValidObjectId(req.params.id)) {
      res.status(404).json({ error: 'Source introuvable' })
      return
    }
    const { status, from, to, page = '1', limit = '50' } = req.query as Record<string, string | undefined>
    const filter: Record<string, unknown> = { source: req.params.id }
    if (status) filter.status = String(status)
    if (from || to) {
      const range: Record<string, Date> = {}
      if (from) range.$gte = new Date(String(from))
      if (to) range.$lte = new Date(String(to))
      filter.receivedAt = range
    }
    const skip = (Number(page) - 1) * Number(limit)
    const [items, total] = await Promise.all([
      ExternalTransaction.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      ExternalTransaction.countDocuments(filter),
    ])
    res.json({ items, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    next(err)
  }
})

export default router
