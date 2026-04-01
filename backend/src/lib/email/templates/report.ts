import { getTransporter, escapeHtml, getAdminBaseUrl } from '../transport.js'
import type { EmailResult } from '../transport.js'

/**
 * Envoie un email aux SUPER_ADMIN quand un stagiaire/alternant soumet un rapport d'activité.
 */
export async function sendInternReportEmail({
  to,
  internName,
  internType,
  reportDate,
  poste,
  contenu,
  tachesCount,
  attachmentsCount,
}: {
  to: string | string[]
  internName: string
  internType: 'STAGIAIRE' | 'ALTERNANT'
  reportDate: string
  poste: string
  contenu: string
  tachesCount: number
  attachmentsCount: number
}): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'notifications@venio.paris'
  const appName = process.env.APP_NAME || 'Venio'
  const baseUrl = getAdminBaseUrl()
  const typeLabel = internType === 'ALTERNANT' ? 'alternant(e)' : 'stagiaire'
  const preview = contenu.length > 200 ? contenu.slice(0, 200) + '…' : contenu

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject: `[${appName}] Nouveau rapport — ${internName} (${reportDate})`,
      text: [
        `Bonjour,`,
        '',
        `${internName} (${typeLabel} — ${poste}) vient de soumettre un rapport d'activité pour le ${reportDate}.`,
        '',
        `Aperçu :`,
        preview,
        '',
        tachesCount > 0 ? `Tâches réalisées : ${tachesCount}` : '',
        attachmentsCount > 0 ? `Pièces jointes : ${attachmentsCount}` : '',
        '',
        `Voir les rapports : ${baseUrl}/stagiaires`,
        '',
        `— ${appName}`,
      ].filter(Boolean).join('\n'),
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b;">
          <div style="background: #0f172a; padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="margin: 0; color: #0ea5e9; font-size: 18px;">${escapeHtml(appName)}</h2>
          </div>
          <div style="background: #ffffff; padding: 28px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
            <h3 style="margin: 0 0 8px; font-size: 16px; color: #0f172a;">Nouveau rapport d'activité</h3>
            <p style="margin: 0 0 20px; color: #64748b; font-size: 14px;">
              <strong style="color: #0f172a;">${escapeHtml(internName)}</strong>
              <span style="display: inline-block; margin: 0 6px; padding: 1px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${internType === 'ALTERNANT' ? '#f3e8ff' : '#e0f2fe'}; color: ${internType === 'ALTERNANT' ? '#7c3aed' : '#0369a1'};">${typeLabel}</span>
              — ${escapeHtml(poste)} · ${escapeHtml(reportDate)}
            </p>
            <div style="background: #f8fafc; border-left: 3px solid #0ea5e9; border-radius: 0 6px 6px 0; padding: 14px 16px; margin-bottom: 20px; font-size: 14px; color: #334155; line-height: 1.6;">
              ${escapeHtml(preview).replace(/\n/g, '<br>')}
            </div>
            ${tachesCount > 0 || attachmentsCount > 0 ? `
            <p style="font-size: 13px; color: #64748b; margin: 0 0 20px;">
              ${tachesCount > 0 ? `✅ ${tachesCount} tâche(s) réalisée(s)` : ''}
              ${tachesCount > 0 && attachmentsCount > 0 ? ' · ' : ''}
              ${attachmentsCount > 0 ? `📎 ${attachmentsCount} pièce(s) jointe(s)` : ''}
            </p>` : ''}
            <a href="${baseUrl}/stagiaires" style="display: inline-block; padding: 10px 20px; background: #0ea5e9; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">Voir le rapport</a>
          </div>
          <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 16px;">— ${escapeHtml(appName)}</p>
        </div>
      `,
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
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
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'admin@venio.paris'
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
