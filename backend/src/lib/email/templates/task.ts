import { getTransporter, escapeHtml } from '../transport.js'
import { emailLayout, highlightBlock, infoLine } from '../layout.js'
import type { EmailResult } from '../transport.js'

/**
 * Envoie un email de notification d'assignation de tâche.
 */
export async function sendTaskAssignedEmail({ to, assigneeName, taskTitle, projectName, projectId, assignedBy }: { to: string; assigneeName: string; taskTitle: string; projectName: string; projectId: string; assignedBy: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'contact@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = process.env.ADMIN_LOGIN_URL ? process.env.ADMIN_LOGIN_URL.replace('/login', '') : 'https://venio.paris/admin'
  const projectUrl = `${baseUrl}/projets/${projectId}?tab=tasks`

  const body = `
    <p style="color:#f1f5f9;">Bonjour ${escapeHtml(assigneeName)},</p>
    <p><strong style="color:#f1f5f9;">${escapeHtml(assignedBy)}</strong> vous a assigné une nouvelle tâche :</p>
    ${highlightBlock(`
      ${infoLine('Tâche', taskTitle)}
      ${infoLine('Projet', projectName)}
      ${infoLine('Assignée par', assignedBy)}
    `)}
    <p>Connectez-vous pour voir les détails et commencer à travailler dessus.</p>
  `

  const html = emailLayout({
    title: 'Nouvelle tâche assignée',
    preheader: `${assignedBy} vous a assigné "${taskTitle}" sur ${projectName}`,
    body,
    ctaUrl: projectUrl,
    ctaLabel: 'Voir la tâche',
    ctaColor: '#6366f1',
  })

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Nouvelle tâche : ${taskTitle}`,
      text: `Bonjour ${assigneeName},\n\n${assignedBy} vous a assigné une nouvelle tâche sur le projet "${projectName}" :\n\nTâche : ${taskTitle}\n\nVoir la tâche : ${projectUrl}\n\n— L'équipe ${appName}`,
      html,
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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'contact@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = process.env.ADMIN_LOGIN_URL ? process.env.ADMIN_LOGIN_URL.replace('/login', '') : 'https://venio.paris/admin'

  const body = `
    <p style="color:#f1f5f9;">Bonjour ${escapeHtml(name)},</p>
    <p>Une tâche arrive bientôt à échéance :</p>
    ${highlightBlock(`
      ${infoLine('Tâche', taskTitle)}
      ${infoLine('Projet', projectName)}
      ${infoLine('Échéance', dueDate)}
    `, '#f59e0b')}
    <p>Pensez à la finaliser avant la date limite.</p>
  `

  const html = emailLayout({
    title: 'Rappel : tâche bientôt à échéance',
    preheader: `"${taskTitle}" arrive à échéance le ${dueDate}`,
    body,
    ctaUrl: `${baseUrl}/gestion`,
    ctaLabel: 'Voir mes tâches',
    ctaColor: '#f59e0b',
  })

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Rappel : "${taskTitle}" — échéance le ${dueDate}`,
      text: `Bonjour ${name},\n\nLa tâche "${taskTitle}" sur le projet "${projectName}" arrive à échéance le ${dueDate}.\n\nPensez à la finaliser avant la date limite.\n\n— L'équipe ${appName}`,
      html,
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}
