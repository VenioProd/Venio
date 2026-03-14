import nodemailer from 'nodemailer'

interface EmailResult {
  sent: boolean
  error?: string
}

function getTransporter(): nodemailer.Transporter | null {
  const host = process.env.SMTP_HOST || 'smtp.ionos.com'
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    return null
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass },
    tls: { minVersion: 'TLSv1.2' },
  })
}

/**
 * Envoie un email avec les identifiants de connexion admin.
 */
export async function sendAdminCredentials({ to, name, email, password }: { to: string; name: string; email: string; password: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
  const appName = process.env.APP_NAME || 'Venio'
  const loginUrl = process.env.ADMIN_LOGIN_URL || 'http://localhost:5501/admin/login'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Vos identifiants d'accès administrateur`,
      text: [
        `Bonjour ${name},`,
        '',
        `Un compte administrateur a été créé pour vous sur ${appName}.`,
        '',
        'Vos identifiants de connexion :',
        `  Email    : ${email}`,
        `  Mot de passe : ${password}`,
        '',
        `Connexion : ${loginUrl}`,
        '',
        'Nous vous recommandons de modifier ce mot de passe après votre première connexion.',
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Un compte administrateur a été créé pour vous sur <strong>${escapeHtml(appName)}</strong>.</p>`,
        '<p><strong>Vos identifiants de connexion :</strong></p>',
        '<ul>',
        `<li>Email : <code>${escapeHtml(email)}</code></li>`,
        `<li>Mot de passe : <code>${escapeHtml(password)}</code></li>`,
        '</ul>',
        `<p>Connexion : <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></p>`,
        '<p>Nous vous recommandons de modifier ce mot de passe après votre première connexion.</p>',
        `<p>— L'équipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

/**
 * Envoie un email de test (vérification SMTP).
 */
export async function sendTestEmail(to: string): Promise<EmailResult> {
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
      subject: `[${appName}] Email de test`,
      text: `Ceci est un email de test envoyé depuis ${appName}. Si vous le recevez, la configuration SMTP fonctionne.`,
      html: `<p>Ceci est un email de test envoyé depuis <strong>${escapeHtml(appName)}</strong>.</p><p>Si vous le recevez, la configuration SMTP fonctionne.</p>`,
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
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

interface WeeklyReportStats {
  newLeads: number
  qualified: number
  won: number
  lost: number
  totalActive: number
  pipelineValue: number
  conversionRate: number
}

/**
 * Envoie le rapport hebdomadaire CRM.
 */
export async function sendWeeklyReportEmail({ to, stats }: { to: string; stats: WeeklyReportStats }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
  const appName = process.env.APP_NAME || 'Venio'
  const crmUrl = process.env.CRM_URL || 'http://localhost:5501/admin/crm'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Rapport CRM hebdomadaire`,
      text: [
        `Rapport CRM de la semaine`,
        '',
        `Nouveaux leads : ${stats.newLeads}`,
        `Leads qualifiés : ${stats.qualified}`,
        `Leads gagnés : ${stats.won}`,
        `Leads perdus : ${stats.lost}`,
        `Taux de conversion : ${stats.conversionRate}%`,
        '',
        `Total leads actifs : ${stats.totalActive}`,
        `Valeur pipeline : ${stats.pipelineValue} €`,
        '',
        `Accéder au CRM : ${crmUrl}`,
        '',
        `— L'équipe ${appName}`,
      ].join('\n'),
      html: [
        `<h2>Rapport CRM de la semaine</h2>`,
        '<table style="width: 100%; max-width: 400px; border-collapse: collapse; margin: 16px 0;">',
        `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Nouveaux leads</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600; text-align: right;">${stats.newLeads}</td></tr>`,
        `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Leads qualifiés</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600; text-align: right; color: #0ea5e9;">${stats.qualified}</td></tr>`,
        `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Leads gagnés</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600; text-align: right; color: #22c55e;">${stats.won}</td></tr>`,
        `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Leads perdus</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600; text-align: right; color: #ef4444;">${stats.lost}</td></tr>`,
        `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">Taux de conversion</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: 600; text-align: right;">${stats.conversionRate}%</td></tr>`,
        `<tr style="background: #f3f4f6;"><td style="padding: 8px;">Total leads actifs</td><td style="padding: 8px; font-weight: 600; text-align: right;">${stats.totalActive}</td></tr>`,
        `<tr style="background: #f3f4f6;"><td style="padding: 8px;">Valeur pipeline</td><td style="padding: 8px; font-weight: 600; text-align: right;">${stats.pipelineValue.toLocaleString('fr-FR')} €</td></tr>`,
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
 * Envoie un email au client pour une mise à jour de projet.
 */
export async function sendClientProjectUpdateEmail({ to, clientName, projectName, updateTitle, updateDescription, projectUrl }: { to: string; clientName: string; projectName: string; updateTitle: string; updateDescription: string; projectUrl: string }): Promise<EmailResult> {
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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = process.env.ADMIN_LOGIN_URL ? process.env.ADMIN_LOGIN_URL.replace('/login', '') : 'http://localhost:5501/admin'
  const projectUrl = `${baseUrl}/projects/${projectId}`

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
 * Envoie un email de notification d'attribution de brief de mission.
 */
export async function sendBriefAssignedEmail({ to, destinataireName, briefTitle, projectName, priority, deadline, assignedBy }: { to: string; destinataireName: string; briefTitle: string; projectName: string; priority: string; deadline: string; assignedBy: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configuré (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = process.env.ADMIN_LOGIN_URL ? process.env.ADMIN_LOGIN_URL.replace('/login', '') : 'http://localhost:5501/admin'
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
  const baseUrl = process.env.BASE_URL || 'http://localhost:5173'
  const ticketsUrl = `${baseUrl}/admin/tickets`

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

/**
 * Envoie un email de reinitialisation de mot de passe.
 */
export async function sendPasswordResetEmail({ to, name, resetUrl }: { to: string; name: string; resetUrl: string }): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) {
    return { sent: false, error: 'SMTP non configure (SMTP_USER / SMTP_PASS)' }
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.pro'
  const appName = process.env.APP_NAME || 'Venio'

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to,
      subject: `[${appName}] Reinitialisation de votre mot de passe`,
      text: [
        `Bonjour ${name},`,
        '',
        `Vous avez demande la reinitialisation de votre mot de passe sur ${appName}.`,
        '',
        `Cliquez sur le lien suivant pour definir un nouveau mot de passe :`,
        resetUrl,
        '',
        `Ce lien est valable pendant 1 heure.`,
        '',
        `Si vous n'avez pas fait cette demande, ignorez cet email.`,
        '',
        `— L'equipe ${appName}`,
      ].join('\n'),
      html: [
        `<p>Bonjour ${escapeHtml(name)},</p>`,
        `<p>Vous avez demande la reinitialisation de votre mot de passe sur <strong>${escapeHtml(appName)}</strong>.</p>`,
        `<p><a href="${escapeHtml(resetUrl)}" style="display: inline-block; padding: 12px 24px; background: #0ea5e9; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">Reinitialiser mon mot de passe</a></p>`,
        `<p style="color: #666; font-size: 13px;">Ce lien est valable pendant 1 heure.</p>`,
        `<p style="color: #666; font-size: 13px;">Si vous n'avez pas fait cette demande, ignorez cet email.</p>`,
        `<p>— L'equipe ${escapeHtml(appName)}</p>`,
      ].join(''),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message || String(err) }
  }
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
