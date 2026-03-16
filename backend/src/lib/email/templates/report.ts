import { getTransporter, escapeHtml } from '../transport.js'
import type { EmailResult } from '../transport.js'

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
