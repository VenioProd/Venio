import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import devRoutes from '../routes/admin/dev/index.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import BetaCampaign from '../models/BetaCampaign.js'
import BetaScenario from '../models/BetaScenario.js'
import BetaTester from '../models/BetaTester.js'
import BetaRun from '../models/BetaRun.js'
import { promoteRunToIssue } from '../lib/beta/promote.js'

let app: Express
let adminCookie: string
let adminId: string
let scenarioId: string
let runId: string
let issueId: string

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/dev', devRoutes)
})
afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const admin = await User.create({ name: 'Admin', email: 'admin@example.test', passwordHash, role: 'ADMIN' })
  adminId = String(admin._id)
  adminCookie = `venio_session=${(await createSession(adminId)).token}`

  const project = await DevProject.create({ key: 'VNO', name: 'Venio', createdBy: admin._id })
  const campaign = await BetaCampaign.create({
    devProject: project._id,
    name: 'Recette',
    createdBy: admin._id,
    status: 'RUNNING',
  })
  const scenario = await BetaScenario.create({
    campaign: campaign._id,
    number: 1,
    identifier: 'BETA-1',
    title: 'Demander un devis',
  })
  scenarioId = String(scenario._id)
  const tester = await BetaTester.create({
    campaign: campaign._id,
    name: 'Lea',
    email: 'lea@example.test',
    tokenHash: 'e'.repeat(64),
  })
  const run = await BetaRun.create({
    campaign: campaign._id,
    scenario: scenario._id,
    tester: tester._id,
    verdict: 'BROKEN',
    severity: 'MAJOR',
    title: 'Le bouton ne repond pas',
  })
  runId = String(run._id)
  issueId = String((await promoteRunToIssue({ runId, actorId: adminId }))._id)
})

function patchIssue(status: string) {
  return request(app).patch(`/api/admin/dev/issues/${issueId}`).set('Cookie', adminCookie).send({ status })
}

describe('quand une issue issue du beta test se resout', () => {
  it('marque le retour corrige et redemande une validation', async () => {
    await patchIssue('DONE').expect(200)
    expect((await BetaRun.findById(runId))!.status).toBe('FIXED')
    expect((await BetaScenario.findById(scenarioId))!.summaryStatus).toBe('TO_RETEST')
  })

  it('ne bouge pas tant que l issue n est pas resolue', async () => {
    await patchIssue('IN_PROGRESS').expect(200)
    expect((await BetaRun.findById(runId))!.status).toBe('ACKNOWLEDGED')
    expect((await BetaScenario.findById(scenarioId))!.summaryStatus).toBe('KO')
  })

  it('ne rouvre pas la demarche si l issue est annulee', async () => {
    await patchIssue('CANCELLED').expect(200)
    expect((await BetaRun.findById(runId))!.status).toBe('ACKNOWLEDGED')
  })
})
