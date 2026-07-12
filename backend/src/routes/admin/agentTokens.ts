import express, { type Request, type Response, type NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import mongoose from 'mongoose'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import auth from '../../middleware/auth.js'
import { requireSuperAdmin } from '../../middleware/role.js'
import AgentToken from '../../models/AgentToken.js'
import AuditLog from '../../models/AuditLog.js'
import User from '../../models/User.js'
import { AGENT_SCOPES, findUnknownScopes, ADMIN_WILDCARD_SCOPE } from '../../lib/agent/scopes.js'
import { generateAgentToken } from '../../lib/agent/tokens.js'
import { recordAudit, buildActorFromReq } from '../../lib/audit/auditHelpers.js'
import { ensureGeneralChannel } from '../../services/internalMessaging.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'
import logger from '../../lib/logger.js'
import { sensitiveAction } from '../../lib/security/sensitiveActions.js'

/**
 * Routes admin pour la gestion des tokens d'API agent (Personal Access Tokens).
 *
 * Auth : JWT SUPER_ADMIN uniquement (middleware auth + requireSuperAdmin).
 * Les ADMIN/RH/VIEWER reçoivent 403. Le createdBy garde trace de l'admin
 * émetteur.
 *
 * Endpoints :
 *   GET    /api/admin/agent-tokens             → liste (sans secrets)
 *   GET    /api/admin/agent-tokens/scopes      → catalogue des scopes
 *   POST   /api/admin/agent-tokens             → crée un token, renvoie le
 *                                                secret en clair UNE SEULE FOIS
 *   GET    /api/admin/agent-tokens/:id         → détail
 *   PATCH  /api/admin/agent-tokens/:id         → renomme, change scopes /
 *                                                rateLimit / expiresAt / notes
 *   POST   /api/admin/agent-tokens/:id/revoke  → status=REVOKED
 *
 * Pas de suppression dure : la révocation suffit (immutable pour audit log).
 */
const router = express.Router()

router.use(auth)
router.use(requireSuperAdmin)

// ──────────────────────────────────────────────────────────────────────────
// GET /scopes — catalogue figé (utilisé par l'UI pour le multi-select)
// ──────────────────────────────────────────────────────────────────────────

router.get('/scopes', (_req: Request, res: Response) => {
  res.json({ scopes: AGENT_SCOPES, adminWildcard: ADMIN_WILDCARD_SCOPE })
})

// ──────────────────────────────────────────────────────────────────────────
// GET /:id/auth-log — journal de connexion / auth du token
// ──────────────────────────────────────────────────────────────────────────

router.get(
  '/:id/auth-log',
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'ID invalide' })
      }

      const token = await AgentToken.findById(req.params.id).select('_id prefix name').lean()
      if (!token) {
        return res.status(404).json({ error: 'Token introuvable' })
      }

      const limitRaw = Number(req.query.limit || 50)
      const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200)
      const events = await AuditLog.find({
        action: { $in: ['AGENT_AUTH_SUCCESS', 'AGENT_AUTH_FAIL'] },
        'metadata.tokenId': String(token._id),
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('action ip userAgent metadata createdAt')
        .lean()

      return res.json({ token, events })
    } catch (err) {
      return next(err)
    }
  },
)

// ──────────────────────────────────────────────────────────────────────────
// GET / — liste
// ──────────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filter: Record<string, unknown> = {}
    const status = req.query.status
    if (status === 'ACTIVE' || status === 'REVOKED') {
      filter.status = status
    }
    const tokens = await AgentToken.find(filter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'email name')
      .populate('revokedBy', 'email name')
      .lean()
    res.json({ tokens })
  } catch (err) {
    next(err)
  }
})

// ──────────────────────────────────────────────────────────────────────────
// POST / — crée un nouveau token
//   renvoie { token: {...}, plainSecret: "vno_pat_..." } UNE SEULE FOIS
// ──────────────────────────────────────────────────────────────────────────

