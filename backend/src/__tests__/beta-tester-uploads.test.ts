/**
 * Les captures vivent dans leur propre fichier : un upload multipart ouvre
 * un transport plus fragile que les requêtes JSON, et le mêler à plusieurs
 * dizaines d'appels dans le même processus rendait la suite instable.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import betaTesterRoutes from '../routes/beta/index.js'
import DevProject from '../models/DevProject.js'
import BetaCampaign from '../models/BetaCampaign.js'
import BetaScenario from '../models/BetaScenario.js'
import BetaTester from '../models/BetaTester.js'
import BetaRun from '../models/BetaRun.js'
import { createBetaTesterToken, hashBetaTesterToken } from '../lib/beta/tokens.js'

let app: Express
const actor = new mongoose.Types.ObjectId()

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(256)])
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

let campaignId: mongoose.Types.ObjectId
let scenarioId: mongoose.Types.ObjectId
let leaToken: string
let maxToken: string
let leaId: mongoose.Types.ObjectId
let maxId: mongoose.Types.ObjectId

async function invite(name: string, email: string) {
  const token = createBetaTesterToken()
  const tester = await BetaTester.create({
    campaign: campaignId,
    name,
    email,
    tokenHash: hashBetaTesterToken(token),
  })
  return { token, tester }
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/beta', betaTesterRoutes)
})
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
    title: 'Demander un devis',
    steps: [{ order: 1, instruction: 'Ouvrir /devis', expected: 'Le formulaire s affiche' }],
  })
  scenarioId = scenario._id
  const lea = await invite('Lea', 'lea@example.test')
  const max = await invite('Max', 'max@example.test')
  leaToken = lea.token
  leaId = lea.tester._id
  maxToken = max.token
  maxId = max.tester._id
})

function postVerdict(token: string, body: Record<string, unknown>, scenario = scenarioId) {
  return request(app).post(`/api/beta/${token}/scenarios/${scenario}/runs`).send(body)
}

describe('captures d ecran', () => {
  async function ownRun() {
    await postVerdict(leaToken, { verdict: 'BROKEN', title: 'Casse' }).expect(201)
    return BetaRun.findOne({ scenario: scenarioId, tester: leaId })
  }

  it('accepte une capture PNG et la rend affichable', async () => {
    const run = await ownRun()
    const upload = await request(app)
      .post(`/api/beta/${leaToken}/runs/${run!._id}/attachments`)
      .attach('file', png, 'capture.png')
      .expect(201)

    const attachmentId = upload.body.attachments[0]._id
    const download = await request(app)
      .get(`/api/beta/${leaToken}/runs/${run!._id}/attachments/${attachmentId}`)
      .expect(200)
    expect(download.headers['content-type']).toBe('image/png')
    expect(download.headers['x-content-type-options']).toBe('nosniff')
  })

  it('refuse un SVG, meme renomme en PNG', async () => {
    const run = await ownRun()
    await request(app)
      .post(`/api/beta/${leaToken}/runs/${run!._id}/attachments`)
      .attach('file', svg, 'capture.png')
      .expect(400)
    expect((await BetaRun.findById(run!._id))!.attachments).toHaveLength(0)
  })

  it('interdit de joindre une capture au retour d un autre', async () => {
    await postVerdict(maxToken, { verdict: 'BROKEN', title: 'Casse' }).expect(201)
    const foreign = await BetaRun.findOne({ tester: maxId })
    await request(app)
      .post(`/api/beta/${leaToken}/runs/${foreign!._id}/attachments`)
      .attach('file', png, 'capture.png')
      .expect(404)
  })

  it('interdit de lire la capture d un autre', async () => {
    await postVerdict(maxToken, { verdict: 'BROKEN', title: 'Casse' }).expect(201)
    const foreign = await BetaRun.findOne({ tester: maxId })
    await request(app)
      .post(`/api/beta/${maxToken}/runs/${foreign!._id}/attachments`)
      .attach('file', png, 'capture.png')
      .expect(201)
    const withFile = await BetaRun.findById(foreign!._id)
    await request(app)
      .get(`/api/beta/${leaToken}/runs/${foreign!._id}/attachments/${withFile!.attachments[0]!._id}`)
      .expect(404)
  })
})
