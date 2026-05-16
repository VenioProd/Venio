import express from 'express'
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
import { buildActorFromReq, shallowDiff } from '../../../lib/audit/auditMiddleware.js'

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

const SECRET_WARNING =
  'Cette clé et ce secret ne seront PLUS jamais affichés. Stockez-les de manière sécurisée.'

const PUBLIC_FIELDS = {
  apiKeyHash: 0,
  webhookSecret: 0,
}

function isValidObjectId(value) {
  return mongoose.isValidObjectId(value)
}

function sanitizeSource(doc) {
  if (!doc) return null
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc }
  delete obj.apiKeyHash
  delete obj.webhookSecret
  return obj
}

// ----------------------------------------------------------------------------
// CRUD ExternalSource
// ----------------------------------------------------------------------------

router.get('/', async (_req, res, next) => {
  try {
    const sources = await ExternalSource.find({}, PUBLIC_FIELDS).sort({ slug: 1 }).lean()
    res.json({ sources })
  } catch (err) {
    next(err)
  }
})

router.post('/', async (req, res, next) => {
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
    } = req.body || {}

    if (!slug || !name) {
      const err = new Error('slug et name requis')
      err.status = 400
      throw err
    }

    const cleanSlug = String(slug).toLowerCase().trim()
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(cleanSlug)) {
      const err = new Error('slug invalide (lettres minuscules, chiffres, tirets)')
      err.status = 400
      throw err
    }

    const existing = await ExternalSource.findOne({ slug: cleanSlug })
    if (existing) {
      const err = new Error('Slug déjà utilisé')
      err.status = 409
      throw err
    }

    const { plain: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = await generateApiKey()
    const webhookSecret = generateWebhookSecret()

    const source = await ExternalSource.create({
      slug: cleanSlug,
      name,
      description: description || '',
      apiKeyHash,
      apiKeyPrefix,
      webhookSecret,
      timestampToleranceSec:
        timestampToleranceSec != null ? Number(timestampToleranceSec) : undefined,
      status: status || 'ACTIVE',
      autoValidateAll: Boolean(autoValidateAll),
      rateLimitPerMin: rateLimitPerMin != null ? Number(rateLimitPerMin) : undefined,
      defaultJournalCode: defaultJournalCode || undefined,
      defaultCustomerAccount: defaultCustomerAccount || undefined,
      defaultRevenueAccount: defaultRevenueAccount || undefined,
      defaultExpenseAccount: defaultExpenseAccount || undefined,
      defaultBankAccount: defaultBankAccount || undefined,
      defaultVatCollectedAccount: defaultVatCollectedAccount || undefined,
      defaultVatDeductibleAccount: defaultVatDeductibleAccount || undefined,
      createdBy: req.user?.id || null,
    })

    AuditLog.record({
      action: 'EXTERNAL_SOURCE_CREATE',
      entityType: 'ExternalSource',
      entityId: source._id,
      entityRef: source.slug,
      actor: buildActorFromReq(req),
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
      metadata: { apiKeyPrefix: source.apiKeyPrefix },
    })

    res.status(201).json({
      source: sanitizeSource(source),
      apiKey,
      webhookSecret,
      warning: SECRET_WARNING,
    })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    if (err.code === 11000) return res.status(409).json({ error: 'Slug déjà utilisé' })
    next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Source introuvable' })
    }
    const source = await ExternalSource.findById(req.params.id, PUBLIC_FIELDS).lean()
    if (!source) return res.status(404).json({ error: 'Source introuvable' })
    const [rulesCount, txCount] = await Promise.all([
      ClassificationRule.countDocuments({ source: source._id }),
      ExternalTransaction.countDocuments({ source: source._id }),
    ])
    res.json({ source, stats: { rulesCount, txCount } })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Source introuvable' })
    }
    const source = await ExternalSource.findById(req.params.id)
    if (!source) return res.status(404).json({ error: 'Source introuvable' })

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
    ]
    const before = sanitizeSource(source.toObject())
    for (const f of editable) {
      if (req.body[f] !== undefined) source[f] = req.body[f]
    }
    await source.save()

    // Si le quota a changé, on reset le compteur in-memory
    if (req.body.rateLimitPerMin !== undefined) {
      resetForSource(String(source._id))
    }

    const after = sanitizeSource(source.toObject())
    AuditLog.record({
      action: 'EXTERNAL_SOURCE_UPDATE',
      entityType: 'ExternalSource',
      entityId: source._id,
      entityRef: source.slug,
      actor: buildActorFromReq(req),
      summary: `Modification source ${source.slug}`,
      before,
      after,
      diff: shallowDiff(before, after),
    })

    res.json({ source: after })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Source introuvable' })
    }
    const source = await ExternalSource.findById(req.params.id)
    if (!source) return res.status(404).json({ error: 'Source introuvable' })
    const before = sanitizeSource(source.toObject())
    // On conserve les ExternalTransaction (10 ans), on supprime les rules.
    const rulesDeleted = await ClassificationRule.deleteMany({ source: source._id })
    await source.deleteOne()
    resetForSource(String(source._id))
    AuditLog.record({
      action: 'EXTERNAL_SOURCE_DELETE',
      entityType: 'ExternalSource',
      entityId: source._id,
      entityRef: source.slug,
      actor: buildActorFromReq(req),
      summary: `Suppression source ${source.slug}`,
      before,
      metadata: { rulesDeleted: rulesDeleted.deletedCount || 0 },
    })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/rotate', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Source introuvable' })
    }
    const source = await ExternalSource.findById(req.params.id)
    if (!source) return res.status(404).json({ error: 'Source introuvable' })
    const previousPrefix = source.apiKeyPrefix
    const { plain: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = await generateApiKey()
    const webhookSecret = generateWebhookSecret()
    source.apiKeyHash = apiKeyHash
    source.apiKeyPrefix = apiKeyPrefix
    source.webhookSecret = webhookSecret
    source.rotatedAt = new Date()
    await source.save()
    AuditLog.record({
      action: 'EXTERNAL_SOURCE_ROTATE',
      entityType: 'ExternalSource',
      entityId: source._id,
      entityRef: source.slug,
      actor: buildActorFromReq(req),
      summary: `Rotation des credentials ${source.slug}`,
      metadata: {
        previousApiKeyPrefix: previousPrefix,
        newApiKeyPrefix: apiKeyPrefix,
        rotatedAt: source.rotatedAt,
      },
    })
    res.json({
      source: sanitizeSource(source),
      apiKey,
      webhookSecret,
      warning: SECRET_WARNING,
    })
  } catch (err) {
    next(err)
  }
})

