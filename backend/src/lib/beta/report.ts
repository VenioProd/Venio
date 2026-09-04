import PDFDocument from 'pdfkit'
import BetaCampaign from '../../models/BetaCampaign.js'
import BetaScenario, { type BetaScenarioStatus } from '../../models/BetaScenario.js'
import BetaTester from '../../models/BetaTester.js'
import BetaRun, { type BetaSeverity } from '../../models/BetaRun.js'

const SCENARIO_LABELS: Record<BetaScenarioStatus, string> = {
  NOT_TESTED: 'Non testée',
  OK: 'Fonctionne',
  KO: 'Ne fonctionne pas',
  TO_OPTIMIZE: 'À optimiser',
  TO_RETEST: 'À revalider',
}

const SEVERITY_LABELS: Record<BetaSeverity, string> = {
  BLOCKER: 'Bloquant',
  MAJOR: 'Majeur',
  MINOR: 'Mineur',
  COSMETIC: 'Cosmétique',
}

const SEVERITY_WEIGHT: Record<BetaSeverity, number> = {
  BLOCKER: 0,
  MAJOR: 1,
  MINOR: 2,
  COSMETIC: 3,
}

export interface CampaignReportData {
  campaign: { name: string; description: string; targetUrl: string | null; status: string; endsAt: Date | null }
  scenarios: Array<{ identifier: string; title: string; status: BetaScenarioStatus; statusLabel: string }>
  totals: {
    scenarios: number
    ok: number
    ko: number
    toOptimize: number
    toRetest: number
    notTested: number
    /** Part des démarches concluantes, arrondie au point. */
    successRate: number
  }
  openFindings: Array<{
    title: string
    scenario: string
    severity: BetaSeverity | null
    severityLabel: string
    confirmations: number
    testerName: string
  }>
  fixedFindings: number
  testers: Array<{ name: string; tested: number; total: number }>
}

export async function buildCampaignReportData(campaignId: string): Promise<CampaignReportData> {
  const campaign = await BetaCampaign.findById(campaignId).lean()
  if (!campaign) throw new Error('Campagne introuvable')

  const [scenarios, testers, runs] = await Promise.all([
    BetaScenario.find({ campaign: campaign._id, archivedAt: null }).sort({ rank: 1, number: 1 }).lean(),
    BetaTester.find({ campaign: campaign._id }).select('name').sort({ createdAt: 1 }).lean(),
    BetaRun.find({ campaign: campaign._id }).populate('tester', 'name').populate('scenario', 'identifier title').lean(),
  ])

  const countBy = (status: BetaScenarioStatus) =>
    scenarios.filter((scenario) => scenario.summaryStatus === status).length

  const ok = countBy('OK')
  const openFindings = runs
    .filter((run) => run.verdict !== 'WORKS' && ['OPEN', 'ACKNOWLEDGED'].includes(run.status))
    .sort((a, b) => {
      const bySeverity = (a.severity ? SEVERITY_WEIGHT[a.severity] : 9) - (b.severity ? SEVERITY_WEIGHT[b.severity] : 9)
      if (bySeverity !== 0) return bySeverity
      return (b.confirmations?.length ?? 0) - (a.confirmations?.length ?? 0)
    })
    .map((run) => {
      const scenario = run.scenario as unknown as { identifier?: string; title?: string } | null
      const tester = run.tester as unknown as { name?: string } | null
      return {
        title: run.title || 'Retour sans intitulé',
        scenario: scenario?.identifier ? `${scenario.identifier} — ${scenario.title}` : '—',
        severity: run.severity ?? null,
        severityLabel: run.severity ? SEVERITY_LABELS[run.severity] : 'Non précisé',
        confirmations: run.confirmations?.length ?? 0,
        testerName: tester?.name ?? 'Équipe',
      }
    })

  const testedByTester = new Map<string, number>()
  for (const run of runs) {
    if (!run.tester) continue
    const key = String((run.tester as unknown as { _id: unknown })._id)
    testedByTester.set(key, (testedByTester.get(key) ?? 0) + 1)
  }

  return {
    campaign: {
      name: campaign.name,
      description: campaign.description,
      targetUrl: campaign.targetUrl,
      status: campaign.status,
      endsAt: campaign.endsAt,
    },
    scenarios: scenarios.map((scenario) => ({
      identifier: scenario.identifier,
      title: scenario.title,
      status: scenario.summaryStatus,
      statusLabel: SCENARIO_LABELS[scenario.summaryStatus],
    })),
    totals: {
      scenarios: scenarios.length,
      ok,
      ko: countBy('KO'),
      toOptimize: countBy('TO_OPTIMIZE'),
      toRetest: countBy('TO_RETEST'),
      notTested: countBy('NOT_TESTED'),
      successRate: scenarios.length === 0 ? 0 : Math.round((ok / scenarios.length) * 100),
    },
    openFindings,
    fixedFindings: runs.filter((run) => run.status === 'FIXED').length,
    testers: testers.map((tester) => ({
      name: tester.name,
      tested: testedByTester.get(String(tester._id)) ?? 0,
      total: scenarios.length,
    })),
  }
}

