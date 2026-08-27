import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import { requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import User from '../../models/User.js'
import { sendBulkEmail, EmailTransportUnavailableError } from '../../lib/email/send.js'

const router = express.Router()
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
  body('subject').trim().notEmpty().withMessage("L'objet est requis"),
  body('body').trim().notEmpty().withMessage('Le corps du message est requis'),
  body('recipients').isArray({ min: 1 }).withMessage('Au moins un destinataire est requis'),
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

      // Chemin d'envoi partagé avec le journal des échanges (lib/email/send.ts).
      const { results, sent, failed, total } = await sendBulkEmail({
        subject,
        body: messageBody,
        recipients: recipients.map((email: string) => ({ email })),
        senderName: (req.user as { name?: string }).name,
        ctaUrl,
        ctaLabel,
      })

      return res.json({ sent, failed, total, results })
    } catch (err) {
      if (err instanceof EmailTransportUnavailableError) {
        return res.status(503).json({ error: err.message })
      }
      return next(err)
    }
  },
)

export default router
