import { getTransporter, escapeHtml, getAdminBaseUrl } from '../transport.js'
import type { EmailResult } from '../transport.js'

/**
 * Envoie un email de notification d'attribution de brief de mission.
 */
export async function sendBriefAssignedEmail({ to, destinataireName, briefTitle, projectName, priority, deadline, assignedBy }: { to: string; destinataireName: string; briefTitle: string; projectName: string; priority: string; deadline: string; assignedBy: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = getAdminBaseUrl()
  const gestionUrl = `${baseUrl}/gestion`

  const PRIORITY_LABELS: Record<string, string> = { P1: 'Urgente', P2: 'Normale', P3: 'Basse' }

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Brief de mission : ${briefTitle}`,
      text: [
        `Bonjour ${destinataireName},`,
        '',
        `${assignedBy} vous a attribué un nouveau brief de mission :`,
        '',
        `  Brief : ${briefTitle}`,
        `  Projet : ${projectName}`,
        `  Priorité : ${PRIORITY_LABELS[priority] || priority}`,
        `  Deadline : ${deadline}`,
        '',
        `Voir vos briefs : ${gestionUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(destinataireName)},</p>`,
        `<p><strong>${escapeHtml(assignedBy)}</strong> vous a attribué un nouveau brief de mission :</p>`,
        `<div style="margin: 16px 0; padding: 16px; background: #f8fafc; border-left: 4px solid #0ea5e9; border-radius: 4px;">`,
        `<p style="margin: 0 0 8px; font-weight: 600; font-size: 16px;">${escapeHtml(briefTitle)}</p>`,
        `<table style="border-collapse: collapse; font-size: 14px;">`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Projet</td><td style="padding: 4px 0; font-weight: 500;">${escapeHtml(projectName)}</td></tr>`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Priorité</td><td style="padding: 4px 0; font-weight: 500;">${escapeHtml(PRIORITY_LABELS[priority] || priority)}</td></tr>`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Deadline</td><td style="padding: 4px 0; font-weight: 500;">${escapeHtml(deadline)}</td></tr>`,
        `</table>`,
        `</div>`,
        `<p><a href="${escapeHtml(gestionUrl)}" style="display: inline-block; padding: 10px 20px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 6px;">Voir mes briefs</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de rappel d'échéance de brief de mission.
 */
export async function sendBriefReminderEmail({ to, name, briefTitle, deadline }: { to: string; name: string; briefTitle: string; deadline: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = getAdminBaseUrl()

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Rappel : Brief "${briefTitle}" — échéance le ${deadline}`,
      text: [
        `Bonjour ${name},`,
        '',
        `Le brief de mission "${briefTitle}" arrive à échéance le ${deadline}.`,
        '',
        `Pensez à finaliser vos livrables avant la date limite.`,
        '',
        `Accéder à la gestion : ${baseUrl}/gestion`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Le brief de mission <strong>"${escapeHtml(briefTitle)}"</strong> arrive à échéance le <strong>${escapeHtml(deadline)}</strong>.</p>`,
        `<p>Pensez à finaliser vos livrables avant la date limite.</p>`,
        `<p><a href="${escapeHtml(baseUrl)}/gestion" style="display: inline-block; padding: 10px 20px; background: #f97316; color: white; text-decoration: none; border-radius: 6px;">Voir mes briefs</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}
