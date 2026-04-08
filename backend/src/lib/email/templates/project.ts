import { getTransporter, escapeHtml, getAdminBaseUrl } from '../transport.js'
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
  const baseUrl = getAdminBaseUrl()
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

/**
 * Notifie un membre (admin/stagiaire) qu'il a été ajouté à un projet interne.
 */
export async function sendInternalProjectAssignedEmail({
  to,
  memberName,
  projectName,
  entity,
  poles,
  description,
  projectUrl,
}: {
  to: string
  memberName: string
  projectName: string
  entity: string
  poles: string[]
  description: string
  projectUrl: string
}): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }

  const appName = process.env.APP_NAME || 'Venio'
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'notifications@venio.paris'
  const polesText = poles.length > 0 ? poles.join(', ') : '—'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Nouveau projet interne : ${projectName}`,
      text: [
        `Bonjour ${memberName},`,
        '',
        `Tu as été ajouté(e) au projet interne "${projectName}" (${entity}).`,
        description ? `\n${description}\n` : '',
        `Pôles concernés : ${polesText}`,
        '',
        `Des tâches te seront assignées prochainement. Consulte régulièrement ton espace pour suivre les missions et retours.`,
        '',
        `Voir le projet : ${projectUrl}`,
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0f;color:#e2e8f0;padding:32px;border-radius:12px;border:1px solid rgba(255,255,255,0.08)">
          <div style="margin-bottom:20px">
            <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(14,165,233,0.15);border:1px solid rgba(14,165,233,0.3);color:#38bdf8;letter-spacing:.5px">PROJET INTERNE</span>
            <span style="display:inline-block;margin-left:8px;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:#c4b5fd">${escapeHtml(entity)}</span>
          </div>
          <p style="margin:0 0 8px">Bonjour <strong>${escapeHtml(memberName)}</strong>,</p>
          <p style="margin:0 0 20px;color:rgba(255,255,255,0.7)">Tu as été ajouté(e) au projet interne :</p>
          <div style="margin:0 0 20px;padding:16px 20px;background:rgba(255,255,255,0.04);border-left:3px solid #0ea5e9;border-radius:6px">
            <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:6px">${escapeHtml(projectName)}</div>
            ${description ? `<div style="font-size:13px;color:rgba(255,255,255,0.55);line-height:1.5">${escapeHtml(description)}</div>` : ''}
            ${poles.length > 0 ? `<div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.4)">Pôles : <strong style="color:#c4b5fd">${escapeHtml(polesText)}</strong></div>` : ''}
          </div>
          <p style="margin:0 0 20px;color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6">
            Des tâches te seront assignées prochainement.<br>
            <strong style="color:#fff">Consulte régulièrement ton espace</strong> pour suivre les missions, retours et mises à jour du projet.
          </p>
          <a href="${escapeHtml(projectUrl)}" style="display:inline-block;padding:12px 24px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Voir le projet →</a>
          <p style="margin:24px 0 0;font-size:12px;color:rgba(255,255,255,0.3)">— L'équipe ${escapeHtml(appName)}</p>
        </div>`,
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

export async function sendResourcePublishedEmail({
  to,
  memberName,
  resourceName,
  category,
  description,
  resourcesUrl,
}: {
  to: string
  memberName: string
  resourceName: string
  category: string
  description: string
  resourcesUrl: string
}): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }

  const appName = process.env.APP_NAME || 'Venio'
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'notifications@venio.paris'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Nouveau document disponible : ${resourceName}`,
      text: [
        `Bonjour ${memberName},`,
        '',
        `Un nouveau document a été ajouté à l'espace Ressources : "${resourceName}" (${category}).`,
        description ? `\n${description}\n` : '',
        `Consulte-le ici : ${resourcesUrl}`,
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0f;color:#e2e8f0;padding:32px;border-radius:12px;border:1px solid rgba(255,255,255,0.08)">
          <div style="margin-bottom:20px">
            <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);color:#6ee7b7;letter-spacing:.5px">NOUVEAU DOCUMENT</span>
            <span style="display:inline-block;margin-left:8px;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(14,165,233,0.12);border:1px solid rgba(14,165,233,0.3);color:#38bdf8">${escapeHtml(category)}</span>
          </div>
          <p style="margin:0 0 8px">Bonjour <strong>${escapeHtml(memberName)}</strong>,</p>
          <p style="margin:0 0 20px;color:rgba(255,255,255,0.7)">Un nouveau document a été ajouté à l'espace Ressources :</p>
          <div style="margin:0 0 20px;padding:16px 20px;background:rgba(255,255,255,0.04);border-left:3px solid #10b981;border-radius:6px">
            <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:6px">${escapeHtml(resourceName)}</div>
            ${description ? `<div style="font-size:13px;color:rgba(255,255,255,0.55);line-height:1.5">${escapeHtml(description)}</div>` : ''}
          </div>
          <a href="${escapeHtml(resourcesUrl)}" style="display:inline-block;padding:12px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Voir les ressources →</a>
          <p style="margin:24px 0 0;font-size:12px;color:rgba(255,255,255,0.3)">— L'équipe ${escapeHtml(appName)}</p>
        </div>`,
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Notifie un membre qu'une mission lui a été assignée.
 */
export async function sendInternalMissionAssignedEmail({
  to,
  memberName,
  missionTitle,
  missionDescription,
  projectName,
  entity,
  dueDate,
  projectUrl,
}: {
  to: string
  memberName: string
  missionTitle: string
  missionDescription: string
  projectName: string
  entity: string
  dueDate: string | null
  projectUrl: string
}): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }

  const appName = process.env.APP_NAME || 'Venio'
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'notifications@venio.paris'
  const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString('fr-FR') : null

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Nouvelle mission : ${missionTitle}`,
      text: [
        `Bonjour ${memberName},`,
        '',
        `Une nouvelle mission t'a été assignée dans le projet "${projectName}" (${entity}) :`,
        '',
        `Mission : ${missionTitle}`,
        missionDescription ? missionDescription : '',
        dueDateStr ? `Deadline : ${dueDateStr}` : '',
        '',
        `Voir le projet : ${projectUrl}`,
        `— L'équipe ${appName}`,
      ].filter(Boolean).join('\n'),
      html: `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0f;color:#e2e8f0;padding:32px;border-radius:12px;border:1px solid rgba(255,255,255,0.08)">
          <div style="margin-bottom:20px">
            <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(234,179,8,0.15);border:1px solid rgba(234,179,8,0.3);color:#fde047;letter-spacing:.5px">NOUVELLE MISSION</span>
            <span style="display:inline-block;margin-left:8px;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.3);color:#c4b5fd">${escapeHtml(entity)}</span>
          </div>
          <p style="margin:0 0 8px">Bonjour <strong>${escapeHtml(memberName)}</strong>,</p>
          <p style="margin:0 0 16px;color:rgba(255,255,255,0.7)">Une mission t'a été assignée dans le projet <strong style="color:#fff">${escapeHtml(projectName)}</strong> :</p>
          <div style="margin:0 0 20px;padding:16px 20px;background:rgba(255,255,255,0.04);border-left:3px solid #eab308;border-radius:6px">
            <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px">${escapeHtml(missionTitle)}</div>
            ${missionDescription ? `<div style="font-size:13px;color:rgba(255,255,255,0.55);line-height:1.5">${escapeHtml(missionDescription)}</div>` : ''}
            ${dueDateStr ? `<div style="margin-top:10px;font-size:12px;color:rgba(255,255,255,0.4)">Deadline : <strong style="color:#fde047">${escapeHtml(dueDateStr)}</strong></div>` : ''}
          </div>
          <a href="${escapeHtml(projectUrl)}" style="display:inline-block;padding:12px 24px;background:#eab308;color:#000;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Voir le projet →</a>
          <p style="margin:24px 0 0;font-size:12px;color:rgba(255,255,255,0.3)">— L'équipe ${escapeHtml(appName)}</p>
        </div>`,
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Notifie le SUPER_ADMIN qu'une étape attend sa vérification.
 */