router.post(
  '/',
  sensitiveAction('AGENT_TOKEN_CREATE'),
  body('name').isString().trim().isLength({ min: 1, max: 120 }).withMessage('Nom requis (max 120 chars)'),
  body('scopes').isArray({ min: 1 }).withMessage('Au moins un scope est requis'),
  body('rateLimitPerMin').optional().isInt({ min: 1, max: 10000 }).withMessage('rateLimitPerMin entre 1 et 10000'),
  body('expiresAt').optional({ nullable: true }).isISO8601().withMessage('expiresAt doit être au format ISO 8601'),
  body('notes').optional().isString().isLength({ max: 1000 }).withMessage('notes max 1000 chars'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const { name, scopes, rateLimitPerMin, expiresAt, notes } = req.body || {}

      // Valider les scopes contre le catalogue
      const unknown = findUnknownScopes(scopes)
      if (unknown.length > 0) {
        return res.status(400).json({
          error: `Scope(s) inconnu(s) : ${unknown.join(', ')}`,
          unknownScopes: unknown,
        })
      }

      // Générer le secret côté serveur
      const generated = await generateAgentToken()

      // Génère un email unique non-routable pour le User AGENT
      const agentEmail = `agent-${new mongoose.Types.ObjectId().toString()}@venio.internal`

      // Création du User AGENT en premier (pas d'agentTokenId encore — chicken-and-egg)
      const agentUser = await User.create({
        email: agentEmail,
        passwordHash: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10),
        name: String(name).trim(),
        role: 'AGENT',
        isActive: true,
      })

      let token
      try {
        token = await AgentToken.create({
          name: String(name).trim(),
          prefix: generated.prefix,
          tokenHash: generated.hash,
          userId: agentUser._id,
          scopes,
          rateLimitPerMin: rateLimitPerMin || 120,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          notes: notes || '',
          createdBy: req.user!.id,
        })
      } catch (err) {
        await User.deleteOne({ _id: agentUser._id }).catch((e) =>
          logger.warn({ data: (e as Error).message }, '[agent-token-create] rollback failed:'),
        )
        return next(err)
      }

      // Patch le User pour relier l'agentTokenId (résout le chicken-and-egg)
      agentUser.agentTokenId = token._id as mongoose.Types.ObjectId
      await agentUser.save()

      // Ajoute l'agent au channel #general
      try {
        await ensureGeneralChannel({
          id: String(agentUser._id),
          name: agentUser.name,
          email: agentUser.email,
          role: 'AGENT',
        })
      } catch (err) {
        logger.warn({ data: (err as Error).message }, '[agent-token-create] ensureGeneralChannel failed:')
      }

      void recordAudit({
        action: 'AGENT_TOKEN_CREATE',
        actor: buildActorFromReq(req),
        entityType: 'AgentToken',
        entityId: String(token._id),
        entityRef: token.prefix,
        summary: `Création du token agent "${token.name}"`,
        after: { name: token.name, scopes: token.scopes, prefix: token.prefix },
      })

      // Renvoyer le token sans le hash mais AVEC le plainSecret (une seule fois)
      const tokenSafe = await AgentToken.findById(token._id).populate('createdBy', 'email name').lean()

      // Notif sécurité aux super admins
      notifySuperAdmins({
        type: 'AGENT_TOKEN_CREATED',
        title: `🤖 Nouveau token agent créé`,
        message: `"${token.name}" (scopes : ${(scopes as string[]).slice(0, 3).join(', ')}${scopes.length > 3 ? '...' : ''})`,
        link: '/admin/agents',
        metadata: { tokenId: String(token._id), prefix: token.prefix },
        excludeUserId: req.user!.id,
      }).catch(() => {})

      return res.status(201).json({
        token: tokenSafe,
        plainSecret: generated.plain,
        warning: 'Ce secret ne sera plus jamais affiché. Copiez-le maintenant.',
      })
    } catch (err) {
      return next(err)
    }
  },
)

// ──────────────────────────────────────────────────────────────────────────
// GET /:id — détail
// ──────────────────────────────────────────────────────────────────────────

router.get(
  '/:id',
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'ID invalide' })
      }
      const token = await AgentToken.findById(req.params.id)
        .populate('createdBy', 'email name')
        .populate('revokedBy', 'email name')
        .lean()
      if (!token) {
        return res.status(404).json({ error: 'Token introuvable' })
      }
      return res.json({ token })
    } catch (err) {
      return next(err)
    }
  },
)

// ──────────────────────────────────────────────────────────────────────────
// PATCH /:id — modifie (name, scopes, rateLimit, expiresAt, notes)
// ──────────────────────────────────────────────────────────────────────────

