import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import Lead from '../../models/Lead.js'
import { logLeadActivity } from '../../lib/crmAutomations.js'
import { sendContactReceiptEmail } from '../../lib/email.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'
import logger from '../../lib/logger.js'
import { validateContactSubmission } from '../../lib/publicContact.js'

const router = express.Router()

const acceptedResponse = {
  ok: true,
  message: 'Merci, votre message a bien été reçu. Nous vous répondrons sous 48 h ouvrées.',
}

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Merci de patienter quelques minutes avant de réessayer.' },
})

router.post('/', contactLimiter, async (req: Request, res: Response) => {
  const result = validateContactSubmission(req.body)
  if (!result.ok) {
    // A honeypot is intentionally acknowledged like a real request: it gives
    // automated senders no signal while avoiding any CRM data collection.
    if (result.reason === 'honeypot') return res.status(202).json(acceptedResponse)

    return res.status(400).json({ ok: false, message: 'Votre demande ne peut pas être envoyée. Vérifiez les champs.' })
  }

  const { submission } = result
  const now = new Date()
  const contactName = `${submission.firstName} ${submission.lastName}`

  try {
    let lead = await Lead.findOne({ contactEmail: submission.email }).sort({ updatedAt: -1 })
    const isNewLead = !lead

    if (!lead) {
      lead = await Lead.create({
        company: submission.company || 'Particulier',
        contactName,
        contactEmail: submission.email,
        source: 'FORMULAIRE_SITE',
        status: 'LEAD',
        serviceType: submission.subject,
        lastContactAt: now,
        statusChangedAt: now,
        createdBy: null,
      })
    } else {
      lead.contactName = contactName
      if (submission.company) lead.company = submission.company
      lead.serviceType = submission.subject
      lead.lastContactAt = now
      await lead.save()
    }

    await logLeadActivity(
      lead._id,
      'CONTACT_FORM_SUBMITTED',
      isNewLead ? 'Nouveau contact reçu depuis le site' : 'Nouveau message reçu depuis le site',
      {
        source: 'FORMULAIRE_SITE',
        subject: submission.subject,
        message: submission.message,
        consent: true,
      },
    )

    void notifySuperAdmins({
      type: 'CRM_LEAD_CREATED',
      title: isNewLead ? 'Nouveau contact site' : 'Nouveau message de contact',
      message: 'Un contact est disponible dans le CRM.',
      link: '/admin/crm',
      metadata: { leadId: String(lead._id), source: 'FORMULAIRE_SITE' },
    })

    void sendContactReceiptEmail({ to: submission.email, firstName: submission.firstName }).then((emailResult) => {
      if (!emailResult.sent) logger.info('Contact receipt email was not sent')
    })

    return res.status(202).json(acceptedResponse)
  } catch (err) {
    logger.error({ err }, 'Unable to store public contact request')
    return res.status(503).json({ ok: false, message: 'Le formulaire est momentanément indisponible. Réessayez plus tard.' })
  }
})

export default router
