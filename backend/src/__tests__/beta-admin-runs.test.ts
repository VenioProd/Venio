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
import DevIssue from '../models/DevIssue.js'
import BetaCampaign from '../models/BetaCampaign.js'
import BetaScenario from '../models/BetaScenario.js'
import BetaTester from '../models/BetaTester.js'
import BetaRun from '../models/BetaRun.js'
import BetaComment from '../models/BetaComment.js'

let app: Express
let adminCookie: string
let viewerCookie: string
let campaignId: mongoose.Types.ObjectId
let scenarioId: mongoose.Types.ObjectId
let runId: mongoose.Types.ObjectId

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
  const [admin, viewer] = await User.create([
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'ADMIN' },
    { name: 'Viewer', email: 'viewer@example.test', passwordHash, role: 'VIEWER' },
  ])
  const sessions = await Promise.all([createSession(String(admin._id)), createSession(String(viewer._id))])
  adminCookie = `venio_session=${sessions[0].token}`
  viewerCookie = `venio_session=${sessions[1].token}`

  const project = await DevProject.create({ key: 'VNO', name: 'Venio', createdBy: admin._id })
  const campaign = await BetaCampaign.create({
    devProject: project._id,
    name: 'Recette',
    createdBy: admin._id,
    status: 'RUNNING',
  })
  campaignId = campaign._id
  const scenario = await BetaScenario.create({
    campaign: campaignId,
    number: 1,
    identifier: 'BETA-1',
    title: 'Demander un devis',
  })
  scenarioId = scenario._id
  const tester = await BetaTester.create({
    campaign: campaignId,
    name: 'Lea',
    email: 'lea@example.test',
    tokenHash: 'c'.repeat(64),
  })
  const run = await BetaRun.create({
    campaign: campaignId,
    scenario: scenarioId,
    tester: tester._id,
    verdict: 'BROKEN',
    severity: 'BLOCKER',
    title: 'Le bouton ne repond pas',
    body: 'Page blanche',
  })
  runId = run._id
})

describe('file des retours', () => {
  it('montre a l equipe le retour complet et son auteur', async () => {
    const res = await request(app)
      .get(`/api/admin/beta/campaigns/${campaignId}/runs`)
      .set('Cookie', adminCookie)
      .expect(200)
    expect(res.body.runs).toHaveLength(1)
    expect(res.body.runs[0].body).toBe('Page blanche')
    expect(res.body.runs[0].tester.name).toBe('Lea')
  })

  it('trie les retours du plus grave au moins grave', async () => {
    const other = await BetaTester.create({
      campaign: campaignId,
      name: 'Max',
      email: 'max@example.test',
      tokenHash: 'd'.repeat(64),
    })
    await BetaRun.create({
      campaign: campaignId,
      scenario: scenarioId,
      tester: other._id,
      verdict: 'TO_OPTIMIZE',
      severity: 'COSMETIC',
      title: 'Couleur du bouton',
    })
    const res = await request(app)
      .get(`/api/admin/beta/campaigns/${campaignId}/runs`)
      .set('Cookie', adminCookie)
      .expect(200)
    expect(res.body.runs.map((run: { severity: string }) => run.severity)).toEqual(['BLOCKER', 'COSMETIC'])
  })

  it('permet de ne garder que les retours a traiter', async () => {
    await BetaRun.updateOne({ _id: runId }, { $set: { status: 'REJECTED' } })
    const res = await request(app)
      .get(`/api/admin/beta/campaigns/${campaignId}/runs?status=open`)
      .set('Cookie', adminCookie)
      .expect(200)
    expect(res.body.runs).toHaveLength(0)
  })
})

describe('traitement d un retour', () => {
  it('classe un retour sans suite et reverdit la demarche', async () => {
    await request(app)
      .patch(`/api/admin/beta/runs/${runId}`)
      .set('Cookie', adminCookie)
      .send({ status: 'REJECTED' })
      .expect(200)
    expect((await BetaScenario.findById(scenarioId))!.summaryStatus).toBe('NOT_TESTED')
  })

  it('refuse un statut inconnu', async () => {
    await request(app)
      .patch(`/api/admin/beta/runs/${runId}`)
      .set('Cookie', adminCookie)
      .send({ status: 'PEUT_ETRE' })
      .expect(400)
  })

  it('interdit au lecteur de trancher', async () => {
    await request(app)
      .patch(`/api/admin/beta/runs/${runId}`)
      .set('Cookie', viewerCookie)
      .send({ status: 'REJECTED' })
      .expect(403)
  })

  it('ouvre une issue pre-remplie depuis le retour', async () => {
    const res = await request(app).post(`/api/admin/beta/runs/${runId}/promote`).set('Cookie', adminCookie).expect(201)
    expect(res.body.issue.identifier).toBe('VNO-1')
    expect(res.body.issue.priority).toBe('URGENT')
    expect(await DevIssue.countDocuments()).toBe(1)
  })

  it('ne rouvre pas une seconde issue pour le meme retour', async () => {
    await request(app).post(`/api/admin/beta/runs/${runId}/promote`).set('Cookie', adminCookie).expect(201)
    await request(app).post(`/api/admin/beta/runs/${runId}/promote`).set('Cookie', adminCookie).expect(200)
    expect(await DevIssue.countDocuments()).toBe(1)
  })

  it('refuse de promouvoir un retour favorable', async () => {
    await BetaRun.updateOne({ _id: runId }, { $set: { verdict: 'WORKS' } })
    await request(app).post(`/api/admin/beta/runs/${runId}/promote`).set('Cookie', adminCookie).expect(400)
  })
})

describe('fil de discussion cote equipe', () => {
  it('repond au testeur', async () => {
    const res = await request(app)
      .post(`/api/admin/beta/runs/${runId}/comments`)
      .set('Cookie', adminCookie)
      .send({ body: 'Merci, on regarde' })
      .expect(201)
    expect(res.body.comment.visibleToTester).toBe(true)
  })

  it('garde une note pour l equipe seule', async () => {
    await request(app)
      .post(`/api/admin/beta/runs/${runId}/comments`)
      .set('Cookie', adminCookie)
      .send({ body: 'Sans doute un cache CDN', visibleToTester: false })
      .expect(201)
    const stored = await BetaComment.findOne({ run: runId })
    expect(stored!.visibleToTester).toBe(false)
  })

  it('refuse un message vide', async () => {
    await request(app)
      .post(`/api/admin/beta/runs/${runId}/comments`)
      .set('Cookie', adminCookie)
      .send({ body: '   ' })
      .expect(400)
  })

  it('montre a l equipe le fil complet, notes internes comprises', async () => {
    await BetaComment.create({
      run: runId,
      campaign: campaignId,
      authorUser: new mongoose.Types.ObjectId(),
      body: 'Note interne',
      visibleToTester: false,
    })
    const res = await request(app).get(`/api/admin/beta/runs/${runId}/comments`).set('Cookie', adminCookie).expect(200)
    expect(res.body.comments).toHaveLength(1)
    expect(res.body.comments[0].body).toBe('Note interne')
  })
})
