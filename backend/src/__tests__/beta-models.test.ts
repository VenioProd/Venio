import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import BetaCampaign from '../models/BetaCampaign.js'
import BetaScenario from '../models/BetaScenario.js'
import BetaTester from '../models/BetaTester.js'
import BetaRun from '../models/BetaRun.js'

const devProject = new mongoose.Types.ObjectId()
const author = new mongoose.Types.ObjectId()

async function makeCampaign() {
  return BetaCampaign.create({ devProject, name: 'Recette site', createdBy: author })
}

async function makeScenario(campaign: mongoose.Types.ObjectId, number = 1) {
  return BetaScenario.create({ campaign, number, identifier: `BETA-${number}`, title: `Demarche ${number}` })
}

async function makeTester(campaign: mongoose.Types.ObjectId, email: string) {
  return BetaTester.create({ campaign, name: 'Testeur', email, tokenHash: 'a'.repeat(64) })
}

beforeAll(async () => {
  await setupMongo()
  await Promise.all([
    BetaCampaign.syncIndexes(),
    BetaScenario.syncIndexes(),
    BetaTester.syncIndexes(),
    BetaRun.syncIndexes(),
  ])
})
afterAll(teardownMongo)
beforeEach(clearDb)

describe('BetaCampaign', () => {
  it('exige un projet dev de rattachement', async () => {
    await expect(BetaCampaign.create({ name: 'Sans projet', createdBy: author })).rejects.toThrow()
  })

  it('demarre en brouillon', async () => {
    const campaign = await makeCampaign()
    expect(campaign.status).toBe('DRAFT')
    expect(campaign.scenarioCounter).toBe(0)
  })
})

describe('BetaScenario', () => {
  it('refuse deux demarches portant le meme numero dans une campagne', async () => {
    const campaign = await makeCampaign()
    await makeScenario(campaign._id, 1)
    await expect(makeScenario(campaign._id, 1)).rejects.toThrow()
  })

  it('autorise le meme numero dans deux campagnes distinctes', async () => {
    const [a, b] = await Promise.all([makeCampaign(), makeCampaign()])
    await makeScenario(a._id, 1)
    await expect(makeScenario(b._id, 1)).resolves.toBeTruthy()
  })

  it('part du principe qu une demarche n a pas encore ete testee', async () => {
    const campaign = await makeCampaign()
    const scenario = await makeScenario(campaign._id)
    expect(scenario.summaryStatus).toBe('NOT_TESTED')
  })
})

describe('BetaTester', () => {
  it('refuse d inviter deux fois la meme adresse sur une campagne', async () => {
    const campaign = await makeCampaign()
    await makeTester(campaign._id, 'lea@example.test')
    await expect(makeTester(campaign._id, 'lea@example.test')).rejects.toThrow()
  })

  it('normalise l adresse pour que la casse ne cree pas de doublon', async () => {
    const campaign = await makeCampaign()
    await makeTester(campaign._id, 'lea@example.test')
    await expect(makeTester(campaign._id, 'LEA@Example.test')).rejects.toThrow()
  })

  it('accepte la meme adresse sur une autre campagne', async () => {
    const [a, b] = await Promise.all([makeCampaign(), makeCampaign()])
    await makeTester(a._id, 'lea@example.test')
    await expect(makeTester(b._id, 'lea@example.test')).resolves.toBeTruthy()
  })
})

describe('BetaRun', () => {
  it('refuse un second verdict du meme testeur sur la meme demarche', async () => {
    const campaign = await makeCampaign()
    const scenario = await makeScenario(campaign._id)
    const tester = await makeTester(campaign._id, 'lea@example.test')
    await BetaRun.create({ campaign: campaign._id, scenario: scenario._id, tester: tester._id, verdict: 'WORKS' })
    await expect(
      BetaRun.create({ campaign: campaign._id, scenario: scenario._id, tester: tester._id, verdict: 'BROKEN' }),
    ).rejects.toThrow()
  })

  it('laisse deux testeurs rendre des verdicts divergents', async () => {
    const campaign = await makeCampaign()
    const scenario = await makeScenario(campaign._id)
    const [lea, max] = await Promise.all([
      makeTester(campaign._id, 'lea@example.test'),
      makeTester(campaign._id, 'max@example.test'),
    ])
    await BetaRun.create({ campaign: campaign._id, scenario: scenario._id, tester: lea._id, verdict: 'WORKS' })
    await expect(
      BetaRun.create({ campaign: campaign._id, scenario: scenario._id, tester: max._id, verdict: 'BROKEN' }),
    ).resolves.toBeTruthy()
  })

  it('exige un auteur, testeur externe ou membre de l equipe', async () => {
    const campaign = await makeCampaign()
    const scenario = await makeScenario(campaign._id)
    await expect(BetaRun.create({ campaign: campaign._id, scenario: scenario._id, verdict: 'WORKS' })).rejects.toThrow(
      /auteur/i,
    )
  })

  it('refuse un verdict attribue a la fois a un testeur et a un membre', async () => {
    const campaign = await makeCampaign()
    const scenario = await makeScenario(campaign._id)
    const tester = await makeTester(campaign._id, 'lea@example.test')
    await expect(
      BetaRun.create({
        campaign: campaign._id,
        scenario: scenario._id,
        tester: tester._id,
        user: author,
        verdict: 'WORKS',
      }),
    ).rejects.toThrow(/auteur/i)
  })

  it('n autorise pas un membre a rendre deux verdicts sur la meme demarche', async () => {
    const campaign = await makeCampaign()
    const scenario = await makeScenario(campaign._id)
    await BetaRun.create({ campaign: campaign._id, scenario: scenario._id, user: author, verdict: 'WORKS' })
    await expect(
      BetaRun.create({ campaign: campaign._id, scenario: scenario._id, user: author, verdict: 'BROKEN' }),
    ).rejects.toThrow()
  })

  it('ouvre le retour et le laisse sans issue liee', async () => {
    const campaign = await makeCampaign()
    const scenario = await makeScenario(campaign._id)
    const tester = await makeTester(campaign._id, 'lea@example.test')
    const run = await BetaRun.create({
      campaign: campaign._id,
      scenario: scenario._id,
      tester: tester._id,
      verdict: 'BROKEN',
    })
    expect(run.status).toBe('OPEN')
    expect(run.devIssue).toBeNull()
    expect(run.confirmations).toEqual([])
  })
})
