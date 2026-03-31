import { getTransporter, escapeHtml } from '../transport.js'
import type { EmailResult } from '../transport.js'

/**
 * Envoie un email au client pour une mise à jour de projet.
 */
export async function sendClientProjectUpdateEmail({ to, clientName, projectName, updateTitle, updateDescription, projectUrl }: { to: string; clientName: string; projectName: string; updateTitle: string; updateDescription: string; projectUrl: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Mise à jour sur votre projet : ${projectName}`,
      text: [
        `Bonjour ${clientName},`,
        '',
        `Votre projet "${projectName}" a été mis à jour :`,
        '',
        `${updateTitle}`,
        updateDescription ? `\n${updateDescription}` : '',
        '',
        `Consulter votre espace : ${projectUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(clientName)},</p>`,
        `<p>Votre projet <strong>${escapeHtml(projectName)}</strong> a été mis à jour :</p>`,
        `<div style="margin: 16px 0; padding: 16px; background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px;">`,
        `<p style="margin: 0 0 4px; font-weight: 600;">${escapeHtml(updateTitle)}</p>`,
        updateDescription ? `<p style="margin: 0; color: #666;">${escapeHtml(updateDescription)}</p>` : '',
        `</div>`,
        `<p><a href="${escapeHtml(projectUrl)}" style="display: inline-block; padding: 10px 20px; background: #22c55e; color: white; text-decoration: none; border-radius: 6px;">Voir mon projet</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de changement de statut projet.
 */
export async function sendProjectStatusEmail({ to, recipientName, projectName, oldStatus, newStatus, projectId }: { to: string; recipientName: string; projectName: string; oldStatus: string; newStatus: string; projectId: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = process.env.ADMIN_LOGIN_URL ? process.env.ADMIN_LOGIN_URL.replace('/login', '') : 'http://localhost:5501/admin'
  const projectUrl = `${baseUrl}/projets/${projectId}`

  const STATUS_LABELS: Record<string, string> = { EN_COURS: 'En cours', EN_ATTENTE: 'En attente', TERMINE: 'Terminé' }

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Projet "${projectName}" — ${STATUS_LABELS[newStatus] || newStatus}`,
      text: [
        `Bonjour ${recipientName},`,
        '',
        `Le statut du projet "${projectName}" a changé :`,
        `  ${STATUS_LABELS[oldStatus] || oldStatus} → ${STATUS_LABELS[newStatus] || newStatus}`,
        '',
        `Voir le projet : ${projectUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(recipientName)},</p>`,
        `<p>Le statut du projet <strong>${escapeHtml(projectName)}</strong> a changé :</p>`,
        `<div style="margin: 16px 0; padding: 16px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 4px;">`,
        `<p style="margin: 0;"><span style="color: #666;">${escapeHtml(STATUS_LABELS[oldStatus] || oldStatus)}</span> → <strong>${escapeHtml(STATUS_LABELS[newStatus] || newStatus)}</strong></p>`,
        `</div>`,
        `<p><a href="${escapeHtml(projectUrl)}" style="display: inline-block; padding: 10px 20px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px;">Voir le projet</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de notification de démarrage de projet.
 */
export async function sendProjectStartEmail({ to, name, projectName, portalUrl }: { to: string; name: string; projectName: string; portalUrl: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Votre projet "${projectName}" est lancé !`,
      text: [
        `Bonjour ${name},`,
        '',
        `Bonne nouvelle ! Votre projet "${projectName}" vient de démarrer.`,
        '',
        `Vous pouvez suivre l'avancement depuis votre espace client :`,
        portalUrl,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Bonne nouvelle ! Votre projet <strong>"${escapeHtml(projectName)}"</strong> vient de démarrer.</p>`,
        `<p><a href="${escapeHtml(portalUrl)}" style="display: inline-block; padding: 10px 20px; background: #22c55e; color: white; text-decoration: none; border-radius: 6px;">Suivre mon projet</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de notification de projet terminé.
 */
export async function sendProjectCompleteEmail({ to, name, projectName, portalUrl }: { to: string; name: string; projectName: string; portalUrl: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Votre projet "${projectName}" est terminé !`,
      text: [
        `Bonjour ${name},`,
        '',
        `Votre projet "${projectName}" est maintenant terminé.`,
        '',
        `Vous pouvez consulter les livrables depuis votre espace client :`,
        portalUrl,
        '',
        `Merci pour votre confiance !`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Votre projet <strong>"${escapeHtml(projectName)}"</strong> est maintenant terminé.</p>`,
        `<p><a href="${escapeHtml(portalUrl)}" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: white; text-decoration: none; border-radius: 6px;">Voir mon projet</a></p>`,
        `<p>Merci pour votre confiance !</p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de notification de nouveau livrable.
 */
export async function sendDeliverableNotificationEmail({ to, name, projectName, deliverableName }: { to: string; name: string; projectName: string; deliverableName: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const clientBaseUrl = process.env.CLIENT_URL || 'http://localhost:5501/espace-client'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Nouveau document sur "${projectName}"`,
      text: [
        `Bonjour ${name},`,
        '',
        `Un nouveau document a été ajouté à votre projet "${projectName}" :`,
        `  ${deliverableName}`,
        '',
        `Consultez votre espace client pour le télécharger.`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Un nouveau document a été ajouté à votre projet <strong>"${escapeHtml(projectName)}"</strong> :</p>`,
        `<div style="margin: 16px 0; padding: 16px; background: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px;">`,
        `<p style="margin: 0; font-weight: 600;">${escapeHtml(deliverableName)}</p>`,
        `</div>`,
        `<p><a href="${escapeHtml(clientBaseUrl)}" style="display: inline-block; padding: 10px 20px; background: #22c55e; color: white; text-decoration: none; border-radius: 6px;">Voir mon espace</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}
