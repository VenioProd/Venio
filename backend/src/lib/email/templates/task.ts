import { getTransporter, escapeHtml } from '../transport.js'
import { emailLayout, highlightBlock, infoLine } from '../layout.js'
import type { EmailResult } from '../transport.js'

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Envoie un email de notification d'assignation de tâche.
 */
export async function sendTaskAssignedEmail({ to, assigneeName, taskTitle, projectName, projectId, assignedBy, dueDate, priority }: {
  to: string; assigneeName: string; taskTitle: string; projectName: string; projectId: string; assignedBy: string; dueDate?: string | null; priority?: string | null
}): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'contact@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = process.env.ADMIN_LOGIN_URL ? process.env.ADMIN_LOGIN_URL.replace('/login', '') : 'https://venio.paris/admin'
  const projectUrl = `${baseUrl}/projets/${projectId}?tab=tasks`

  // Calcul du délai
  let deadlineInfo = ''
  if (dueDate) {
    const now = new Date()
    const due = new Date(dueDate)
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > 0) {
      deadlineInfo = `${diffDays} jour${diffDays > 1 ? 's' : ''} pour la réaliser`
    } else if (diffDays === 0) {
      deadlineInfo = "À rendre aujourd'hui"
    } else {
      deadlineInfo = `En retard de ${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''}`
    }
  }

  const priorityLabels: Record<string, { label: string; color: string }> = {
    URGENTE: { label: 'Urgente', color: '#ef4444' },
    HAUTE: { label: 'Haute', color: '#f59e0b' },
    NORMALE: { label: 'Normale', color: '#6366f1' },
    BASSE: { label: 'Basse', color: '#94a3b8' },
  }
  const prio = priority ? priorityLabels[priority] || null : null

  const body = `
    <p>Bonjour <strong>${escapeHtml(assigneeName)}</strong>,</p>
    <p><strong>${escapeHtml(assignedBy)}</strong> vous a assigné une nouvelle tâche :</p>
    ${highlightBlock(`
      ${infoLine('Tâche', taskTitle)}
      ${infoLine('Projet', projectName)}
      ${dueDate ? infoLine('Échéance', formatDate(dueDate)) : ''}
      ${deadlineInfo ? infoLine('Délai', deadlineInfo) : ''}
      ${prio ? `<p style="margin:6px 0;font-size:14px;"><span style="color:#64748b;">Priorité :</span> <strong style="color:${prio.color};">${prio.label}</strong></p>` : ''}
    `)}
    <p>Connectez-vous pour consulter les détails et commencer à travailler dessus.</p>
  `

  const html = emailLayout({
    title: 'Nouvelle tâche assignée',
    preheader: `${assignedBy} vous a assigné "${taskTitle}"${dueDate ? ` — échéance le ${formatDate(dueDate)}` : ''}`,
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
      text: `Bonjour ${assigneeName},\n\n${assignedBy} vous a assigné une nouvelle tâche sur le projet "${projectName}" :\n\nTâche : ${taskTitle}${dueDate ? `\nÉchéance : ${formatDate(dueDate)}` : ''}${deadlineInfo ? `\nDélai : ${deadlineInfo}` : ''}${prio ? `\nPriorité : ${prio.label}` : ''}\n\nVoir la tâche : ${projectUrl}\n\n— L'équipe ${appName}`,
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
    <p>Bonjour <strong>${escapeHtml(name)}</strong>,</p>
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
