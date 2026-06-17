import express, { type Request, type Response, type NextFunction } from 'express'
import { body, param, validationResult } from 'express-validator'
import Subsidiary, { SUBSIDIARY_STATUSES, SUBSIDIARY_HEALTHS } from '../../models/Subsidiary.js'
import User from '../../models/User.js'
import { requireScope } from './_middleware/auth.js'
import { parsePagination, paginatedResponse } from './_middleware/pagination.js'
import { respondError } from './_middleware/errors.js'

/**
 * Routes agent pour les Filiales (business internes).
 *
 * Permet à un agent externe d'avoir tout le contexte sans rien demander :
 * consultation (liste + détail), création, mise à jour et suppression.
 *
 * Scopes :
 *   - GET   → read:subsidiaries
 *   - POST / PATCH / DELETE → write:subsidiaries
 *
 * SÉCURITÉ : les secrets du coffre ne sortent JAMAIS par l'API agent.
 * On renvoie les identifiants sans leur secret (drapeau `hasSecret`).
 * Les pièces jointes et le coffre se gèrent via l'UI / l'API admin.
 */

const router = express.Router()

// Champs éditables via l'API agent (le coffre `credentials` et `documents`
// sont volontairement exclus — gérés côté admin pour la sécurité).
const EDITABLE_FIELDS = [
  'name',
  'tagline',
  'sector',
  'status',
  'health',
  'description',
  'productDescription',
  'serviceDescription',
  'businessModel',
  'businessPlan',
  'sections',
  'links',
  'infos',
  'contacts',
  'accentColor',
  'foundedYear',
  'linkedEntity',
  'kpis',
  'objective',
  'alerts',
  'tags',
  'order',
  'archived',
] as const

function applyFields(target: Record<string, unknown>, src: Record<string, unknown>): void {
  for (const key of EDITABLE_FIELDS) {
    if (src[key] === undefined) continue
    target[key] = key === 'name' ? String(src[key]).trim() : src[key]
  }
}

function emitValidationError(req: Request, res: Response): boolean {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    respondError(res, 400, 'VALIDATION_ERROR', errors.array()[0].msg, { errors: errors.array() })
    return true
  }
  return false
}

/** Retire les secrets chiffrés ; expose seulement `hasSecret`. */
function sanitize<T extends { credentials?: unknown[] }>(s: T): T {
  const creds = (s.credentials || []).map((c) => {
    const { secretEnc, ...rest } = c as Record<string, unknown>
    return { ...rest, hasSecret: Boolean(secretEnc) }
  })
  return { ...s, credentials: creds }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'filiale'
  let candidate = root
  let i = 1
  while (await Subsidiary.findOne({ slug: candidate }).lean()) candidate = `${root}-${++i}`
  return candidate
}

// ── GET /subsidiaries — liste paginée ─────────────────────────────────────────
router.get(
  '/subsidiaries',
  requireScope('read:subsidiaries'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const pag = parsePagination(req)
      const filter: Record<string, unknown> = {}
      if (req.query.archived !== 'true') filter.archived = false
      if (typeof req.query.q === 'string' && req.query.q.trim()) {
        const rx = new RegExp(req.query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        filter.$or = [{ name: rx }, { sector: rx }, { tagline: rx }]
      }
      if (
        typeof req.query.status === 'string' &&
        (SUBSIDIARY_STATUSES as readonly string[]).includes(req.query.status)
      ) {
        filter.status = req.query.status
      }

      const [items, total] = await Promise.all([
        Subsidiary.find(filter)
          .populate('lead', 'name email')
          .populate('team', 'name email')
          .sort({ order: 1, createdAt: 1 })
          .skip(pag.skip)
          .limit(pag.limit)
          .lean(),
        Subsidiary.countDocuments(filter),
      ])
      res.json(paginatedResponse(items.map(sanitize), pag, total))
    } catch (err) {
      next(err)
    }
  },
)

// ── GET /subsidiaries/:id — détail ────────────────────────────────────────────
router.get(
  '/subsidiaries/:id',
  requireScope('read:subsidiaries'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const sub = await Subsidiary.findById(req.params.id)
        .populate('lead', 'name email')
        .populate('team', 'name email role')
        .lean()
      if (!sub) return respondError(res, 404, 'NOT_FOUND', 'Filiale introuvable')
      res.json(sanitize(sub))
    } catch (err) {
      next(err)
    }
  },
)

// ── POST /subsidiaries — créer ────────────────────────────────────────────────
router.post(
  '/subsidiaries',
  requireScope('write:subsidiaries'),
  body('name').isString().trim().isLength({ min: 1 }).withMessage('Le nom est requis'),
  body('status')
    .optional()
    .isIn(SUBSIDIARY_STATUSES as unknown as string[]),
  body('health')
    .optional()
    .isIn(SUBSIDIARY_HEALTHS as unknown as string[]),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const admin = await User.findOne({ role: 'SUPER_ADMIN' }).select('_id').lean()
      if (!admin) return respondError(res, 500, 'NO_ADMIN', 'Aucun SUPER_ADMIN trouvé pour la création')

      const doc: Record<string, unknown> = { createdBy: admin._id, slug: await uniqueSlug(req.body.name) }
      applyFields(doc, req.body || {})
      const created = await Subsidiary.create(doc)
      const lean = await Subsidiary.findById(created._id).populate('lead', 'name email').lean()

      res.locals.audit = {
        entityType: 'Subsidiary',
        entityId: String(created._id),
        entityRef: created.name,
        summary: `Création de la filiale "${created.name}"`,
        after: lean,
      }
      res.status(201).json(sanitize(lean as Record<string, unknown>))
    } catch (err) {
      next(err)
    }
  },
)

// ── PATCH /subsidiaries/:id — mettre à jour ───────────────────────────────────
router.patch(
  '/subsidiaries/:id',
  requireScope('write:subsidiaries'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const sub = await Subsidiary.findById(req.params.id)
      if (!sub) return respondError(res, 404, 'NOT_FOUND', 'Filiale introuvable')
      const before = sub.toObject()
      applyFields(sub as unknown as Record<string, unknown>, req.body || {})
      if (req.body?.name !== undefined) sub.slug = await uniqueSlug(req.body.name)
      await sub.save()
      const lean = await Subsidiary.findById(sub._id).populate('lead', 'name email').lean()

      res.locals.audit = {
        entityType: 'Subsidiary',
        entityId: String(sub._id),
        entityRef: sub.name,
        summary: `Modification de la filiale "${sub.name}"`,
        before,
        after: lean,
      }
      res.json(sanitize(lean as Record<string, unknown>))
    } catch (err) {
      next(err)
    }
  },
)

// ── DELETE /subsidiaries/:id — supprimer ──────────────────────────────────────
router.delete(
  '/subsidiaries/:id',
  requireScope('write:subsidiaries'),
  param('id').isMongoId(),
  async (req: Request, res: Response, next: NextFunction) => {
    if (emitValidationError(req, res)) return
    try {
      const sub = await Subsidiary.findById(req.params.id)
      if (!sub) return respondError(res, 404, 'NOT_FOUND', 'Filiale introuvable')
      const before = sub.toObject()
      await Subsidiary.deleteOne({ _id: sub._id })

      res.locals.audit = {
        entityType: 'Subsidiary',
        entityId: String(sub._id),
        entityRef: sub.name,
        summary: `Suppression de la filiale "${sub.name}"`,
        before,
      }
      res.json({ ok: true, deletedId: String(sub._id) })
    } catch (err) {
      next(err)
    }
  },
)

export default router
