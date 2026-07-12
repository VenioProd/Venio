import { getTransporter, escapeHtml } from '../transport.js'
import type { EmailResult } from '../transport.js'

export async function sendContactReceiptEmail({
  to,
  firstName,
}: {
  to: string
  firstName: string
}): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'contact@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const safeFirstName = escapeHtml(firstName)

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `Nous avons bien reçu votre message — ${appName}`,
      text: [
        `Bonjour ${firstName},`,
        '',
        'Nous avons bien reçu votre message. Notre équipe vous répondra sous 48 h ouvrées.',
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${safeFirstName},</p>`,
        '<p>Nous avons bien reçu votre message. Notre équipe vous répondra sous 48 h ouvrées.</p>',
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch {
    return { sent: false, error: 'Erreur d’envoi' }
  }
}
