import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import BetaCampaign from '../models/BetaCampaign.js'
import BetaScenario from '../models/BetaScenario.js'
import BetaTester from '../models/BetaTester.js'
import BetaRun from '../models/BetaRun.js'
import { hashBetaTesterToken } from '../lib/beta/tokens.js'

let app: Express
let adminId: string
let readSecret: string
let writeSecret: string
let crmSecret: string
let projectId: string

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(128)]).toString(
  'base64',
)

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})
afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const admin = await User.create({
    email: 'admin@v.test',
    passwordHash: await bcrypt.hash('x', 10),
    name: 'Admin',
    role: 'SUPER_ADMIN',
  })
  adminId = String(admin._id)
  const project = await DevProject.create({ key: 'VNO', name: 'Venio', createdBy: admin._id })
  projectId = String(project._id)
  ;[readSecret, writeSecret, crmSecret] = await Promise.all([
    createAgentTokenInDb(['read:beta']).then((t) => t.plainSecret),
    createAgentTokenInDb(['read:beta', 'write:beta']).then((t) => t.plainSecret),
    createAgentTokenInDb(['read:crm', 'write:crm']).then((t) => t.plainSecret),
  ])
})

function createCampaign(secret = writeSecret, body: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/v1/agent/beta/campaigns')
    .set(authHeaders(secret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ devProject: projectId, name: 'Recette agent', ...body })
}

describe('Agent / beta — portée des scopes', () => {
  it('refuse un jeton sans scope beta', async () => {
    const res = await request(app).get('/api/v1/agent/beta/campaigns').set(authHeaders(crmSecret)).expect(403)
    expect(res.body.code).toBe('INSUFFICIENT_SCOPE')
  })

  it('laisse lire avec read:beta', async () => {
    await request(app).get('/api/v1/agent/beta/campaigns').set(authHeaders(readSecret)).expect(200)
  })

  it('refuse d ecrire avec le seul read:beta', async () => {
    await createCampaign(readSecret).expect(403)
  })

  it('expose les nouveaux scopes dans la spec publique', async () => {
    const res = await request(app).get('/api/v1/agent/openapi.json').expect(200)
    expect(res.body['x-agent-scopes']).toContain('read:beta')
    expect(res.body['x-agent-scopes']).toContain('write:beta')
    expect(Object.keys(res.body.paths).some((p) => p.includes('beta'))).toBe(true)
  })
})

describe('Agent / beta — campagnes et démarches', () => {
  it('ouvre une campagne et la retrouve dans la liste paginée', async () => {
    const created = await createCampaign().expect(201)
    expect(created.body.name).toBe('Recette agent')

    const list = await request(app).get('/api/v1/agent/beta/campaigns').set(authHeaders(readSecret)).expect(200)
    expect(list.body.items).toHaveLength(1)
    expect(list.body).toMatchObject({ page: 1, total: 1 })
  })

  it('refuse une campagne sans projet dev valide', async () => {
    await createCampaign(writeSecret, { devProject: 'pas-un-id' }).expect(400)
  })

  it('ajoute une démarche avec ses étapes et la numérote', async () => {
    const { body: campaign } = await createCampaign()
    const res = await request(app)
      .post(`/api/v1/agent/beta/campaigns/${campaign._id}/scenarios`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        title: 'Demander un devis',
        steps: [{ instruction: 'Ouvrir /devis', expected: 'Le formulaire s affiche' }],
      })
      .expect(201)
    expect(res.body.identifier).toBe('BETA-1')
    expect(res.body.steps[0].order).toBe(1)
  })

  it('ouvre la campagne aux testeurs', async () => {
    const { body: campaign } = await createCampaign()
    const res = await request(app)
      .patch(`/api/v1/agent/beta/campaigns/${campaign._id}`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ status: 'RUNNING' })
      .expect(200)
    expect(res.body.status).toBe('RUNNING')
  })
})

describe('Agent / beta — testeurs', () => {
  it('invite un testeur et rend son lien une seule fois', async () => {
    const { body: campaign } = await createCampaign()
    const res = await request(app)
      .post(`/api/v1/agent/beta/campaigns/${campaign._id}/testers`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'Lea', email: 'lea@example.test' })
      .expect(201)

    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const stored = await BetaTester.findById(res.body.tester._id)
    expect(stored!.tokenHash).toBe(hashBetaTesterToken(res.body.token))

    const listed = await request(app)
      .get(`/api/v1/agent/beta/campaigns/${campaign._id}/testers`)
      .set(authHeaders(readSecret))
      .expect(200)
    expect(JSON.stringify(listed.body)).not.toContain(res.body.token)
    expect(JSON.stringify(listed.body)).not.toContain(stored!.tokenHash)
  })

  it('revoque un lien', async () => {
    const { body: campaign } = await createCampaign()
    const invited = await request(app)
      .post(`/api/v1/agent/beta/campaigns/${campaign._id}/testers`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'Lea', email: 'lea@example.test' })
    await request(app)
      .post(`/api/v1/agent/beta/testers/${invited.body.tester._id}/revoke`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .expect(200)
    expect((await BetaTester.findById(invited.body.tester._id))!.revokedAt).toBeInstanceOf(Date)
  })
})

