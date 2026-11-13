import { emailLayout, highlightBlock, infoLine } from '../email/layout.js'
import { escapeHtml, getTransporter, type EmailResult } from '../email/transport.js'
import type { ICallScriptReport } from '../../models/CallScriptReport.js'

/**
 * E-mail du rapport hebdomadaire des scripts. Aucune citation de transcript ni
 * paragraphe libre (résumé, lecture) : des compteurs, les objections et les
 * formulations proposées (déjà masquées), et le lien vers l'app, où le
 * rapport complet est lu derrière une connexion.
 */
const SAFE = (text: string) =>
  text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[…]').replace(/\+?\d(?:[\s.-]?\d){7,}/g, '[…]')

function reportUrl(kind: ICallScriptReport['authorKind']): string {
  const base = (process.env.APP_URL || 'http://localhost:5501').replace(/\/$/, '')
  return kind === 'rep' ? `${base}/commercial/rapports-scripts` : `${base}/admin/crm/rapports-scripts`
}

export async function sendScriptReportEmail({
  to,
  report,
  authorName,
}: {
  to: string[]
  report: Pick<ICallScriptReport, 'authorKind' | 'weekKey' | 'stats' | 'output' | 'status'>
  authorName: string
}): Promise<EmailResult> {
  const transporter = getTransporter()
  if (!transporter) return { sent: false, error: 'SMTP non configuré' }
  const appName = process.env.APP_NAME || 'Venio'
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'notifications@venio.paris'
  const { stats, output } = report
  const rate = stats.conversionRate === null ? '—' : `${stats.conversionRate} %`
  const url = reportUrl(report.authorKind)

  const text = [
    `Rapport des scripts d'appel — ${authorName}, semaine ${report.weekKey}`,
    '',
    `Appels : ${stats.calls} · joints : ${stats.reached} · rendez-vous : ${stats.conversions}`,
    `Conversion : ${rate} (objectif ${stats.targetConversionRate} %)`,
    '',
    ...(output
      ? [
          output.objections.length ? 'Objections récurrentes :' : '',
          ...output.objections.map((o) => `- ${o.label} (${o.occurrences}) → ${o.response}`),
          '',
          output.scriptChanges.length ? 'À essayer cette semaine :' : '',
          ...output.scriptChanges.map((c) => `- ${c.proposed}`),
        ]
      : ['Pas d’analyse cette semaine (aucun transcript exploitable).']),
    '',
    `Rapport complet, avec les citations : ${url}`,
  ]
    .filter((line, i, all) => line || all[i - 1])
    .map(SAFE)
    .join('\n')

  const list = (items: string[]) =>
    `<ul style="margin:0 0 16px;padding-left:18px;color:#334155;font-size:14px;line-height:1.6;">${items
      .map((i) => `<li>${escapeHtml(SAFE(i))}</li>`)
      .join('')}</ul>`
  const body = [
    infoLine('Semaine', report.weekKey),
    infoLine('Appels · joints · rendez-vous', `${stats.calls} · ${stats.reached} · ${stats.conversions}`),
    infoLine('Conversion', `${rate} (objectif ${stats.targetConversionRate} %)`),
    output ? '' : highlightBlock('Pas d’analyse cette semaine (aucun transcript exploitable).'),
    output?.objections.length
      ? `<h3 style="font-size:15px;margin:16px 0 8px;">Objections récurrentes</h3>${list(output.objections.map((o) => `${o.label} (${o.occurrences}) → ${o.response}`))}`
      : '',
    output?.scriptChanges.length
      ? `<h3 style="font-size:15px;margin:16px 0 8px;">À essayer cette semaine</h3>${list(output.scriptChanges.map((c) => c.proposed))}`
      : '',
  ].join('')

  try {
    await transporter.sendMail({
      from: `"${appName}" <${from}>`,
      to: to.join(', '),
      subject: `[${appName}] Rapport des scripts — semaine ${report.weekKey}`,
      text,
      html: emailLayout({
        title: `Rapport des scripts — ${authorName}`,
        preheader: `Conversion ${rate}, objectif ${stats.targetConversionRate} %`,
        body,
        ctaUrl: url,
        ctaLabel: 'Ouvrir le rapport',
      }),
    })
    return { sent: true }
  } catch (err) {
    return { sent: false, error: (err as Error).message }
  }
}
