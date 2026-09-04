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

describe('porte d entree', () => {
  it('accueille un testeur invite', async () => {
    const res = await request(app).get(`/api/beta/${leaToken}`).expect(200)
    expect(res.body.tester.name).toBe('Lea')
    expect(res.body.campaign.name).toBe('Recette')
    expect(res.body.scenarios).toHaveLength(1)
  })

  it('ne revele jamais l existence d une campagne a un lien invalide', async () => {
    const unknown = await request(app).get(`/api/beta/${createBetaTesterToken()}`).expect(404)
    const malformed = await request(app).get('/api/beta/pas-un-jeton').expect(404)
    expect(unknown.body).toEqual(malformed.body)
  })

  it('ferme la porte a un lien revoque', async () => {
    await BetaTester.updateOne({ _id: leaId }, { $set: { revokedAt: new Date() } })
    await request(app).get(`/api/beta/${leaToken}`).expect(404)
  })

  it('ne divulgue pas l identite des autres testeurs', async () => {
    const res = await request(app).get(`/api/beta/${leaToken}`).expect(200)
    expect(JSON.stringify(res.body)).not.toContain('max@example.test')
    expect(JSON.stringify(res.body)).not.toContain('Max')
  })
})

describe('depot d un verdict', () => {
  it('enregistre un verdict favorable', async () => {
    const res = await postVerdict(leaToken, { verdict: 'WORKS' }).expect(201)
    expect(res.body.run.verdict).toBe('WORKS')
    expect(res.body.run.mine).toBe(true)
    expect((await BetaScenario.findById(scenarioId))!.summaryStatus).toBe('OK')
  })

  it('enregistre une panne avec sa gravite et rougit la demarche', async () => {
    await postVerdict(leaToken, {
      verdict: 'BROKEN',
      severity: 'BLOCKER',
      reproducibility: 'ALWAYS',
      failedStep: 1,
      title: 'Le formulaire ne s ouvre pas',
      body: 'Page blanche',
    }).expect(201)
    expect((await BetaScenario.findById(scenarioId))!.summaryStatus).toBe('KO')
  })

  it('revise le verdict precedent au lieu d en empiler un second', async () => {
    await postVerdict(leaToken, { verdict: 'BROKEN', title: 'Casse' }).expect(201)
    await postVerdict(leaToken, { verdict: 'WORKS' }).expect(200)
    expect(await BetaRun.countDocuments({ scenario: scenarioId, tester: leaId })).toBe(1)
    expect((await BetaScenario.findById(scenarioId))!.summaryStatus).toBe('OK')
  })

  it('capte le contexte technique sans le demander au testeur', async () => {
    await postVerdict(leaToken, { verdict: 'BROKEN', title: 'Casse', viewportWidth: 390, viewportHeight: 844 })
      .set('User-Agent', 'Mozilla/5.0 (iPhone)')
      .expect(201)
    const run = await BetaRun.findOne({ scenario: scenarioId, tester: leaId })
    expect(run!.context!.userAgent).toContain('iPhone')
    expect(run!.context!.viewportWidth).toBe(390)
  })

  it('ne conserve jamais le lien secret du testeur comme contexte', async () => {
    // Le client envoie naïvement son URL courante ; elle porte le jeton, et
    // finirait recopiée dans l'issue ouverte à la promotion.
    await postVerdict(leaToken, {
      verdict: 'BROKEN',
      title: 'Casse',
      url: `https://venio.paris/beta/${leaToken}`,
    }).expect(201)
    const run = await BetaRun.findOne({ scenario: scenarioId, tester: leaId })
    expect(run!.context!.url).toBeNull()
    expect(JSON.stringify(run!.toObject())).not.toContain(leaToken)
  })

  it('conserve l URL du site reellement teste', async () => {
    await postVerdict(leaToken, { verdict: 'BROKEN', title: 'Casse', url: 'https://exemple.fr/contact' }).expect(201)
    const run = await BetaRun.findOne({ scenario: scenarioId, tester: leaId })
    expect(run!.context!.url).toBe('https://exemple.fr/contact')
  })

  it('refuse un verdict inconnu', async () => {
    await postVerdict(leaToken, { verdict: 'PEUT_ETRE' }).expect(400)
  })

  it('refuse une demarche qui n appartient pas a la campagne', async () => {
    const other = await BetaCampaign.create({
      devProject: new mongoose.Types.ObjectId(),
      name: 'Ailleurs',
      createdBy: actor,
      status: 'RUNNING',
    })
    const foreign = await BetaScenario.create({
      campaign: other._id,
      number: 1,
      identifier: 'BETA-1',
      title: 'Autre chose',
    })
    await postVerdict(leaToken, { verdict: 'WORKS' }, foreign._id).expect(404)
  })

  it('refuse une demarche archivee', async () => {
    await BetaScenario.updateOne({ _id: scenarioId }, { $set: { archivedAt: new Date() } })
    await postVerdict(leaToken, { verdict: 'WORKS' }).expect(404)
  })
})

describe('ce qu un testeur voit des autres', () => {
  beforeEach(async () => {
    await postVerdict(maxToken, {
      verdict: 'BROKEN',
      severity: 'MAJOR',
      title: 'Le bouton ne repond pas',
      body: 'Mon adresse perso max.perso@gmail.test ne recoit rien',
    }).expect(201)
  })

  it('montre le probleme signale sans son auteur ni son recit', async () => {
    const res = await request(app).get(`/api/beta/${leaToken}`).expect(200)
    const [foreign] = res.body.runs.filter((run: { mine: boolean }) => !run.mine)
    expect(foreign.title).toBe('Le bouton ne repond pas')
    expect(foreign.severity).toBe('MAJOR')
    expect(foreign.body).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toContain('max.perso@gmail.test')
    expect(JSON.stringify(res.body)).not.toContain(String(maxId))
  })

  it('permet de confirmer le probleme d un autre', async () => {
    const listed = await request(app).get(`/api/beta/${leaToken}`).expect(200)
    const [foreign] = listed.body.runs.filter((run: { mine: boolean }) => !run.mine)
    const res = await request(app).post(`/api/beta/${leaToken}/runs/${foreign._id}/confirm`).expect(200)
    expect(res.body.run.confirmationCount).toBe(1)
    expect(res.body.run.confirmedByMe).toBe(true)
  })

  it('ne compte pas deux fois la confirmation du meme testeur', async () => {
    const run = await BetaRun.findOne({ tester: maxId })
    await request(app).post(`/api/beta/${leaToken}/runs/${run!._id}/confirm`).expect(200)
    const second = await request(app).post(`/api/beta/${leaToken}/runs/${run!._id}/confirm`).expect(200)
    expect(second.body.run.confirmationCount).toBe(1)
  })

  it('interdit de confirmer son propre retour', async () => {
    const run = await BetaRun.findOne({ tester: maxId })
    await request(app).post(`/api/beta/${maxToken}/runs/${run!._id}/confirm`).expect(400)
  })

  it('interdit de commenter le retour d un autre', async () => {
    const run = await BetaRun.findOne({ tester: maxId })
    await request(app)
      .post(`/api/beta/${leaToken}/runs/${run!._id}/comments`)
      .send({ body: 'Je veux lire ce fil' })
      .expect(404)
  })

  it('laisse commenter son propre retour', async () => {
    const run = await BetaRun.findOne({ tester: maxId })
    const res = await request(app)
      .post(`/api/beta/${maxToken}/runs/${run!._id}/comments`)
      .send({ body: 'Toujours casse aujourd hui' })
      .expect(201)
    expect(res.body.comment.author).toBe('me')
  })
})