describe('Agent / beta — verdicts', () => {
  async function seedScenario() {
    const { body: campaign } = await createCampaign()
    const scenario = await BetaScenario.create({
      campaign: campaign._id,
      number: 1,
      identifier: 'BETA-1',
      title: 'Demander un devis',
    })
    return { campaignId: campaign._id as string, scenarioId: String(scenario._id) }
  }

  it('laisse un agent deposer son propre verdict', async () => {
    const { scenarioId } = await seedScenario()
    const res = await request(app)
      .post(`/api/v1/agent/beta/scenarios/${scenarioId}/runs`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ verdict: 'BROKEN', severity: 'MAJOR', title: 'Le bouton ne repond pas', body: 'Page figee' })
      .expect(201)

    expect(res.body.verdict).toBe('BROKEN')
    const run = await BetaRun.findById(res.body._id)
    // L'agent n'a pas de compte : son verdict est porté par l'utilisateur système.
    expect(run!.user).toBeTruthy()
    expect(run!.tester).toBeNull()
    expect((await BetaScenario.findById(scenarioId))!.summaryStatus).toBe('KO')
  })

  it('revise son verdict au lieu d en empiler un second', async () => {
    const { scenarioId } = await seedScenario()
    const post = () =>
      request(app)
        .post(`/api/v1/agent/beta/scenarios/${scenarioId}/runs`)
        .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    await post().send({ verdict: 'BROKEN', title: 'Casse' }).expect(201)
    await post().send({ verdict: 'WORKS' }).expect(200)
    expect(await BetaRun.countDocuments({ scenario: scenarioId })).toBe(1)
    expect((await BetaScenario.findById(scenarioId))!.summaryStatus).toBe('OK')
  })

  it('liste les retours d une campagne avec leur auteur', async () => {
    const { campaignId, scenarioId } = await seedScenario()
    const tester = await BetaTester.create({
      campaign: campaignId,
      name: 'Lea',
      email: 'lea@example.test',
      tokenHash: 'a'.repeat(64),
    })
    await BetaRun.create({
      campaign: campaignId,
      scenario: scenarioId,
      tester: tester._id,
      verdict: 'BROKEN',
      severity: 'BLOCKER',
      title: 'Panne',
    })
    const res = await request(app)
      .get(`/api/v1/agent/beta/campaigns/${campaignId}/runs`)
      .set(authHeaders(readSecret))
      .expect(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].tester.name).toBe('Lea')
  })

  it('promeut un retour en issue, sans doublon', async () => {
    const { campaignId, scenarioId } = await seedScenario()
    const run = await BetaRun.create({
      campaign: campaignId,
      scenario: scenarioId,
      user: adminId,
      verdict: 'BROKEN',
      severity: 'BLOCKER',
      title: 'Panne bloquante',
    })
    const first = await request(app)
      .post(`/api/v1/agent/beta/runs/${run._id}/promote`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .expect(201)
    expect(first.body.identifier).toBe('VNO-1')

    await request(app)
      .post(`/api/v1/agent/beta/runs/${run._id}/promote`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .expect(200)
    expect(await DevIssue.countDocuments()).toBe(1)
  })

  it('ecrit dans le fil d un retour', async () => {
    const { campaignId, scenarioId } = await seedScenario()
    const run = await BetaRun.create({
      campaign: campaignId,
      scenario: scenarioId,
      user: adminId,
      verdict: 'BROKEN',
      title: 'Panne',
    })
    await request(app)
      .post(`/api/v1/agent/beta/runs/${run._id}/comments`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ body: 'Reproduit en local' })
      .expect(201)
    const listed = await request(app)
      .get(`/api/v1/agent/beta/runs/${run._id}/comments`)
      .set(authHeaders(readSecret))
      .expect(200)
    expect(listed.body.items[0].body).toBe('Reproduit en local')
  })
})

describe('Agent / beta — captures', () => {
  async function runWithShot() {
    const { body: campaign } = await createCampaign()
    const scenario = await BetaScenario.create({
      campaign: campaign._id,
      number: 1,
      identifier: 'BETA-1',
      title: 'Demander un devis',
    })
    const run = await BetaRun.create({
      campaign: campaign._id,
      scenario: scenario._id,
      user: adminId,
      verdict: 'BROKEN',
      title: 'Panne',
    })
    const upload = await request(app)
      .post(`/api/v1/agent/beta/runs/${run._id}/attachments`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ filename: 'capture.png', contentBase64: png })
    return { runId: String(run._id), upload }
  }

  it('depose une capture en base64', async () => {
    const { upload } = await runWithShot()
    expect(upload.status).toBe(201)
    expect(upload.body.mimeType).toBe('image/png')
  })

  it('relit la capture en binaire', async () => {
    const { runId, upload } = await runWithShot()
    const res = await request(app)
      .get(`/api/v1/agent/beta/runs/${runId}/attachments/${upload.body._id}`)
      .set(authHeaders(readSecret))
      .expect(200)
    expect(res.headers['content-type']).toBe('image/png')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('refuse un SVG deguise en PNG', async () => {
    const { body: campaign } = await createCampaign()
    const scenario = await BetaScenario.create({
      campaign: campaign._id,
      number: 1,
      identifier: 'BETA-1',
      title: 'X',
    })
    const run = await BetaRun.create({
      campaign: campaign._id,
      scenario: scenario._id,
      user: adminId,
      verdict: 'BROKEN',
      title: 'Panne',
    })
    await request(app)
      .post(`/api/v1/agent/beta/runs/${run._id}/attachments`)
      .set(authHeaders(writeSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        filename: 'capture.png',
        contentBase64: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64'),
      })
      .expect(400)
  })
})

describe('Agent / beta — rapport', () => {
  it('sert le rapport de campagne en PDF', async () => {
    const { body: campaign } = await createCampaign()
    const res = await request(app)
      .get(`/api/v1/agent/beta/campaigns/${campaign._id}/report`)
      .set(authHeaders(readSecret))
      .expect(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF')
  })
})