router.patch(
  '/:id',
  sensitiveAction('AGENT_TOKEN_UPDATE'),
  param('id').isMongoId().withMessage('ID invalide'),
  body('name').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('scopes').optional().isArray({ min: 1 }),
  body('rateLimitPerMin').optional().isInt({ min: 1, max: 10000 }),
  body('expiresAt')
    .optional({ nullable: true })
    .custom((v) => v === null || !Number.isNaN(Date.parse(v)))
    .withMessage('Date invalide'),
  body('notes').optional().isString().isLength({ max: 1000 }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const token = await AgentToken.findById(req.params.id)
      if (!token) {
        return res.status(404).json({ error: 'Token introuvable' })
      }
      if (token.status !== 'ACTIVE') {
        return res.status(409).json({ error: 'Token révoqué — non modifiable' })
      }

      const before = {
        name: token.name,
        scopes: [...token.scopes],
        rateLimitPerMin: token.rateLimitPerMin,
        expiresAt: token.expiresAt,
        notes: token.notes,
      }

      if (typeof req.body.name === 'string') {
        token.name = req.body.name.trim()
      }
      if (Array.isArray(req.body.scopes)) {
        const unknown = findUnknownScopes(req.body.scopes)
        if (unknown.length > 0) {
          return res.status(400).json({
            error: `Scope(s) inconnu(s) : ${unknown.join(', ')}`,
            unknownScopes: unknown,
          })
        }
        token.scopes = req.body.scopes
      }
      if (typeof req.body.rateLimitPerMin === 'number') {
        token.rateLimitPerMin = req.body.rateLimitPerMin
      }
      if (req.body.expiresAt !== undefined) {
        token.expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null
      }
      if (typeof req.body.notes === 'string') {
        token.notes = req.body.notes
      }

      await token.save()

      // Propage le rename au User AGENT lié, s'il y a eu un changement de nom.
      if (typeof req.body.name === 'string' && token.userId) {
        await User.updateOne({ _id: token.userId }, { $set: { name: token.name } }).catch((err) =>
          logger.warn({ data: (err as Error).message }, '[agent-token-patch] user rename failed:'),
        )
      }

      void recordAudit({
        action: 'AGENT_TOKEN_UPDATE',
        actor: buildActorFromReq(req),
        entityType: 'AgentToken',
        entityId: String(token._id),
        entityRef: token.prefix,
        summary: `Modification du token agent "${token.name}"`,
        before,
        after: {
          name: token.name,
          scopes: token.scopes,
          rateLimitPerMin: token.rateLimitPerMin,
          expiresAt: token.expiresAt,
          notes: token.notes,
        },
      })

      const safe = await AgentToken.findById(token._id).populate('createdBy', 'email name').lean()
      return res.json({ token: safe })
    } catch (err) {
      return next(err)
    }
  },
)

// ──────────────────────────────────────────────────────────────────────────
// POST /:id/revoke — révoque (status=REVOKED, idempotent)
// ──────────────────────────────────────────────────────────────────────────

router.post(
  '/:id/revoke',
  sensitiveAction('AGENT_TOKEN_REVOKE'),
  param('id').isMongoId().withMessage('ID invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'ID invalide' })
      }
      const token = await AgentToken.findById(req.params.id)
      if (!token) {
        return res.status(404).json({ error: 'Token introuvable' })
      }
      if (token.status === 'REVOKED') {
        // Idempotent : déjà révoqué
        const safe = await AgentToken.findById(token._id)
          .populate('createdBy', 'email name')
          .populate('revokedBy', 'email name')
          .lean()
        return res.json({ token: safe, alreadyRevoked: true })
      }

      token.status = 'REVOKED'
      token.revokedAt = new Date()
      token.revokedBy = req.user!.id as unknown as typeof token.revokedBy
      await token.save()

      // Désactive le User AGENT lié et marque son nom.
      if (token.userId) {
        await User.updateOne(
          { _id: token.userId },
          { $set: { isActive: false, name: `[Révoqué] ${token.name}` } },
        ).catch((err) => logger.warn({ data: (err as Error).message }, '[agent-token-revoke] user deactivate failed:'))
      }

      void recordAudit({
        action: 'AGENT_TOKEN_REVOKE',
        actor: buildActorFromReq(req),
        entityType: 'AgentToken',
        entityId: String(token._id),
        entityRef: token.prefix,
        summary: `Révocation du token agent "${token.name}"`,
        after: { revokedAt: token.revokedAt },
      })

      // Notif sécurité aux super admins
      notifySuperAdmins({
        type: 'AGENT_TOKEN_REVOKED',
        title: `🔒 Token agent révoqué`,
        message: `"${token.name}" (${token.prefix}) a été révoqué`,
        link: '/admin/agents',
        metadata: { tokenId: String(token._id), prefix: token.prefix },
        excludeUserId: req.user!.id,
      }).catch(() => {})

      const safe = await AgentToken.findById(token._id)
        .populate('createdBy', 'email name')
        .populate('revokedBy', 'email name')
        .lean()
      return res.json({ token: safe })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
