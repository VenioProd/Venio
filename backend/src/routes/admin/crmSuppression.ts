import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { administersCrm } from '../../lib/crmScope.js'
import { addSuppression, normalizeEmail } from '../../lib/crmPrivacy.js'
import { buildActorFromReq, recordAudit } from '../../lib/audit/auditHelpers.js'
import SuppressionEntry from '../../models/SuppressionEntry.js'
import CrmSettings from '../../models/CrmSettings.js'
import { normalizePhone } from '../../lib/callImports.js'
import { addPhoneSuppression } from '../../lib/callGuards.js'

/**
 * Liste « ne pas contacter » du CRM (chantier 4B) : consultation, ajout manuel
 * et retrait. Montée sous /api/admin/crm/suppression.
 *
 * - Lecture : `view_crm` (tout le monde voit la liste, en lecture seule).
 * - Ajout et retrait : `manage_crm` ET `administersCrm` (super-admin, administrateur).
 *   Chaque geste est tracé dans le journal d'audit.
 * - Retirer une adresse ou un numéro ne touche JAMAIS à `doNotContact` / `doNotCall` des leads :
 *   l'opposition posée sur une fiche reste en vigueur.
 * - Les numéros (E.164, normalisés avec la région d'appel des réglages) se gèrent comme les
 *   adresses : `?kind=phone` pour les lister, `{ phone }` pour en ajouter.
 * - Retirer une entrée expose à rappeler ou écrire à quelqu'un qui l'a refusé : le serveur exige
 *   `{ confirm: true }` dans le corps, en plus du droit d'administrer le CRM, et trace le geste.
 */
const router = express.Router()

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
/** Raisons qu'un humain peut poser ; UNSUBSCRIBE et ANONYMIZED sont réservées au système. */
const MANUAL_REASONS = ['MANUAL', 'OPPOSITION'] as const
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function positiveInt(raw: unknown, fallback: number, max: number): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback
}

const requireAdministersCrm = (req: Request, res: Response, next: NextFunction) =>
  administersCrm(req)
    ? next()
    : res.status(403).json({ error: 'Réservé aux administrateurs du CRM', code: 'CRM_ADMIN_ONLY' })

router.get(
  '/',
  auth,
  requireAdmin,
  requirePermission(PERMISSIONS.VIEW_CRM),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = positiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT)
      const kind = req.query.kind === 'phone' ? 'phone' : 'email'
      const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 320) : ''
      let filter: Record<string, unknown>
      if (kind === 'phone') {
        const { callDefaultRegion } = await CrmSettings.getSettings()
        const exact = q ? normalizePhone(q, callDefaultRegion) : null
        const digits = q.replace(/\D/g, '').replace(/^0+/, '')
        filter = {
          phoneNormalized: exact ? exact : digits ? { $regex: escapeRegex(digits) } : { $type: 'string' },
        }
      } else {
        const email = normalizeEmail(q)
        filter = { emailNormalized: email ? { $regex: escapeRegex(email) } : { $type: 'string' } }
      }
      const total = await SuppressionEntry.countDocuments(filter)
      const pages = Math.max(1, Math.ceil(total / limit))
      const page = Math.min(positiveInt(req.query.page, 1, Number.MAX_SAFE_INTEGER), pages)
      const rows = await SuppressionEntry.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('createdBy', 'name')
        .lean()
      const entries = rows.map((row) => {
        const author = row.createdBy as unknown as { _id: unknown; name?: string } | null
        return {
          id: String(row._id),
          kind,
          email: row.emailNormalized,
          phone: row.phoneNormalized,
          reason: row.reason,
          createdAt: row.createdAt,
          createdBy: author && author.name !== undefined ? { id: String(author._id), name: author.name } : null,
          leadId: row.leadId ? String(row.leadId) : null,
        }
      })
      return res.json({ entries, total, page, limit, pages, canAdminister: administersCrm(req) })
    } catch (err) {
      return next(err)
    }
  },
)

