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
import BetaScenario from '../models/BetaScenario.js'
import BetaTester from '../models/BetaTester.js'
import BetaRun from '../models/BetaRun.js'
import { buildCampaignReportData } from '../lib/beta/report.js'

let app: Express
let adminCookie: string
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
  const admin = await User.create({ name: 'Admin', email: 'admin@example.test', passwordHash, role: 'ADMIN' })
  adminCookie = `venio_session=${(await createSession(String(admin._id))).token}`

  const project = await DevProject.create({ key: 'VNO', name: 'Venio', createdBy: admin._id })
  const campaign = await BetaCampaign.create({
    devProject: project._id,
    name: 'Recette du site',
    createdBy: admin._id,
    status: 'RUNNING',
  })
  campaignId = campaign._id

  const [ok, ko] = await BetaScenario.create([
    { campaign: campaignId, number: 1, identifier: 'BETA-1', title: 'Demander un devis', summaryStatus: 'OK' },
    { campaign: campaignId, number: 2, identifier: 'BETA-2', title: 'Creer un compte', summaryStatus: 'KO' },
  ])
  const tester = await BetaTester.create({
    campaign: campaignId,
    name: 'Lea',
    email: 'lea@example.test',
    tokenHash: 'f'.repeat(64),
  })
  await BetaRun.create([
    { campaign: campaignId, scenario: ok._id, tester: tester._id, verdict: 'WORKS' },
    {
      campaign: campaignId,
      scenario: ko._id,
      tester: tester._id,
      verdict: 'BROKEN',
      severity: 'BLOCKER',
      title: 'Inscription impossible',
    },
  ])
})

describe('donnees du rapport', () => {
  it('compte les demarches par etat', async () => {
    const data = await buildCampaignReportData(String(campaignId))
    expect(data.totals.scenarios).toBe(2)
    expect(data.totals.ok).toBe(1)
    expect(data.totals.ko).toBe(1)
  })

  it('calcule le taux de reussite', async () => {
    const data = await buildCampaignReportData(String(campaignId))
    expect(data.totals.successRate).toBe(50)
  })

  it('liste les retours encore ouverts, du plus grave au moins grave', async () => {
    const data = await buildCampaignReportData(String(campaignId))
    expect(data.openFindings).toHaveLength(1)
    expect(data.openFindings[0]!.title).toBe('Inscription impossible')
  })

  it('rend compte de la participation des testeurs', async () => {
    const data = await buildCampaignReportData(String(campaignId))
    expect(data.testers).toEqual([{ name: 'Lea', tested: 2, total: 2 }])
  })

  it('refuse une campagne inexistante', async () => {
    await expect(buildCampaignReportData(String(new mongoose.Types.ObjectId()))).rejects.toThrow(/introuvable/i)
  })
})

describe('telechargement du rapport', () => {
  it('sert un PDF nomme d apres la campagne', async () => {
    const res = await request(app)
      .get(`/api/admin/beta/campaigns/${campaignId}/report`)
      .set('Cookie', adminCookie)
      .expect(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toContain('Recette')
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF')
  })

  it('refuse une campagne inconnue', async () => {
    await request(app)
      .get(`/api/admin/beta/campaigns/${new mongoose.Types.ObjectId()}/report`)
      .set('Cookie', adminCookie)
      .expect(404)
  })
})
