import mongoose from 'mongoose'
import DevProject from '../../models/DevProject.js'
import type { DevIssuePriority, DevIssueType, IDevIssue } from '../../models/DevIssue.js'
import BetaCampaign from '../../models/BetaCampaign.js'
import BetaScenario from '../../models/BetaScenario.js'
import BetaTester from '../../models/BetaTester.js'
import BetaRun, { type BetaSeverity, type IBetaRun } from '../../models/BetaRun.js'
import { createIssueWithRetry } from '../dev/createIssue.js'
import { computeScenarioSummary } from './summary.js'

const PRIORITY_BY_SEVERITY: Record<BetaSeverity, DevIssuePriority> = {
  BLOCKER: 'URGENT',
  MAJOR: 'HIGH',
  MINOR: 'MEDIUM',
  COSMETIC: 'LOW',
}

const REPRODUCIBILITY_LABELS = {
  ALWAYS: 'systématique',
  SOMETIMES: 'aléatoire',
  ONCE: 'vu une fois',
} as const

/**
 * Recalcule et persiste le statut affiché d'une démarche à partir de ses
 * verdicts. Appelé après toute écriture qui peut le changer.
 */
export async function refreshScenarioSummary(scenarioId: mongoose.Types.ObjectId | string): Promise<void> {
  const runs = await BetaRun.find({ scenario: scenarioId }).select('verdict status').lean()
  await BetaScenario.updateOne({ _id: scenarioId }, { $set: { summaryStatus: computeScenarioSummary(runs) } })
}

/**
 * Rédige le corps de l'issue. Le tracker est interne, donc le nom du testeur y
 * a sa place — il permet de revenir vers lui. Son adresse, non : elle n'ajoute
 * rien au diagnostic et n'a pas à se propager hors de l'espace beta.
 */
function buildIssueDescription(run: IBetaRun, scenario: { title: string; identifier: string }, testerName: string) {
  const lines: string[] = [
    `Signalé pendant une campagne de beta test par **${testerName}**.`,
    '',
    `**Démarche** — ${scenario.identifier} · ${scenario.title}`,
  ]

  if (run.failedStep) lines.push(`**Étape en échec** — n° ${run.failedStep}`)
  if (run.severity) lines.push(`**Gravité** — ${run.severity}`)
  if (run.reproducibility) lines.push(`**Reproductibilité** — ${REPRODUCIBILITY_LABELS[run.reproducibility]}`)

  if (run.body) lines.push('', '**Ce que le testeur décrit**', run.body)

  const context = run.context
  if (context) {
    lines.push('', '**Contexte technique**')
    if (context.url) lines.push(`- URL : ${context.url}`)
    if (context.userAgent) lines.push(`- Navigateur : ${context.userAgent}`)
    if (context.viewportWidth && context.viewportHeight) {
      lines.push(`- Écran : ${context.viewportWidth}×${context.viewportHeight}`)
    }
    if (context.isMobile != null) lines.push(`- Appareil : ${context.isMobile ? 'mobile' : 'ordinateur'}`)
  }

  if (run.attachments.length > 0) {
    lines.push('', `**Captures** — ${run.attachments.length} jointe(s) au retour dans l'espace beta.`)
  }

  return lines.join('\n')
}

export interface PromoteInput {
  runId: string
  actorId: string
}

/**
 * Transforme un retour de testeur en issue du dev tracker.
 *
 * L'opération est idempotente : un retour déjà promu renvoie son issue plutôt
 * que d'en ouvrir une seconde. C'est ce qui permet de câbler le bouton sans
 * craindre le double-clic ni le rejeu réseau.
 */
export async function promoteRunToIssue({ runId, actorId }: PromoteInput): Promise<IDevIssue> {
  const run = await BetaRun.findById(runId)
  if (!run) throw new Error('Retour introuvable')

  if (run.devIssue) {
    const { default: DevIssue } = await import('../../models/DevIssue.js')
    const existing = await DevIssue.findById(run.devIssue)
    if (existing) return existing
  }

  if (run.verdict === 'WORKS') {
    throw new Error('Un retour favorable n’a pas à ouvrir une issue')
  }

  const [campaign, scenario] = await Promise.all([
    BetaCampaign.findById(run.campaign).select('devProject name'),
    BetaScenario.findById(run.scenario).select('title identifier'),
  ])
  if (!campaign || !scenario) throw new Error('Campagne ou démarche introuvable')

  const project = await DevProject.findById(campaign.devProject).select('key')
  if (!project) throw new Error('Projet dev introuvable')

  const tester = run.tester ? await BetaTester.findById(run.tester).select('name') : null
  const testerName = tester?.name ?? 'un membre de l’équipe'

  const issue = await createIssueWithRetry({
    project: campaign.devProject,
    projectKey: project.key,
    title: run.title || `Retour de beta test — ${scenario.title}`,
    description: buildIssueDescription(run, scenario, testerName),
    type: (run.verdict === 'BROKEN' ? 'BUG' : 'CHORE') as DevIssueType,
    status: 'TODO',
    priority: run.severity ? PRIORITY_BY_SEVERITY[run.severity] : 'MEDIUM',
    reporter: new mongoose.Types.ObjectId(actorId),
    labels: ['beta-test'],
    source: { kind: 'manual', name: `Beta test — ${campaign.name}` },
  })

  run.devIssue = issue._id
  run.status = 'ACKNOWLEDGED'
  await run.save()
  await refreshScenarioSummary(run.scenario)

  return issue
}

/**
 * Referme la boucle : quand l'issue liée est résolue, les retours qu'elle
 * couvre passent en « corrigé » et leur démarche redemande une validation. Un
 * retour classé sans suite reste où il est — quelqu'un a déjà tranché.
 */
export async function applyIssueResolutionToBetaRuns(issueId: string): Promise<number> {
  const runs = await BetaRun.find({
    devIssue: issueId,
    status: { $in: ['OPEN', 'ACKNOWLEDGED'] },
  }).select('_id scenario')

  if (runs.length === 0) return 0

  await BetaRun.updateMany({ _id: { $in: runs.map((run) => run._id) } }, { $set: { status: 'FIXED' } })

  const scenarioIds = [...new Set(runs.map((run) => String(run.scenario)))]
  await Promise.all(scenarioIds.map((scenarioId) => refreshScenarioSummary(scenarioId)))

  return runs.length
}
