import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import logger from '../../lib/logger.js'
import { archiveArtoseraDevis, validateArtoseraDevis, type ArtoseraDevisRejection } from '../../lib/artosera/devis.js'
import { sendArtoseraDevisEmail } from '../../lib/email.js'
import { ARTOSERA_SITE_RECIPIENT, artoseraSiteCors, isArtoseraSiteOrigin } from '../../lib/artosera/origin.js'
import { bodyLang, type SiteSelectionLang } from '../../lib/artosera/siteSelection.js'
import { parseComposerResponses, strictDisplayName } from '../../lib/artosera/composerCatalog.js'
import { reserveProspectEmail } from '../../lib/artosera/prospectQuota.js'
import { sendArtoseraProspectEmail } from '../../lib/email/templates/artoseraProspect.js'

const router = express.Router()

/**
 * Chaque erreur porte un `code` stable (à traduire côté navigateur) et un
 * message `error`. Le message suit la langue du corps (`lang`, `selection.lang`
 * ou `recap.lang`) dès qu'il a été lu ; les refus émis avant lecture du corps
 * (413, 429) sont en français.
 */
type ErrorCode =
  | ArtoseraDevisRejection
  | 'malformed_json'
  | 'payload_too_large'
  | 'rate_limited'
  | 'archive_unavailable'
  | 'send_failed'

const ERROR_MESSAGES: Record<ErrorCode, Record<SiteSelectionLang, string>> = {
  invalid_body: { fr: 'Requête invalide.', en: 'Invalid request.' },
  invalid_recipient: {
    fr: 'Adresse e-mail du destinataire invalide.',
    en: 'Invalid recipient email address.',
  },
  invalid_subject: { fr: 'Objet du message manquant ou invalide.', en: 'Missing or invalid subject.' },
  invalid_text: { fr: 'Contenu du message manquant ou invalide.', en: 'Missing or invalid message content.' },
  missing_pdf: { fr: 'Le PDF du devis est absent.', en: 'The PDF is missing.' },
  invalid_pdf: { fr: 'Le PDF du devis est illisible.', en: 'The PDF could not be read.' },
  pdf_too_large: {
    fr: 'Le PDF du devis dépasse la taille maximale acceptée.',
    en: 'The PDF exceeds the maximum accepted size.',
  },
  devis_too_large: {
    fr: 'Le détail du devis dépasse la taille maximale acceptée.',
    en: 'The details exceed the maximum accepted size.',
  },
  invalid_selection: { fr: 'La sélection est vide ou illisible.', en: 'The selection is empty or unreadable.' },
  malformed_json: {
    fr: 'Le corps de la requête doit être un JSON valide.',
    en: 'The request body must be valid JSON.',
  },
  payload_too_large: {
    fr: 'Le devis dépasse la taille maximale acceptée.',
    en: 'The request exceeds the maximum accepted size.',
  },
  rate_limited: {
    fr: 'Trop d’envois successifs. Réessayez dans quelques minutes.',
    en: 'Too many submissions. Please try again in a few minutes.',
  },
  archive_unavailable: {
    fr: 'L’envoi est momentanément indisponible. Réessayez dans un instant.',
    en: 'Sending is temporarily unavailable. Please try again in a moment.',
  },
  send_failed: {
    fr: 'L’envoi de l’e-mail a échoué. Réessayez dans un instant.',
    en: 'The email could not be sent. Please try again in a moment.',
  },
}

function errorBody(code: ErrorCode, lang: SiteSelectionLang = 'fr') {
  return { ok: false, code, error: ERROR_MESSAGES[code][lang] }
}

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
      res.status(413).json(errorBody('payload_too_large'))
      return
    }
    if (err.type === 'entity.parse.failed' || err.status === 400 || err.statusCode === 400) {
      res.status(400).json(errorBody('malformed_json'))
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
  message: errorBody('rate_limited'),
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
  message: errorBody('rate_limited'),
})

/**
 * Récapitulatif au prospect (origine artosera.com uniquement), après le mail
 * interne. Jamais bloquant : quelle qu'en soit l'issue, la réponse reste 200.
 * Sauté sans bruit si l'adresse est absente, si aucune réponse ne passe la
 * liste blanche, ou si cette adresse a déjà reçu un récapitulatif sous 24 h.
 */
async function sendProspectSummary(
  body: Record<string, unknown>,
  prospect: string | null,
  lang: SiteSelectionLang,
  reference: string,
): Promise<string> {
  if (!prospect) return 'no_address'
  const responses = parseComposerResponses(body.devis)
  if (!responses.modules.length && !responses.services.length) return 'no_whitelisted_response'
  if (!reserveProspectEmail(prospect)) return 'recipient_quota'
  const result = await sendArtoseraProspectEmail(
    {
      to: prospect,
      lang,
      responses,
      galerie: strictDisplayName(body.galerie),
      interlocuteur: strictDisplayName(body.interlocuteur),
    },
    ARTOSERA_SITE_RECIPIENT,
  )
  if (!result.sent) logger.error({ reference, error: result.error }, 'Artosera prospect summary failed')
  return result.sent ? 'sent' : 'failed'
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
  const lang = bodyLang(req.body)

  // Pot de miel : `website` est un champ caché de la page, qu'un humain laisse
  // vide. Rempli, on répond comme un succès pour ne rien apprendre au robot,
  // sans rien archiver ni envoyer.
  if (origin && req.body && typeof req.body === 'object') {
    const website = (req.body as Record<string, unknown>).website
    if (website !== undefined && website !== null && website !== '') {
      logger.warn({ ip: req.ip, origin }, 'Artosera devis honeypot filled')
      return res.status(200).json({ ok: true })
    }
  }

  const validation = validateArtoseraDevis(req.body, origin ? { forcedRecipient: ARTOSERA_SITE_RECIPIENT } : {})
  if (!validation.ok) {
    logger.warn({ reason: validation.reason, ip: req.ip, origin }, 'Artosera devis rejected')
    return res.status(400).json(errorBody(validation.reason, lang))
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
    return res.status(503).json(errorBody('archive_unavailable', lang))
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
    return res.status(502).json(errorBody('send_failed', lang))
  }

  const prospect = origin
    ? await sendProspectSummary(req.body as Record<string, unknown>, submission.replyTo, lang, archive.reference)
    : null

  logger.info(
    {
      reference: archive.reference,
      to: submission.to,
      origin,
      prospect,
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
