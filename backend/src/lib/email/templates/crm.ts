import { getTransporter, escapeHtml } from '../transport.js'
import type { EmailResult } from '../transport.js'

interface LeadAssignmentLead {
  company: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  source?: string
  priority?: string
  budget?: number | null
}

/**
 * Envoie un email de notification d'assignation de lead au commercial.
 */
export async function sendLeadAssignmentEmail({ to, assigneeName, lead }: { to: string; assigneeName: string; lead: LeadAssignmentLead }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const crmUrl = process.env.CRM_URL || 'http://localhost:5501/admin/crm'

  const budgetStr = lead.budget != null ? `${lead.budget.toLocaleString('fr-FR')} €` : 'Non renseigné'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Nouveau lead assigné : ${lead.company}`,
      text: [
        `Bonjour ${assigneeName},`,
        '',
        `Un nouveau lead vous a été assigné sur ${appName}.`,
        '',
        'Détails du lead :',
        `  Entreprise : ${lead.company}`,
        `  Contact    : ${lead.contactName || 'Non renseigné'}`,
        `  Email      : ${lead.contactEmail || 'Non renseigné'}`,
        `  Téléphone  : ${lead.contactPhone || 'Non renseigné'}`,
        `  Source     : ${lead.source || 'Non renseignée'}`,
        `  Priorité   : ${lead.priority || 'NORMALE'}`,
        `  Budget     : ${budgetStr}`,
        '',
        `Accéder au CRM : ${crmUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(assigneeName)},</p>`,
        `<p>Un nouveau lead vous a été assigné sur <strong>${escapeHtml(appName)}</strong>.</p>`,
        '<p><strong>Détails du lead :</strong></p>',
        '<table style="border-collapse: collapse; margin: 16px 0;">',
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Entreprise</td><td style="padding: 4px 0;"><strong>${escapeHtml(lead.company)}</strong></td></tr>`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Contact</td><td style="padding: 4px 0;">${escapeHtml(lead.contactName || 'Non renseigné')}</td></tr>`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Email</td><td style="padding: 4px 0;">${lead.contactEmail ? `<a href="mailto:${escapeHtml(lead.contactEmail)}">${escapeHtml(lead.contactEmail)}</a>` : 'Non renseigné'}</td></tr>`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Téléphone</td><td style="padding: 4px 0;">${escapeHtml(lead.contactPhone || 'Non renseigné')}</td></tr>`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Source</td><td style="padding: 4px 0;">${escapeHtml(lead.source || 'Non renseignée')}</td></tr>`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Priorité</td><td style="padding: 4px 0;">${escapeHtml(lead.priority || 'NORMALE')}</td></tr>`,
        `<tr><td style="padding: 4px 12px 4px 0; color: #666;">Budget</td><td style="padding: 4px 0;">${escapeHtml(budgetStr)}</td></tr>`,
        '</table>',
        `<p><a href="${escapeHtml(crmUrl)}" style="display: inline-block; padding: 10px 20px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 6px;">Accéder au CRM</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

interface ColdLeadItem {
  company: string
  contactName: string
  daysSinceContact: number | null
}

/**
 * Envoie un email de rappel pour les leads froids (sans contact depuis X jours).
 */
export async function sendColdLeadsReminderEmail({ to, assigneeName, leads }: { to: string; assigneeName: string; leads: ColdLeadItem[] }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const crmUrl = process.env.CRM_URL || 'http://localhost:5501/admin/crm'

  const leadsList = leads.map(l => `- ${l.company} (${l.contactName || 'Contact non renseigné'}) — ${l.daysSinceContact} jours sans contact`).join('\n')
  const leadsHtml = leads.map(l =>
    `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(l.company)}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(l.contactName || 'Non renseigné')}</td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #f59e0b; font-weight: 600;">${l.daysSinceContact}j</td></tr>`
  ).join('')

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] ${leads.length} lead(s) froid(s) nécessitent votre attention`,
      text: [
        `Bonjour ${assigneeName},`,
        '',
        `Vous avez ${leads.length} lead(s) sans contact récent :`,
        '',
        leadsList,
        '',
        `Accéder au CRM : ${crmUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(assigneeName)},</p>`,
        `<p>Vous avez <strong>${leads.length} lead(s)</strong> sans contact récent :</p>`,
        '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">',
        '<tr style="background: #f3f4f6;"><th style="padding: 8px; text-align: left;">Entreprise</th><th style="padding: 8px; text-align: left;">Contact</th><th style="padding: 8px; text-align: left;">Inactif</th></tr>',
        leadsHtml,
        '</table>',
        `<p><a href="${escapeHtml(crmUrl)}" style="display: inline-block; padding: 10px 20px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 6px;">Accéder au CRM</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

interface OverdueLeadItem {
  company: string
  contactName: string
  nextActionAt: Date | string
  daysOverdue: number
}

/**
 * Envoie un email récapitulatif des actions en retard.
 */
export async function sendOverdueActionsEmail({ to, assigneeName, leads }: { to: string; assigneeName: string; leads: OverdueLeadItem[] }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const crmUrl = process.env.CRM_URL || 'http://localhost:5501/admin/crm'

  const leadsList = leads.map(l => `- ${l.company} — Action prévue le ${new Date(l.nextActionAt).toLocaleDateString('fr-FR')} (${l.daysOverdue}j de retard)`).join('\n')
  const leadsHtml = leads.map(l =>
    `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(l.company)}</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${new Date(l.nextActionAt).toLocaleDateString('fr-FR')}</td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #ef4444; font-weight: 600;">${l.daysOverdue}j</td></tr>`
  ).join('')

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] ${leads.length} action(s) en retard sur vos leads`,
      text: [
        `Bonjour ${assigneeName},`,
        '',
        `Vous avez ${leads.length} action(s) en retard :`,
        '',
        leadsList,
        '',
        `Accéder au CRM : ${crmUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(assigneeName)},</p>`,
        `<p>Vous avez <strong>${leads.length} action(s)</strong> en retard :</p>`,
        '<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">',
        '<tr style="background: #f3f4f6;"><th style="padding: 8px; text-align: left;">Entreprise</th><th style="padding: 8px; text-align: left;">Date prévue</th><th style="padding: 8px; text-align: left;">Retard</th></tr>',
        leadsHtml,
        '</table>',
        `<p><a href="${escapeHtml(crmUrl)}" style="display: inline-block; padding: 10px 20px; background: #ef4444; color: white; text-decoration: none; border-radius: 6px;">Voir les actions en retard</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

interface EscalationLead {
  company: string
  contactName?: string
  status: string
  priority: string
}

/**
 * Envoie un email d'escalade au manager.
 */
export async function sendEscalationEmail({ to, managerName, lead, assigneeName, daysSinceAssignment }: { to: string; managerName: string; lead: EscalationLead; assigneeName: string; daysSinceAssignment: number }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const crmUrl = process.env.CRM_URL || 'http://localhost:5501/admin/crm'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Escalade : Lead inactif depuis ${daysSinceAssignment} jours`,
      text: [
        `Bonjour ${managerName},`,
        '',
        `Le lead "${lead.company}" assigné à ${assigneeName} n'a pas eu d'activité depuis ${daysSinceAssignment} jours.`,
        '',
        `Détails du lead :`,
        `- Entreprise : ${lead.company}`,
        `- Contact : ${lead.contactName || 'Non renseigné'}`,
        `- Statut : ${lead.status}`,
        `- Priorité : ${lead.priority}`,
        '',
        `Accéder au CRM : ${crmUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(managerName)},</p>`,
        `<p>Le lead <strong>"${escapeHtml(lead.company)}"</strong> assigné à <strong>${escapeHtml(assigneeName)}</strong> n'a pas eu d'activité depuis <strong>${daysSinceAssignment} jours</strong>.</p>`,
        '<p><strong>Détails du lead :</strong></p>',
        '<ul>',
        `<li>Entreprise : ${escapeHtml(lead.company)}</li>`,
        `<li>Contact : ${escapeHtml(lead.contactName || 'Non renseigné')}</li>`,
        `<li>Statut : ${escapeHtml(lead.status)}</li>`,
        `<li>Priorité : ${escapeHtml(lead.priority)}</li>`,
        '</ul>',
        `<p><a href="${escapeHtml(crmUrl)}" style="display: inline-block; padding: 10px 20px; background: #f59e0b; color: white; text-decoration: none; border-radius: 6px;">Accéder au CRM</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

interface ProposalReminderLead {
  company: string
}

/**
 * Envoie un email de rappel avant expiration de proposition.
 */
export async function sendProposalReminderEmail({ to, assigneeName, lead, daysInProposal }: { to: string; assigneeName: string; lead: ProposalReminderLead; daysInProposal: number | null }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const crmUrl = process.env.CRM_URL || 'http://localhost:5501/admin/crm'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Rappel : Proposition en attente depuis ${daysInProposal} jours`,
      text: [
        `Bonjour ${assigneeName},`,
        '',
        `Le lead "${lead.company}" est en statut PROPOSITION depuis ${daysInProposal} jours.`,
        '',
        `Pensez à relancer ce prospect pour ne pas perdre l'opportunité.`,
        '',
        `Accéder au CRM : ${crmUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(assigneeName)},</p>`,
        `<p>Le lead <strong>"${escapeHtml(lead.company)}"</strong> est en statut <strong>PROPOSITION</strong> depuis <strong>${daysInProposal} jours</strong>.</p>`,
        '<p>Pensez à relancer ce prospect pour ne pas perdre l\'opportunité.</p>',
        `<p><a href="${escapeHtml(crmUrl)}" style="display: inline-block; padding: 10px 20px; background: #f97316; color: white; text-decoration: none; border-radius: 6px;">Voir la proposition</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

export async function sendArrowSchoolAssignmentEmail({
  to, assigneeName, school,
}: {
  to: string
  assigneeName: string
  school: { name: string; city?: string; contactName?: string; contactEmail?: string; status?: string }
}): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const url = (process.env.CORS_ORIGIN || 'http://localhost:5501') + '/admin/crm'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[Arrow] École assignée : ${school.name}`,
      text: [
        `Bonjour ${assigneeName},`,
        `Une école vous a été assignée dans la prospection Arrow.`,
        `École : ${school.name}${school.city ? ` (${school.city})` : ''}`,
        `Contact : ${school.contactName || 'Non renseigné'}`,
        `Email : ${school.contactEmail || 'Non renseigné'}`,
        `Statut : ${school.status || 'À prospecter'}`,
        `Voir dans le CRM : ${url}`,
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour <strong>${escapeHtml(assigneeName)}</strong>,</p>`,
        `<p>Une école vous a été assignée dans la prospection <strong>Arrow</strong>.</p>`,
        '<table style="border-collapse:collapse;margin:16px 0;">',
        `<tr><td style="padding:4px 14px 4px 0;color:#666;">École</td><td><strong>${escapeHtml(school.name)}${school.city ? ` (${escapeHtml(school.city)})` : ''}</strong></td></tr>`,
        `<tr><td style="padding:4px 14px 4px 0;color:#666;">Contact</td><td>${escapeHtml(school.contactName || 'Non renseigné')}</td></tr>`,
        `<tr><td style="padding:4px 14px 4px 0;color:#666;">Email</td><td>${school.contactEmail ? `<a href="mailto:${escapeHtml(school.contactEmail)}">${escapeHtml(school.contactEmail)}</a>` : 'Non renseigné'}</td></tr>`,
        `<tr><td style="padding:4px 14px 4px 0;color:#666;">Statut</td><td>${escapeHtml(school.status || 'À prospecter')}</td></tr>`,
        '</table>',
        `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 20px;background:#0ea5e9;color:#fff;text-decoration:none;border-radius:6px;">Voir dans le CRM Arrow</a></p>`,
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}
