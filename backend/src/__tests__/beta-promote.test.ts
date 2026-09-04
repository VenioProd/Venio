import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import BetaCampaign from '../models/BetaCampaign.js'
import BetaScenario from '../models/BetaScenario.js'
import BetaTester from '../models/BetaTester.js'
import BetaRun, { type BetaSeverity } from '../models/BetaRun.js'
import { applyIssueResolutionToBetaRuns, promoteRunToIssue } from '../lib/beta/promote.js'

const actor = new mongoose.Types.ObjectId()

async function seed(runOver: Record<string, unknown> = {}) {
  const project = await DevProject.create({ key: 'VNO', name: 'Venio', createdBy: actor })
  const campaign = await BetaCampaign.create({
    devProject: project._id,
    name: 'Recette',
    createdBy: actor,
    status: 'RUNNING',
  })
  const scenario = await BetaScenario.create({
    campaign: campaign._id,
    number: 1,
    identifier: 'BETA-1',
    title: 'Demander un devis',
    steps: [
      { order: 1, instruction: 'Ouvrir /devis', expected: 'Le formulaire s affiche' },
      { order: 2, instruction: 'Valider', expected: 'Un accuse de reception arrive' },
    ],
  })
  const tester = await BetaTester.create({
    campaign: campaign._id,
    name: 'Lea Durand',
    email: 'lea@example.test',
    tokenHash: 'b'.repeat(64),
  })
  const run = await BetaRun.create({
    campaign: campaign._id,
    scenario: scenario._id,
    tester: tester._id,
    verdict: 'BROKEN',
    severity: 'BLOCKER' as BetaSeverity,
    reproducibility: 'ALWAYS',
    failedStep: 2,
    title: 'Le bouton valider ne repond pas',
    body: 'Rien ne se passe au clic',
    context: {
      url: 'https://x.test/devis',
      userAgent: 'Safari/17',
      viewportWidth: 390,
      viewportHeight: 844,
      isMobile: true,
    },
    ...runOver,
  })
  return { project, campaign, scenario, tester, run }
}

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

describe('promoteRunToIssue', () => {
  it('ouvre une issue dans le projet dev de la campagne', async () => {
    const { project, run } = await seed()
    const issue = await promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })
    expect(String(issue.project)).toBe(String(project._id))
    expect(issue.identifier).toBe('VNO-1')
    expect(issue.title).toBe('Le bouton valider ne repond pas')
    expect(issue.type).toBe('BUG')
  })

  it('emporte le contexte du test dans la description', async () => {
    const { run } = await seed()
    const issue = await promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })
    expect(issue.description).toContain('Demander un devis')
    expect(issue.description).toContain('Rien ne se passe au clic')
    expect(issue.description).toContain('Safari/17')
    expect(issue.description).toContain('https://x.test/devis')
    expect(issue.description).toContain('Lea Durand')
  })

  it('ne verse pas l adresse du testeur dans le tracker', async () => {
    const { run } = await seed()
    const issue = await promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })
    expect(issue.description).not.toContain('lea@example.test')
  })

  it('traduit la gravite du retour en priorite d issue', async () => {
    const cases: Array<[BetaSeverity | null, string]> = [
      ['BLOCKER', 'URGENT'],
      ['MAJOR', 'HIGH'],
      ['MINOR', 'MEDIUM'],
      ['COSMETIC', 'LOW'],
      [null, 'MEDIUM'],
    ]
    for (const [severity, expected] of cases) {
      await clearDb()
      const { run } = await seed({ severity })
      const issue = await promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })
      expect(issue.priority).toBe(expected)
    }
  })

  it('classe une demande d optimisation autrement qu un bug', async () => {
    const { run } = await seed({ verdict: 'TO_OPTIMIZE', severity: 'MINOR' })
    const issue = await promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })
    expect(issue.type).toBe('CHORE')
  })

  it('lie le retour a son issue et le marque comme pris en compte', async () => {
    const { run } = await seed()
    const issue = await promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })
    const reloaded = await BetaRun.findById(run._id)
    expect(String(reloaded!.devIssue)).toBe(String(issue._id))
    expect(reloaded!.status).toBe('ACKNOWLEDGED')
  })

  it('ne cree pas une seconde issue si le retour en a deja une', async () => {
    const { run } = await seed()
    const first = await promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })
    const second = await promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })
    expect(String(second._id)).toBe(String(first._id))
    expect(await DevIssue.countDocuments()).toBe(1)
  })

  it('refuse de promouvoir un retour favorable', async () => {
    const { run } = await seed({ verdict: 'WORKS', severity: null })
    await expect(promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })).rejects.toThrow(/favorable/i)
  })

  it('refuse un retour inexistant', async () => {
    await expect(
      promoteRunToIssue({ runId: String(new mongoose.Types.ObjectId()), actorId: String(actor) }),
    ).rejects.toThrow(/introuvable/i)
  })
})

describe('applyIssueResolutionToBetaRuns', () => {
  it('marque le retour corrige et rallume la demarche a revalider', async () => {
    const { scenario, run } = await seed()
    const issue = await promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })

    const touched = await applyIssueResolutionToBetaRuns(String(issue._id))

    expect(touched).toBe(1)
    expect((await BetaRun.findById(run._id))!.status).toBe('FIXED')
    expect((await BetaScenario.findById(scenario._id))!.summaryStatus).toBe('TO_RETEST')
  })

  it('ne touche pas a un retour deja classe sans suite', async () => {
    const { run } = await seed()
    const issue = await promoteRunToIssue({ runId: String(run._id), actorId: String(actor) })
    await BetaRun.updateOne({ _id: run._id }, { $set: { status: 'REJECTED' } })

    const touched = await applyIssueResolutionToBetaRuns(String(issue._id))

    expect(touched).toBe(0)
    expect((await BetaRun.findById(run._id))!.status).toBe('REJECTED')
  })

  it('ne fait rien pour une issue qu aucun retour ne reference', async () => {
    await seed()
    expect(await applyIssueResolutionToBetaRuns(String(new mongoose.Types.ObjectId()))).toBe(0)
  })
})
