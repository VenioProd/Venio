import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { applyUnsubscribe, verifyUnsubscribeToken } from '../../lib/crmPrivacy.js'
import { buildActorFromReq, recordAudit } from '../../lib/audit/auditHelpers.js'
import { escapeHtml } from '../../lib/email/transport.js'
import logger from '../../lib/logger.js'

/** GET confirme l'intention ; POST applique l'opposition, y compris en un clic (RFC 8058). */
const router = express.Router()

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
})

function page(title: string, message: string, token?: string): string {
  const appName = escapeHtml(process.env.APP_NAME || 'Venio')
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)} — ${appName}</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:48px 16px;">
  <main style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;margin:0 0 12px;">${escapeHtml(title)}</h1>
    <p style="line-height:1.5;margin:0;">${escapeHtml(message)}</p>
    ${token ? `<form method="post" action="?token=${escapeHtml(encodeURIComponent(token))}"><input type="hidden" name="confirm" value="1"><button type="submit">Confirmer la désinscription</button></form>` : ''}
    <p style="font-size:13px;color:#64748b;margin:24px 0 0;">${appName}</p>
  </main>
</body>
</html>`
}

async function handle(req: Request): Promise<{ status: number; title: string; message: string }> {
  const check = verifyUnsubscribeToken(req.query.token)
  if (!check.ok) {
    return check.reason === 'EXPIRED'
      ? { status: 410, title: 'Lien expiré', message: 'Ce lien de désinscription a expiré. Répondez simplement à notre dernier message pour ne plus être contacté.' }
      : { status: 400, title: 'Lien invalide', message: 'Ce lien de désinscription n’est pas valide.' }
  }
  if (req.method === 'GET') return { status: 200, title: 'Confirmer la désinscription', message: 'Souhaitez-vous ne plus recevoir nos e-mails de prospection ?' }
  const result = await applyUnsubscribe(check.leadId, check.email)
  if (!result.alreadySuppressed) {
    await recordAudit({
      action: 'CRM_LEAD_UNSUBSCRIBE',
      actor: buildActorFromReq(req),
      entityType: 'Lead',
      entityId: check.leadId,
      summary: 'Désinscription des e-mails de prospection (lien signé)',
      extra: { leadFound: result.leadFound },
    })
  }
  return {
    status: 200,
    title: 'Désinscription confirmée',
    message: 'Votre adresse ne recevra plus nos e-mails de prospection. Aucune autre action n’est nécessaire.',
  }
}

router.get('/', limiter, async (req: Request, res: Response) => {
  try {
    const out = await handle(req)
    res.status(out.status).type('html').send(page(out.title, out.message, out.status === 200 ? String(req.query.token) : undefined))
  } catch (err) {
    logger.error({ err }, '[unsubscribe] échec')
    res.status(503).type('html').send(page('Service indisponible', 'La désinscription n’a pas pu être enregistrée. Réessayez dans quelques minutes.'))
  }
})

// Désinscription en un clic (en-tête List-Unsubscribe-Post) : même effet, réponse sans page.
router.post('/', limiter, express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
  try {
    const out = await handle(req)
    if (req.body?.confirm !== '1') res.status(out.status).json({ ok: out.status === 200 })
    else res.status(out.status).type('html').send(page(out.title, out.message))
  } catch (err) {
    logger.error({ err }, '[unsubscribe] échec')
    res.status(503).json({ ok: false })
  }
})

export default router
