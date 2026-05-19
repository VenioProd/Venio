import express, { Request, Response, NextFunction } from 'express'
import { body, validationResult } from 'express-validator'
import auth from '../../middleware/auth.js'
import { requireAdmin } from '../../middleware/role.js'
import { requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import User from '../../models/User.js'
import { getTransporter } from '../../lib/email/transport.js'
import { emailLayout } from '../../lib/email/layout.js'
import { escapeHtml } from '../../lib/email/transport.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

// GET /api/admin/email-composer/recipients — liste des destinataires disponibles
router.get('/recipients', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [admins, clients] = await Promise.all([
      User.find({ role: { $in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RH', 'COMMERCIAL', 'COMPTABLE', 'VIEWER', 'STAGIAIRE'] }, isActive: { $ne: false } })
        .select('name email role tags').sort({ name: 1 }),
      User.find({ role: 'CLIENT', isActive: { $ne: false } })
        .select('name email companyName').sort({ name: 1 }),
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
  body('subject').trim().notEmpty().withMessage('L\'objet est requis'),
  body('body').trim().notEmpty().withMessage('Le corps du message est requis'),
  body('recipients').isArray({ min: 1 }).withMessage('Au moins un destinataire est requis'),
  body('recipients.*').isEmail().withMessage('Adresse email invalide'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg, errors: errors.array() })
      }

      const transporter = getTransporter()
      if (!transporter) {
        return res.status(503).json({ error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' })
      }

      const { subject, body: messageBody, recipients, ctaUrl, ctaLabel } = req.body as {
        subject: string
        body: string
        recipients: string[]
        ctaUrl?: string
        ctaLabel?: string
      }

      const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'contact@venio.paris'
      const appName = process.env.APP_NAME || 'Venio'
      const senderName = (req.user as any).name || 'L\'équipe Venio'

      // Dédupliquer
      const uniqueRecipients = [...new Set(recipients.map((e: string) => e.toLowerCase().trim()))]

      const bodyHtml = messageBody
        .split('\n')
        .map((line: string) => line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br>')
        .join('')

      const html = emailLayout({
        title: escapeHtml(subject),
        body: bodyHtml,
        ctaUrl: ctaUrl || undefined,
        ctaLabel: ctaLabel || undefined,
      })

      const plainText = `${messageBody}\n\n— ${senderName}, ${appName}`

      const results: { email: string; success: boolean; error?: string }[] = []

      for (const email of uniqueRecipients) {
        try {
          await transporter.sendMail({
            from: `"${appName}" <${from}>`,
            to: email,
            subject: `[${appName}] ${subject}`,
            text: plainText,
            html,
          })
          results.push({ email, success: true })
        } catch (err) {
          results.push({ email, success: false, error: (err as Error).message || String(err) })
        }
      }

      const sent = results.filter(r => r.success).length
      const failed = results.filter(r => !r.success).length

      return res.json({ sent, failed, total: uniqueRecipients.length, results })
    } catch (err) {
      return next(err)
    }
  }
)

export default router
