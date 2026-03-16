import { getTransporter, escapeHtml } from '../transport.js'
import type { EmailResult } from '../transport.js'

/**
 * Envoie un email de notification d'assignation de tâche.
 */
export async function sendTaskAssignedEmail({ to, assigneeName, taskTitle, projectName, projectId, assignedBy }: { to: string; assigneeName: string; taskTitle: string; projectName: string; projectId: string; assignedBy: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = process.env.ADMIN_LOGIN_URL ? process.env.ADMIN_LOGIN_URL.replace('/login', '') : 'http://localhost:5501/admin'
  const projectUrl = `${baseUrl}/projects/${projectId}?tab=tasks`

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Tâche assignée : ${taskTitle}`,
      text: [
        `Bonjour ${assigneeName},`,
        '',
        `${assignedBy} vous a assigné une nouvelle tâche sur le projet "${projectName}" :`,
        '',
        `  Tâche : ${taskTitle}`,
        '',
        `Voir la tâche : ${projectUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(assigneeName)},</p>`,
        `<p><strong>${escapeHtml(assignedBy)}</strong> vous a assigné une nouvelle tâche sur le projet <strong>${escapeHtml(projectName)}</strong> :</p>`,
        `<div style="margin: 16px 0; padding: 16px; background: #f8fafc; border-left: 4px solid #6366f1; border-radius: 4px;">`,
        `<p style="margin: 0; font-weight: 600;">${escapeHtml(taskTitle)}</p>`,
        `</div>`,
        `<p><a href="${escapeHtml(projectUrl)}" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px;">Voir la tâche</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de rappel d'échéance de tâche.
 */
export async function sendTaskReminderEmail({ to, name, taskTitle, projectName, dueDate }: { to: string; name: string; taskTitle: string; projectName: string; dueDate: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = process.env.ADMIN_LOGIN_URL ? process.env.ADMIN_LOGIN_URL.replace('/login', '') : 'http://localhost:5501/admin'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Rappel : Tâche "${taskTitle}" arrive à échéance`,
      text: [
        `Bonjour ${name},`,
        '',
        `La tâche "${taskTitle}" sur le projet "${projectName}" arrive à échéance le ${dueDate}.`,
        '',
        `Pensez à la finaliser avant la date limite.`,
        '',
        `Accéder au projet : ${baseUrl}/projects`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>La tâche <strong>"${escapeHtml(taskTitle)}"</strong> sur le projet <strong>"${escapeHtml(projectName)}"</strong> arrive à échéance le <strong>${escapeHtml(dueDate)}</strong>.</p>`,
        `<p>Pensez à la finaliser avant la date limite.</p>`,
        `<p><a href="${escapeHtml(baseUrl)}/projects" style="display: inline-block; padding: 10px 20px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px;">Voir mes tâches</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}