export async function sendStepReviewRequestEmail({
  to,
  adminName,
  memberName,
  missionTitle,
  stepTitle,
  projectName,
  projectUrl,
}: {
  to: string
  adminName: string
  memberName: string
  missionTitle: string
  stepTitle: string
  projectName: string
  projectUrl: string
}): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }

  const appName = process.env.APP_NAME || 'Venio'
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'notifications@venio.paris'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Vérification demandée : ${stepTitle}`,
      text: [
        `Bonjour ${adminName},`,
        '',
        `${memberName} a terminé une étape et demande votre vérification :`,
        '',
        `Mission : ${missionTitle}`,
        `Étape : ${stepTitle}`,
        `Projet : ${projectName}`,
        '',
        `Voir le projet : ${projectUrl}`,
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: `
        <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0f;color:#e2e8f0;padding:32px;border-radius:12px;border:1px solid rgba(255,255,255,0.08)">
          <div style="margin-bottom:20px">
            <span style="display:inline-block;padding:2px 10px;border-radius:4px;font-size:11px;font-weight:700;background:rgba(234,179,8,0.15);border:1px solid rgba(234,179,8,0.3);color:#fde047;letter-spacing:.5px">VÉRIFICATION DEMANDÉE</span>
          </div>
          <p style="margin:0 0 8px">Bonjour <strong>${escapeHtml(adminName)}</strong>,</p>
          <p style="margin:0 0 16px;color:rgba(255,255,255,0.7)"><strong style="color:#fff">${escapeHtml(memberName)}</strong> a terminé une étape et demande votre vérification :</p>
          <div style="margin:0 0 20px;padding:16px 20px;background:rgba(255,255,255,0.04);border-left:3px solid #eab308;border-radius:6px">
            <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:4px">Mission</div>
            <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:12px">${escapeHtml(missionTitle)}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:4px">Étape à vérifier</div>
            <div style="font-size:14px;font-weight:600;color:#fde047">${escapeHtml(stepTitle)}</div>
            <div style="margin-top:8px;font-size:12px;color:rgba(255,255,255,0.4)">Projet : ${escapeHtml(projectName)}</div>
          </div>
          <a href="${escapeHtml(projectUrl)}" style="display:inline-block;padding:12px 24px;background:#eab308;color:#000;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px">Voir et valider →</a>
          <p style="margin:24px 0 0;font-size:12px;color:rgba(255,255,255,0.3)">— L'équipe ${escapeHtml(appName)}</p>
        </div>`,
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}
