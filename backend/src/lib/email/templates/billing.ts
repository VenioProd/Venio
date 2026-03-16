import { getTransporter, escapeHtml } from '../transport.js'
import type { EmailResult } from '../transport.js'

/**
 * Envoie un email de notification de facture au client.
 */
export async function sendInvoiceEmail({ to, name, invoiceNumber, amount, dueDate, downloadUrl }: { to: string; name: string; invoiceNumber: string; amount: string; dueDate: string; downloadUrl: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
  const appName = process.env.APP_NAME || 'Venio'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Facture ${invoiceNumber}`,
      text: [
        `Bonjour ${name},`,
        '',
        `Veuillez trouver ci-dessous les détails de votre facture :`,
        '',
        `  Numéro   : ${invoiceNumber}`,
        `  Montant  : ${amount}`,
        `  Échéance : ${dueDate}`,
        '',
        `Télécharger la facture : ${downloadUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Veuillez trouver ci-dessous les détails de votre facture :</p>`,
        '<table style="border-collapse: collapse; margin: 16px 0;">',
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Numéro</td><td style="padding: 4px 0; font-weight: 600;">${escapeHtml(invoiceNumber)}</td></tr>`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Montant</td><td style="padding: 4px 0; font-weight: 600;">${escapeHtml(amount)}</td></tr>`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Échéance</td><td style="padding: 4px 0; font-weight: 600;">${escapeHtml(dueDate)}</td></tr>`,
        '</table>',
        `<p><a href="${escapeHtml(downloadUrl)}" style="display: inline-block; padding: 10px 20px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 6px;">Télécharger la facture</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de relance de facture impayée.
 */
export async function sendInvoiceReminderEmail({ to, name, invoiceNumber, amount, daysPastDue }: { to: string; name: string; invoiceNumber: string; amount: string; daysPastDue: number }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
  const appName = process.env.APP_NAME || 'Venio'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Rappel : Facture ${invoiceNumber} en attente de paiement`,
      text: [
        `Bonjour ${name},`,
        '',
        `Nous vous rappelons que la facture ${invoiceNumber} d'un montant de ${amount} est en attente de paiement depuis ${daysPastDue} jours.`,
        '',
        `Merci de procéder au règlement dans les meilleurs délais.`,
        '',
        `Si le paiement a déjà été effectué, veuillez ignorer ce message.`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Nous vous rappelons que la facture <strong>${escapeHtml(invoiceNumber)}</strong> d'un montant de <strong>${escapeHtml(amount)}</strong> est en attente de paiement depuis <strong>${daysPastDue} jours</strong>.</p>`,
        `<p>Merci de procéder au règlement dans les meilleurs délais.</p>`,
        `<p style="color: #666; font-size: 13px;">Si le paiement a déjà été effectué, veuillez ignorer ce message.</p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}
