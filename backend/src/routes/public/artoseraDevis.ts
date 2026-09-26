import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import logger from '../../lib/logger.js'
import { archiveArtoseraDevis, validateArtoseraDevis, type ArtoseraDevisRejection } from '../../lib/artosera/devis.js'
import { sendArtoseraDevisEmail } from '../../lib/email.js'
import { ARTOSERA_SITE_RECIPIENT, artoseraSiteCors, isArtoseraSiteOrigin } from '../../lib/artosera/origin.js'

const router = express.Router()

/**
 * Corps plus large que le parser global (2 MiB) : le PDF voyage en base64,
 * ce qui gonfle d'un tiers une pièce jointe déjà lourde. Ce router est donc
 * monté avant `express.json()` dans index.ts, comme l'API agent.
 */
export const ARTOSERA_JSON_BODY_LIMIT = '8mb'

const parseJson = express.json({ limit: ARTOSERA_JSON_BODY_LIMIT })

type JsonParserError = Error & { status?: number; statusCode?: number; type?: string }

function artoseraJsonBodyParser(req: Request, res: Response, next: NextFunction): void {
  parseJson(req, res, (err?: JsonParserError) => {
    if (!err) return next()
    if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
      res.status(413).json({ ok: false, error: 'Le devis dépasse la taille maximale acceptée.' })
      return
    }
    if (err.type === 'entity.parse.failed' || err.status === 400 || err.statusCode === 400) {
      res.status(400).json({ ok: false, error: 'Le corps de la requête doit être un JSON valide.' })
      return
    }
    next(err)
  })
}

/**
 * Route publique, sans authentification : le commercial l'appelle depuis la
 * page de devis. Le quota est donc la seule barrière contre un usage en
 * relais d'envoi — 10 devis par quart d'heure et par IP couvrent largement un
 * rendez-vous client.
 */
const devisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Trop d’envois successifs. Réessayez dans quelques minutes.' },
})

/**
 * Quota supplémentaire pour le site artosera.com. La page est ouverte à tout
 * internet, pas seulement au commercial en rendez-vous : chaque envoi atterrit
 * dans la boîte contact et laisse jusqu'à 5 MiB d'archive sur disque. Un
 * prospect envoie une sélection, rarement plus de deux ; 5 par heure et par IP
 * couvrent une correction ou un renvoi sans laisser inonder la boîte.
 * Il s'ajoute au quota commun ci-dessus, qui reste en vigueur.
 */
const siteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !isArtoseraSiteOrigin(req.headers.origin),
  message: { ok: false, error: 'Trop d’envois successifs. Réessayez plus tard.' },
})

const REJECTION_MESSAGES: Record<ArtoseraDevisRejection, string> = {
  invalid_body: 'Requête invalide.',
  invalid_recipient: 'Adresse e-mail du destinataire invalide.',
  invalid_subject: 'Objet du message manquant ou invalide.',
  invalid_text: 'Contenu du message manquant ou invalide.',
  missing_pdf: 'Le PDF du devis est absent.',
  invalid_pdf: 'Le PDF du devis est illisible.',
  pdf_too_large: 'Le PDF du devis dépasse la taille maximale acceptée.',
  devis_too_large: 'Le détail du devis dépasse la taille maximale acceptée.',
  invalid_selection: 'La sélection est vide ou illisible.',
}

// Préflight du site : artoseraSiteCors y répond (204). Les autres origines
// ont déjà reçu la réponse du CORS global, inchangée.
router.options('/devis', artoseraSiteCors)

// Le CORS passe avant les quotas et le parser : un 429 ou un 400 doit rester
// lisible par la page du site.
router.post('/devis', artoseraSiteCors, devisLimiter, siteLimiter, artoseraJsonBodyParser, async (req: Request, res: Response) => {
  const origin = isArtoseraSiteOrigin(req.headers.origin) ? req.headers.origin : null
  // Depuis artosera.com, le destinataire est imposé : `to` ne sert plus que
  // de Reply-To, et rien n'est envoyé à l'adresse saisie par le prospect.
  const validation = validateArtoseraDevis(req.body, origin ? { forcedRecipient: ARTOSERA_SITE_RECIPIENT } : {})
  if (!validation.ok) {
    logger.warn({ reason: validation.reason, ip: req.ip, origin }, 'Artosera devis rejected')
    return res.status(400).json({ ok: false, error: REJECTION_MESSAGES[validation.reason] })
  }

  const { submission } = validation

  let archive
  try {
    archive = await archiveArtoseraDevis(submission, {
      ip: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 300) : null,
      origin,
    })
  } catch (err) {
    // L'archive précède l'envoi : un devis parti sans trace serait pire qu'un
    // envoi refusé, que le commercial peut relancer immédiatement.
    logger.error({ err }, 'Unable to archive Artosera devis')
    return res.status(503).json({ ok: false, error: 'L’envoi est momentanément indisponible. Réessayez dans un instant.' })
  }

  const result = await sendArtoseraDevisEmail({
    to: submission.to,
    replyTo: submission.replyTo,
    subject: submission.subject,
    body: submission.body,
    filename: submission.filename,
    pdf: submission.pdf,
    reference: archive.reference,
    recap: submission.recap,
    galerie: submission.galerie,
    interlocuteur: submission.interlocuteur,
    siteSelection: submission.siteSelection,
  })

  if (!result.sent) {
    logger.error(
      { reference: archive.reference, to: submission.to, galerie: submission.galerie, error: result.error },
      'Artosera devis email failed',
    )
    return res.status(502).json({ ok: false, error: 'L’envoi de l’e-mail a échoué. Réessayez dans un instant.' })
  }

  logger.info(
    {
      reference: archive.reference,
      to: submission.to,
      origin,
      galerie: submission.galerie,
      filename: submission.filename,
      pdfBytes: submission.pdf.length,
      messageId: result.messageId,
    },
    'Artosera devis sent',
  )

  return res.status(200).json({ ok: true })
})

export default router
