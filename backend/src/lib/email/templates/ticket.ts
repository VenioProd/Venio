import { getTransporter, escapeHtml, getAdminBaseUrl } from '../transport.js'
import type { EmailResult } from '../transport.js'

/**
 * Envoie un email quand un super admin répond à un ticket interne.
 */
export async function sendTicketReplyEmail({
  to, authorName, replierName, ticketTitle, replyMessage,
}: {
  to: string; authorName: string; replierName: string; ticketTitle: string; replyMessage: string
}): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configure' }

  const appName = process.env.APP_NAME || 'Venio'
  const from = process.env.SMTP_FROM || 'admin@venio.paris'
  const ticketsUrl = `${getAdminBaseUrl()}/tickets`

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Reponse a votre ticket : ${ticketTitle}`,
      text: [
        `Bonjour ${authorName},`,
        '',
        `${replierName} a repondu a votre ticket "${ticketTitle}" :`,
        '',
        `  "${replyMessage}"`,
        '',
        `Voir le ticket : ${ticketsUrl}`,
        '',
        `— L'equipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(authorName)},</p>`,
        `<p><strong>${escapeHtml(replierName)}</strong> a repondu a votre ticket :</p>`,
        `<div style="margin: 16px 0; padding: 16px; background: #f8fafc; border-left: 4px solid #0ea5e9; border-radius: 4px;">`,
        `<p style="margin: 0 0 8px; font-weight: 600; font-size: 15px; color: #0ea5e9;">${escapeHtml(ticketTitle)}</p>`,
        `<p style="margin: 0; font-size: 14px; color: #334155; white-space: pre-line;">${escapeHtml(replyMessage)}</p>`,
        `</div>`,
        `<p><a href="${escapeHtml(ticketsUrl)}" style="display: inline-block; padding: 10px 20px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 6px;">Voir le ticket</a></p>`,
        `<p style="color: #94a3b8; font-size: 12px;">— L'equipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}
