import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import DevProject from '../models/DevProject.js'
import BetaCampaign from '../models/BetaCampaign.js'
import BetaScenario from '../models/BetaScenario.js'
import BetaTester from '../models/BetaTester.js'
import BetaRun from '../models/BetaRun.js'
import { buildCampaignReportData } from '../lib/beta/report.js'

const actor = new mongoose.Types.ObjectId()
let campaignId: mongoose.Types.ObjectId
let scenarioId: mongoose.Types.ObjectId
let testerId: mongoose.Types.ObjectId

beforeAll(setupMongo)
afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const project = await DevProject.create({ key: 'VNO', name: 'Venio', createdBy: actor })
  const campaign = await BetaCampaign.create({
    devProject: project._id,
    name: 'Recette',
    createdBy: actor,
    status: 'RUNNING',
  })
  campaignId = campaign._id
  const scenario = await BetaScenario.create({
    campaign: campaignId,
    number: 1,
    identifier: 'BETA-1',
    title: 'Importer des apprenants',
  })
  scenarioId = scenario._id
  const tester = await BetaTester.create({
    campaign: campaignId,
    name: 'Lea',
    email: 'lea@example.test',
    tokenHash: 'a'.repeat(64),
  })
  testerId = tester._id
})

describe('rapport de campagne — blocages', () => {
  it('ne compte pas un blocage parmi les defauts du produit', async () => {
    await BetaRun.create({
      campaign: campaignId,
      scenario: scenarioId,
      tester: testerId,
      verdict: 'BLOCKED',
      title: 'Pas recu l acces a l environnement de test',
    })
    const data = await buildCampaignReportData(String(campaignId))
    expect(data.openFindings).toHaveLength(0)
  })

  it('liste les blocages a part, avec ce qui manque au testeur', async () => {
    await BetaRun.create({
      campaign: campaignId,
      scenario: scenarioId,
      tester: testerId,
      verdict: 'BLOCKED',
      title: 'Pas recu l acces a l environnement de test',
    })
    const data = await buildCampaignReportData(String(campaignId))
    expect(data.blockedFindings).toHaveLength(1)
    expect(data.blockedFindings[0]).toMatchObject({
      title: 'Pas recu l acces a l environnement de test',
      testerName: 'Lea',
    })
  })

  it('compte les demarches que personne n a pu derouler', async () => {
    await BetaScenario.updateOne({ _id: scenarioId }, { $set: { summaryStatus: 'BLOCKED' } })
    const data = await buildCampaignReportData(String(campaignId))
    expect(data.totals.blocked).toBe(1)
  })

  it('ne compte pas une demarche bloquee comme concluante', async () => {
    await BetaScenario.updateOne({ _id: scenarioId }, { $set: { summaryStatus: 'BLOCKED' } })
    const data = await buildCampaignReportData(String(campaignId))
    expect(data.totals.successRate).toBe(0)
  })

  it('ignore un blocage classe sans suite', async () => {
    await BetaRun.create({
      campaign: campaignId,
      scenario: scenarioId,
      tester: testerId,
      verdict: 'BLOCKED',
      title: 'Resolu depuis',
      status: 'REJECTED',
    })
    const data = await buildCampaignReportData(String(campaignId))
    expect(data.blockedFindings).toHaveLength(0)
  })
})
