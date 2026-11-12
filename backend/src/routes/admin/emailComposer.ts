import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import { requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import { buildUnsubscribeUrl, normalizeEmail, prospectContacts } from '../../lib/crmPrivacy.js'
import User from '../../models/User.js'
import { sendBulkEmail, EmailTransportUnavailableError } from '../../lib/email/send.js'
import { logBlockedRecipients, screenBulkRecipients } from '../../lib/crmBulkEmailGuard.js'

const router = express.Router()

/** Envoi groupé libre : réservé à la direction et aux RH (pas aux lecteurs, comptables, stagiaires…). */
export const EMAIL_COMPOSER_SEND_ROLES = ['SUPER_ADMIN', 'ADMIN', 'RH'] as const
function requireComposerSender(req: Request, res: Response, next: NextFunction): void {
  const role = (req as Request & { user?: { role?: string } }).user?.role
  if (role && (EMAIL_COMPOSER_SEND_ROLES as readonly string[]).includes(role)) return next()
  res.status(403).json({ error: 'Envoi groupé réservé aux administrateurs et aux RH' })
}
router.use(auth)
router.use(requireAdmin)

// GET /api/admin/email-composer/recipients — liste des destinataires disponibles
router.get('/recipients', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [admins, clients] = await Promise.all([
      User.find({
        role: { $in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RH', 'COMMERCIAL', 'COMPTABLE', 'VIEWER', 'STAGIAIRE'] },
        isActive: { $ne: false },
      })
        .select('name email role tags')
        .sort({ name: 1 }),
      User.find({ role: 'CLIENT', isActive: { $ne: false } })
        .select('name email companyName')
        .sort({ name: 1 }),
    ])
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'contact@venio.paris'
    return res.json({ admins, clients, fromEmail })
  } catch (err) {
    return next(err)
  }
})

// POST /api/admin/email-composer/send — envoi groupé
router.post(
  '/send',
  requireAdmin,
  requireComposerSender,
  body('subject').trim().notEmpty().withMessage("L'objet est requis"),
  body('body').trim().notEmpty().withMessage('Le corps du message est requis'),
  body('recipients').isArray({ min: 1, max: 500 }).withMessage('Entre 1 et 500 destinataires sont requis'),
  body('recipients.*').isEmail().withMessage('Adresse email invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const {
        subject,
        body: messageBody,
        recipients,
        ctaUrl,
        ctaLabel,
      } = req.body as {
        subject: string
        body: string
        recipients: string[]
        ctaUrl?: string
        ctaLabel?: string
      }

      // RGPD : chaque adresse est contrôlée (liste de suppression, opposition
      // d'un lead). Les adresses bloquées sont retirées et rendues dans
      // `blocked` ; l'envoi continue pour les autres.
      const screening = await screenBulkRecipients(recipients)
      await logBlockedRecipients(screening, req.user!.id ?? null, { channel: 'email_composer' })
      const blocked = screening.blocked

      if (screening.allowed.length === 0) {
        return res.json({ sent: 0, failed: 0, total: 0, results: [], blocked })
      }

      // Chemin d'envoi partagé avec le journal des échanges (lib/email/send.ts).
      const { leads: prospects } = await prospectContacts(screening.allowed)
      const byEmail = new Map(prospects.map((lead) => [normalizeEmail(lead.contactEmail), lead._id]))
      const results = []
      for (const email of screening.allowed) {
        const leadId = byEmail.get(email)
        const outcome = await sendBulkEmail({
          subject,
          body: messageBody,
          recipients: [{ email }],
          senderName: (req.user as { name?: string }).name,
          ctaUrl,
          ctaLabel,
          ...(leadId ? { unsubscribeUrl: buildUnsubscribeUrl(leadId, email) } : {}),
        })
        results.push(...outcome.results)
      }
      const sent = results.filter((result) => result.success).length
      const total = results.length
      const failed = total - sent

      return res.json({ sent, failed, total, results, blocked })
    } catch (err) {
      if (err instanceof EmailTransportUnavailableError) {
        return res.status(503).json({ error: err.message })
      }
      return next(err)
    }
  },
)

export default router