/** Rend le rapport en PDF. Même approche que le récapitulatif projet. */
export function renderCampaignReportPdf(data: CampaignReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []
    pdf.on('data', (chunk) => chunks.push(chunk as Buffer))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)

    pdf.fontSize(20).text('Rapport de beta test', { align: 'left' })
    pdf.moveDown(0.3)
    pdf.fontSize(14).fillColor('#444').text(data.campaign.name)
    pdf.fillColor('#000')
    if (data.campaign.targetUrl) pdf.fontSize(10).fillColor('#666').text(data.campaign.targetUrl).fillColor('#000')
    if (data.campaign.description) {
      pdf.moveDown(0.5)
      pdf.fontSize(10).text(data.campaign.description)
    }

    pdf.moveDown(1)
    pdf.fontSize(12).text('Où en est la recette')
    pdf.moveDown(0.3)
    pdf.fontSize(10)
    pdf.text(`${data.totals.scenarios} démarche(s) — ${data.totals.successRate} % concluantes`)
    pdf.text(
      `Fonctionne : ${data.totals.ok} · Ne fonctionne pas : ${data.totals.ko} · ` +
        `À optimiser : ${data.totals.toOptimize} · À revalider : ${data.totals.toRetest} · ` +
        `Non testée : ${data.totals.notTested}`,
    )
    if (data.fixedFindings > 0) pdf.text(`${data.fixedFindings} retour(s) corrigé(s) pendant la campagne`)

    pdf.moveDown(1)
    pdf.fontSize(12).text('Démarches')
    pdf.moveDown(0.3)
    pdf.fontSize(9)
    for (const scenario of data.scenarios) {
      pdf.text(`[${scenario.statusLabel}] ${scenario.identifier} — ${scenario.title}`)
    }

    if (data.openFindings.length > 0) {
      pdf.moveDown(1)
      pdf.fontSize(12).text('Retours encore ouverts')
      pdf.moveDown(0.3)
      pdf.fontSize(9)
      for (const finding of data.openFindings) {
        const confirmed = finding.confirmations > 0 ? ` · confirmé ×${finding.confirmations}` : ''
        pdf.text(`[${finding.severityLabel}] ${finding.title}${confirmed}`)
        pdf.fillColor('#666').text(`    ${finding.scenario} — signalé par ${finding.testerName}`).fillColor('#000')
      }
    }

    if (data.testers.length > 0) {
      pdf.moveDown(1)
      pdf.fontSize(12).text('Participation')
      pdf.moveDown(0.3)
      pdf.fontSize(9)
      for (const tester of data.testers) {
        pdf.text(`${tester.name} — ${tester.tested} / ${tester.total} démarche(s) testée(s)`)
      }
    }

    pdf.end()
  })
}