router.post(
  '/',
  auth,
  requireAdmin,
  requirePermission(PERMISSIONS.MANAGE_CRM),
  requireAdministersCrm,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reason = req.body?.reason === undefined ? 'MANUAL' : req.body.reason
      if (!(MANUAL_REASONS as readonly unknown[]).includes(reason)) {
        return res.status(400).json({ error: 'Raison invalide', code: 'INVALID_REASON' })
      }
      if (req.body?.phone !== undefined) {
        if (req.body.email !== undefined || typeof req.body.phone !== 'string') {
          return res.status(400).json({ error: 'Un numéro ou une adresse, pas les deux', code: 'INVALID_PHONE' })
        }
        const { callDefaultRegion } = await CrmSettings.getSettings()
        const phone = normalizePhone(req.body.phone.trim(), callDefaultRegion)
        if (!phone) return res.status(400).json({ error: 'Numéro invalide', code: 'INVALID_PHONE' })
        const created = await addPhoneSuppression(phone, {
          reason,
          createdBy: req.user!.id,
          leadId: null,
          region: callDefaultRegion,
        })
        if (!created) return res.status(409).json({ error: 'Numéro déjà dans la liste', code: 'ALREADY_SUPPRESSED' })
        const entry = await SuppressionEntry.findOne({ phoneNormalized: phone }).lean()
        await recordAudit({
          action: 'CRM_SUPPRESSION_ADD',
          actor: buildActorFromReq(req),
          entityType: 'SuppressionEntry',
          entityId: String(entry?._id ?? ''),
          entityRef: phone,
          summary: 'Ajout manuel d’un numéro à la liste « ne pas contacter »',
          extra: { reason, kind: 'phone' },
        })
        return res.status(201).json({
          entry: {
            id: String(entry?._id),
            kind: 'phone',
            phone,
            reason,
            createdAt: entry?.createdAt ?? null,
            createdBy: null,
            leadId: null,
          },
        })
      }
      const email = normalizeEmail(req.body?.email)
      if (!EMAIL_PATTERN.test(email) || email.length > 320) {
        return res.status(400).json({ error: 'Adresse e-mail invalide', code: 'INVALID_EMAIL' })
      }
      const created = await addSuppression(email, { reason, createdBy: req.user!.id })
      if (!created) return res.status(409).json({ error: 'Adresse déjà dans la liste', code: 'ALREADY_SUPPRESSED' })
      const entry = await SuppressionEntry.findOne({ emailNormalized: email }).lean()
      await recordAudit({
        action: 'CRM_SUPPRESSION_ADD',
        actor: buildActorFromReq(req),
        entityType: 'SuppressionEntry',
        entityId: String(entry?._id ?? ''),
        entityRef: email,
        summary: 'Ajout manuel à la liste « ne pas contacter »',
        extra: { reason },
      })
      return res.status(201).json({
        entry: {
          id: String(entry?._id),
          kind: 'email',
          email,
          reason,
          createdAt: entry?.createdAt ?? null,
          createdBy: null,
          leadId: null,
        },
      })
    } catch (err) {
      return next(err)
    }
  },
)

router.delete(
  '/:id',
  auth,
  requireAdmin,
  requirePermission(PERMISSIONS.MANAGE_CRM),
  requireAdministersCrm,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id)
      if (!mongoose.isObjectIdOrHexString(id))
        return res.status(404).json({ error: 'Entrée introuvable', code: 'NOT_FOUND' })
      // Geste à risque (on pourrait de nouveau joindre quelqu'un qui l'a refusé) : confirmation explicite côté serveur.
      if (req.body?.confirm !== true) {
        return res.status(400).json({ error: 'Confirmation explicite requise', code: 'CONFIRMATION_REQUIRED' })
      }
      const removed = await SuppressionEntry.findByIdAndDelete(id).lean()
      if (!removed) return res.status(404).json({ error: 'Entrée introuvable', code: 'NOT_FOUND' })
      await recordAudit({
        action: 'CRM_SUPPRESSION_REMOVE',
        actor: buildActorFromReq(req),
        entityType: 'SuppressionEntry',
        entityId: String(removed._id),
        entityRef: removed.emailNormalized ?? removed.phoneNormalized,
        summary: 'Retrait de la liste « ne pas contacter »',
        extra: {
          reason: removed.reason,
          kind: removed.phoneNormalized ? 'phone' : 'email',
          listedSince: removed.createdAt,
          confirmed: true,
        },
      })
      return res.json({ ok: true })
    } catch (err) {
      return next(err)
    }
  },
)

export default router
