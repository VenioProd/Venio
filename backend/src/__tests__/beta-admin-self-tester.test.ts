import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import betaRoutes from '../routes/admin/beta/index.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import BetaCampaign from '../models/BetaCampaign.js'
import BetaTester from '../models/BetaTester.js'
import { hashBetaTesterToken } from '../lib/beta/tokens.js'
import { resolveBetaTester } from '../lib/beta/testerAuth.js'

let app: Express
let adminCookie: string
let viewerCookie: string
let commercialCookie: string
let adminId: string
let campaignId: mongoose.Types.ObjectId

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
    { name: 'Raphael Bentv', email: 'raphael@venio.test', passwordHash, role: 'ADMIN' },
    { name: 'Lectrice', email: 'lectrice@venio.test', passwordHash, role: 'VIEWER' },
    { name: 'Commercial', email: 'com@venio.test', passwordHash, role: 'COMMERCIAL' },
  ])
  adminId = String(admin._id)
  const sessions = await Promise.all([
    createSession(adminId),
    createSession(String(viewer._id)),
    createSession(String(commercial._id)),
  ])
  ;[adminCookie, viewerCookie, commercialCookie] = sessions.map((s) => `venio_session=${s.token}`)

  const project = await DevProject.create({ key: 'VNO', name: 'Venio', createdBy: admin._id })
  const campaign = await BetaCampaign.create({
    devProject: project._id,
    name: 'Recette',
    createdBy: admin._id,
    status: 'RUNNING',
  })
  campaignId = campaign._id
})

const join = (cookie: string) =>
  request(app).post(`/api/admin/beta/campaigns/${campaignId}/testers/me`).set('Cookie', cookie)

describe('un membre de l equipe se declare testeur', () => {
  it('cree son acces a partir de son propre compte, sans rien saisir', async () => {
    const res = await join(adminCookie).expect(201)
    expect(res.body.tester.name).toBe('Raphael Bentv')
    expect(res.body.tester.email).toBe('raphael@venio.test')
    expect(res.body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('produit un lien qui ouvre reellement la campagne', async () => {
    const res = await join(adminCookie).expect(201)
    const resolved = await resolveBetaTester(res.body.token)
    expect(resolved).not.toBeNull()
    expect(resolved!.tester.name).toBe('Raphael Bentv')
  })

  it('rattache le testeur au compte, pour le reconnaitre comme membre de l equipe', async () => {
    const res = await join(adminCookie).expect(201)
    const stored = await BetaTester.findById(res.body.tester._id)
    expect(String(stored!.user)).toBe(adminId)
  })

  it('ne stocke que l empreinte du lien', async () => {
    const res = await join(adminCookie).expect(201)
    const stored = await BetaTester.findById(res.body.tester._id)
    expect(stored!.tokenHash).toBe(hashBetaTesterToken(res.body.token))
    expect(JSON.stringify(res.body.tester)).not.toContain(stored!.tokenHash)
  })

  it('refuse de s inscrire deux fois plutot que de creer un doublon', async () => {
    await join(adminCookie).expect(201)
    const res = await join(adminCookie).expect(409)
    expect(res.body.error).toMatch(/participez déjà|déjà/i)
    expect(await BetaTester.countDocuments({ campaign: campaignId })).toBe(1)
  })

  it('laisse un simple lecteur participer : tester n est pas piloter', async () => {
    await join(viewerCookie).expect(201)
  })

  it('refuse un role sans acces a l espace beta', async () => {
    await join(commercialCookie).expect(403)
  })

  it('refuse une campagne inconnue', async () => {
    await request(app)
      .post(`/api/admin/beta/campaigns/${new mongoose.Types.ObjectId()}/testers/me`)
      .set('Cookie', adminCookie)
      .expect(404)
  })

  it('signale les membres de l equipe dans la liste des testeurs', async () => {
    await join(adminCookie).expect(201)
    const res = await request(app).get(`/api/admin/beta/campaigns/${campaignId}`).set('Cookie', adminCookie).expect(200)
    expect(res.body.testers[0].isTeamMember).toBe(true)
  })

  it('ne marque pas un testeur externe comme membre de l equipe', async () => {
    await request(app)
      .post(`/api/admin/beta/campaigns/${campaignId}/testers`)
      .set('Cookie', adminCookie)
      .send({ name: 'Lea', email: 'lea@example.test' })
      .expect(201)
    const res = await request(app).get(`/api/admin/beta/campaigns/${campaignId}`).set('Cookie', adminCookie).expect(200)
    expect(res.body.testers[0].isTeamMember).toBe(false)
  })
})