// ----------------------------------------------------------------------------
// ClassificationRule (rattachées à une source)
// ----------------------------------------------------------------------------

router.get('/:id/rules', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Source introuvable' })
    }
    const rules = await ClassificationRule.find({ source: req.params.id })
      .sort({ priority: -1, createdAt: 1 })
      .lean()
    res.json({ rules })
  } catch (err) {
    next(err)
  }
})

router.post('/:id/rules', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Source introuvable' })
    }
    const source = await ExternalSource.findById(req.params.id).lean()
    if (!source) return res.status(404).json({ error: 'Source introuvable' })

    const { name, priority, enabled, conditions, mapping } = req.body || {}
    if (!name) {
      return res.status(400).json({ error: 'name requis' })
    }
    const rule = await ClassificationRule.create({
      source: source._id,
      name,
      priority: priority != null ? Number(priority) : 100,
      enabled: enabled !== false,
      conditions: conditions || {},
      mapping: mapping || {},
    })
    res.status(201).json({ rule })
  } catch (err) {
    next(err)
  }
})

router.patch('/:id/rules/:ruleId', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id) || !isValidObjectId(req.params.ruleId)) {
      return res.status(404).json({ error: 'Règle introuvable' })
    }
    const rule = await ClassificationRule.findOne({
      _id: req.params.ruleId,
      source: req.params.id,
    })
    if (!rule) return res.status(404).json({ error: 'Règle introuvable' })
    const fields = ['name', 'priority', 'enabled', 'conditions', 'mapping']
    for (const f of fields) {
      if (req.body[f] !== undefined) rule[f] = req.body[f]
    }
    await rule.save()
    res.json({ rule })
  } catch (err) {
    next(err)
  }
})

router.delete('/:id/rules/:ruleId', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id) || !isValidObjectId(req.params.ruleId)) {
      return res.status(404).json({ error: 'Règle introuvable' })
    }
    const rule = await ClassificationRule.findOneAndDelete({
      _id: req.params.ruleId,
      source: req.params.id,
    })
    if (!rule) return res.status(404).json({ error: 'Règle introuvable' })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

// ----------------------------------------------------------------------------
// Transactions par source
// ----------------------------------------------------------------------------

router.get('/:id/transactions', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Source introuvable' })
    }
    const { status, from, to, page = 1, limit = 50 } = req.query
    const filter = { source: req.params.id }
    if (status) filter.status = String(status)
    if (from || to) {
      filter.receivedAt = {}
      if (from) filter.receivedAt.$gte = new Date(String(from))
      if (to) filter.receivedAt.$lte = new Date(String(to))
    }
    const skip = (Number(page) - 1) * Number(limit)
    const [items, total] = await Promise.all([
      ExternalTransaction.find(filter)
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      ExternalTransaction.countDocuments(filter),
    ])
    res.json({ items, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    next(err)
  }
})

export default router
