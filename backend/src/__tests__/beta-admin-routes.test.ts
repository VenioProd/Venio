import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import betaRoutes from '../routes/admin/beta/index.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import BetaTester from '../models/BetaTester.js'
import { hashBetaTesterToken } from '../lib/beta/tokens.js'

let app: Express
let adminCookie: string
let viewerCookie: string
let commercialCookie: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

function createCampaign(cookie = adminCookie, body: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/admin/beta/campaigns')
    .set('Cookie', cookie)
    .send({ devProject: projectId, name: 'Recette du site', ...body })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/beta', betaRoutes)
})
afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, viewer, commercial] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'ADMIN' },
    { name: 'Viewer', email: 'viewer@example.test', passwordHash, role: 'VIEWER' },
    { name: 'Commercial', email: 'com@example.test', passwordHash, role: 'COMMERCIAL' },
  ])
  ;[adminCookie, viewerCookie, commercialCookie] = await Promise.all([
    cookieFor(String(admin._id)),
    cookieFor(String(viewer._id)),
    cookieFor(String(commercial._id)),
  ])
  const project = await DevProject.create({ key: 'VNO', name: 'Venio', createdBy: admin._id })
  projectId = String(project._id)
})

describe('acces a l espace beta', () => {
  it('refuse un visiteur sans session', async () => {
    await request(app).get('/api/admin/beta/campaigns').expect(401)
  })

  it('refuse un role sans permission beta', async () => {
    await request(app).get('/api/admin/beta/campaigns').set('Cookie', commercialCookie).expect(403)
  })

  it('laisse un lecteur consulter les campagnes', async () => {
    await request(app).get('/api/admin/beta/campaigns').set('Cookie', viewerCookie).expect(200)
  })

  it('interdit au lecteur d ouvrir une campagne', async () => {
    await createCampaign(viewerCookie).expect(403)
  })
})

describe('campagnes', () => {
  it('ouvre une campagne rattachee a un projet dev', async () => {
    const res = await createCampaign().expect(201)
    expect(res.body.campaign.name).toBe('Recette du site')
    expect(res.body.campaign.status).toBe('DRAFT')
  })

  it('refuse une campagne sans projet dev existant', async () => {
    await createCampaign(adminCookie, { devProject: '507f1f77bcf86cd799439011' }).expect(400)
  })

  it('refuse un identifiant de projet qui n en est pas un', async () => {
    await createCampaign(adminCookie, { devProject: 'pas-un-id' }).expect(400)
  })

  it('refuse une campagne sans nom', async () => {
    await createCampaign(adminCookie, { name: '   ' }).expect(400)
  })
})

describe('demarches a tester', () => {
  it('numerote les demarches dans l ordre de creation', async () => {
    const { body } = await createCampaign()
    const id = body.campaign._id
    const first = await request(app)
      .post(`/api/admin/beta/campaigns/${id}/scenarios`)
      .set('Cookie', adminCookie)
      .send({ title: 'Demander un devis' })
      .expect(201)
    const second = await request(app)
      .post(`/api/admin/beta/campaigns/${id}/scenarios`)
      .set('Cookie', adminCookie)
      .send({ title: 'Creer un compte' })
      .expect(201)
    expect(first.body.scenario.identifier).toBe('BETA-1')
    expect(second.body.scenario.identifier).toBe('BETA-2')
  })

  it('conserve les etapes guidees dans l ordre', async () => {
    const { body } = await createCampaign()
    const res = await request(app)
      .post(`/api/admin/beta/campaigns/${body.campaign._id}/scenarios`)
      .set('Cookie', adminCookie)
      .send({
        title: 'Demander un devis',
        steps: [
          { instruction: 'Ouvrir /devis', expected: 'Le formulaire s affiche' },
          { instruction: 'Valider', expected: 'Un accuse arrive' },
        ],
      })
      .expect(201)
    expect(res.body.scenario.steps).toHaveLength(2)
    expect(res.body.scenario.steps[0].order).toBe(1)
    expect(res.body.scenario.steps[1].order).toBe(2)
  })
})

describe('invitation des testeurs', () => {
  function invite(campaignId: string, email = 'lea@example.test') {
    return request(app)
      .post(`/api/admin/beta/campaigns/${campaignId}/testers`)
      .set('Cookie', adminCookie)
      .send({ name: 'Lea', email })
  }

  it('rend le lien une seule fois, a la creation', async () => {
    const { body } = await createCampaign()
    const res = await invite(body.campaign._id).expect(201)
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const stored = await BetaTester.findById(res.body.tester._id)
    expect(stored!.tokenHash).toBe(hashBetaTesterToken(res.body.token))

    const listed = await request(app)
      .get(`/api/admin/beta/campaigns/${body.campaign._id}`)
      .set('Cookie', adminCookie)
      .expect(200)
    expect(JSON.stringify(listed.body)).not.toContain(res.body.token)
    expect(JSON.stringify(listed.body)).not.toContain(stored!.tokenHash)
  })

  it('refuse d inviter deux fois la meme adresse', async () => {
    const { body } = await createCampaign()
    await invite(body.campaign._id).expect(201)
    await invite(body.campaign._id).expect(409)
  })

  it('refuse une adresse invalide', async () => {
    const { body } = await createCampaign()
    await invite(body.campaign._id, 'pas-une-adresse').expect(400)
  })

  it('revoque un lien sans supprimer les retours du testeur', async () => {
    const { body } = await createCampaign()
    const invited = await invite(body.campaign._id).expect(201)
    await request(app)
      .post(`/api/admin/beta/testers/${invited.body.tester._id}/revoke`)
      .set('Cookie', adminCookie)
      .expect(200)
    const stored = await BetaTester.findById(invited.body.tester._id)
    expect(stored!.revokedAt).toBeInstanceOf(Date)
  })

  it('regenere un lien en invalidant le precedent', async () => {
    const { body } = await createCampaign()
    const invited = await invite(body.campaign._id).expect(201)
    const rotated = await request(app)
      .post(`/api/admin/beta/testers/${invited.body.tester._id}/rotate`)
      .set('Cookie', adminCookie)
      .expect(200)
    expect(rotated.body.token).not.toBe(invited.body.token)
    const stored = await BetaTester.findById(invited.body.tester._id)
    expect(stored!.tokenHash).toBe(hashBetaTesterToken(rotated.body.token))
    expect(stored!.tokenHash).not.toBe(hashBetaTesterToken(invited.body.token))
  })

  it('interdit au lecteur d inviter', async () => {
    const { body } = await createCampaign()
    await request(app)
      .post(`/api/admin/beta/campaigns/${body.campaign._id}/testers`)
      .set('Cookie', viewerCookie)
      .send({ name: 'Lea', email: 'lea@example.test' })
      .expect(403)
  })
})
