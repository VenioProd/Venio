import { getTransporter } from '../transport.js'
import { emailLayout } from '../layout.js'
import { renderEmailBody } from '../send.js'

export interface SendArtoseraDevisEmailInput {
  /** Adresse de la galerie, déjà validée par la couche de validation. */
  to: string
  subject: string
  /** Corps en texte brut ; chaque ligne devient un paragraphe côté HTML. */
  body: string
  filename: string
  pdf: Buffer
  /** Référence d'archive, jointe pour retrouver la trace disque depuis l'e-mail. */
  reference: string
}

export interface ArtoseraDevisEmailResult {
  sent: boolean
  messageId?: string
  error?: string
}

/** Adresse mise en copie de chaque devis envoyé. Surchargeable par l'environnement. */
export function artoseraDevisBcc(): string[] {
  const raw = process.env.ARTOSERA_DEVIS_BCC ?? 'contact@venio.paris'
  return raw
    .split(',')
    .map((address) => address.trim().toLowerCase())
    .filter((address) => address !== '')
}

/**
 * Envoie le devis Artosera à la galerie, PDF en pièce jointe, avec Venio en
 * copie cachée. Le sujet et le corps viennent de la page commerciale : ils
 * sont repris tels quels, la validation en amont ayant déjà retiré ce qui
 * pourrait servir à forger des en-têtes.
 */
export async function sendArtoseraDevisEmail(input: SendArtoseraDevisEmailInput): Promise<ArtoseraDevisEmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'contact@venio.paris'
  const bcc = artoseraDevisBcc()

  const html = emailLayout({
    title: input.subject,
    preheader: 'Votre devis Artosera est en pièce jointe.',
    body: renderEmailBody(input.body),
  })

  try {
    const info = await transporter.sendMail({
      from: `"Venio — Artosera" <${from}>`,
      to: input.to,
      bcc: bcc.length > 0 ? bcc : undefined,
      replyTo: from,
      subject: input.subject,
      text: input.body,
      html,
      headers: { 'X-Artosera-Devis': input.reference },
      attachments: [{ filename: input.filename, content: input.pdf, contentType: 'application/pdf' }],
    })
    return { sent: true, messageId: typeof info?.messageId === 'string' ? info.messageId : undefined }
  } catch (err) {
    return { sent: false, error: (err as Error)?.message || String(err) }
  }
}
