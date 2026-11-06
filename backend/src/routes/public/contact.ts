import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import Lead from '../../models/Lead.js'
import CrmSettings from '../../models/CrmSettings.js'
import { checkDuplicateLead, logLeadActivity } from '../../lib/crmAutomations.js'
import { normalizeEmail } from '../../lib/crmDedup.js'
import { createLead } from '../../lib/crmLeadService.js'
import { sendContactReceiptEmail } from '../../lib/email.js'
import { notifySuperAdmins } from '../../lib/notifyHelpers.js'
import logger from '../../lib/logger.js'
import { validateContactSubmission } from '../../lib/publicContact.js'
import { qualificationHeadline, qualificationLines } from '../../lib/contactQualification.js'

const router = express.Router()

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, (char) => '\\' + char)
const CLOSED_STATUSES = ['WON', 'LOST']

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
  const contactName = `${submission.firstName} ${submission.lastName}`.trim()
  const { qualification } = submission
  const qualificationText = qualification ? qualificationLines(qualification).join('\n') : ''
  // Ce que l'équipe lit dans la fiche du lead : le relevé d'abord, puis le
  // mot libre laissé par la personne.
  const readableNote = [
    qualificationText && `Relevé de qualification\n${qualificationText}`,
    submission.message && `Message : ${submission.message}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    // Comparaison normalisée (trim + minuscules), insensible à la casse des fiches existantes.
    // Le champ `contactEmailNormalized` est indexé (migration 008) ; les fiches pas encore migrées
    // (champ absent) restent trouvées par l'ancienne comparaison tolérante.
    const normalizedEmail = normalizeEmail(submission.email)
    let lead = await Lead.findOne({
      $or: [
        { contactEmailNormalized: normalizedEmail },
        {
          contactEmailNormalized: { $exists: false },
          contactEmail: { $regex: `^\\s*${escapeRegex(normalizedEmail)}\\s*$`, $options: 'i' },
        },
      ],
    }).sort({ updatedAt: -1 })
    const isNewLead = !lead

    if (!lead) {
      // Même point d'entrée que l'admin : historique, score et événements des
      // règles « LEAD_CREATED » (dont « nouveau-lead-formulaire »).
      ;({ lead } = await createLead(
        {
          company: submission.company || 'Particulier',
          contactName,
          contactEmail: normalizedEmail,
          contactPhone: submission.phone,
          source: 'FORMULAIRE_SITE',
          status: 'LEAD',
          serviceType: submission.subject,
          notes: qualification ? readableNote : '',
          lastContactAt: now,
          createdBy: null,
        },
        { actor: null, source: 'form' },
      ))
      // Même e-mail : déjà traité ci-dessus. Téléphone ou entreprise identiques : le lead est créé quand
      // même (le formulaire ne refuse jamais), et le doublon probable est consigné pour l'équipe.
      const settings = await CrmSettings.getSettings()
      if (settings.duplicateDetectionEnabled) {
        const duplicates = await checkDuplicateLead(lead, settings, lead._id)
        if (duplicates.length > 0) {
          await logLeadActivity(
            lead._id,
            'POSSIBLE_DUPLICATE',
            'Doublon possible avec un lead existant',
            { duplicateIds: duplicates.map((duplicate: { _id: unknown }) => String(duplicate._id)) },
            null,
          )
        }
      }
    } else if (!CLOSED_STATUSES.includes(lead.status)) {
      // Lead existant : aucune donnée de la fiche n'est écrasée. La nouvelle demande est
      // consignée dans l'historique (activité ci-dessous) ; seule la date de dernière
      // interaction avance, sans jamais reculer.
      await Lead.updateOne({ _id: lead._id }, { $max: { lastInteractionAt: now } })
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
        ...(qualification ? { qualification, qualificationSummary: qualificationText.split('\n') } : {}),
      },
    )

    void notifySuperAdmins({
      type: 'CRM_LEAD_CREATED',
      title: isNewLead ? 'Nouveau contact site' : 'Nouveau message de contact',
      message: qualification
        ? `Demande qualifiée : ${qualificationHeadline(qualification)}. Le relevé est dans la fiche du lead.`
        : 'Un contact est disponible dans le CRM.',
      link: '/admin/crm',
      metadata: { leadId: String(lead._id), source: 'FORMULAIRE_SITE', ...(qualification ? { qualified: true } : {}) },
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
