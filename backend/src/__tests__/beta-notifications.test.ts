import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import betaTesterRoutes from '../routes/beta/index.js'
import Notification from '../models/Notification.js'
import { NOTIFICATION_TYPES } from '../models/NotificationPreferences.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import BetaCampaign from '../models/BetaCampaign.js'
import BetaScenario from '../models/BetaScenario.js'
import BetaTester from '../models/BetaTester.js'
import { createBetaTesterToken, hashBetaTesterToken } from '../lib/beta/tokens.js'

let app: Express
let token: string
let scenarioId: string

/**
 * L'union de types, l'enum du modèle et les préférences sont trois registres
 * distincts, déjà désynchronisés par le passé. On verrouille le nouveau type
 * dans les trois d'un coup.
 */
describe('registres de notification', () => {
  it('declare le retour bloquant dans l enum du modele', () => {
    const values = (Notification.schema.path('type') as unknown as { enumValues: string[] }).enumValues
    expect(values).toContain('BETA_BLOCKING_FEEDBACK')
  })

  it('declare le retour bloquant dans les preferences', () => {
    expect(NOTIFICATION_TYPES).toContain('BETA_BLOCKING_FEEDBACK')
  })
})

describe('alerte sur retour bloquant', () => {
  beforeAll(async () => {
    await setupMongo()
    app = express()
    app.use(express.json())
    app.use('/api/beta', betaTesterRoutes)
  })
  afterAll(teardownMongo)

  beforeEach(async () => {
    await clearDb()
    const passwordHash = await bcrypt.hash('test', 4)
    const admin = await User.create({
      name: 'Admin',
      email: 'admin@example.test',
      passwordHash,
      role: 'ADMIN',
    })
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
    token = createBetaTesterToken()
    await BetaTester.create({
      campaign: campaign._id,
      name: 'Lea',
      email: 'lea@example.test',
      tokenHash: hashBetaTesterToken(token),
    })
  })

  function postVerdict(body: Record<string, unknown>) {
    return request(app).post(`/api/beta/${token}/scenarios/${scenarioId}/runs`).send(body)
  }

  it('previent l equipe quand un testeur signale un blocage', async () => {
    await postVerdict({ verdict: 'BROKEN', severity: 'BLOCKER', title: 'Impossible de valider' }).expect(201)
    const notifications = await Notification.find({ type: 'BETA_BLOCKING_FEEDBACK' })
    expect(notifications).toHaveLength(1)
    expect(notifications[0]!.title).toContain('Impossible de valider')
  })

  it('ne derange personne pour un point cosmetique', async () => {
    await postVerdict({ verdict: 'TO_OPTIMIZE', severity: 'COSMETIC', title: 'Couleur du bouton' }).expect(201)
    expect(await Notification.countDocuments({ type: 'BETA_BLOCKING_FEEDBACK' })).toBe(0)
  })

  it('ne derange personne pour un verdict favorable', async () => {
    await postVerdict({ verdict: 'WORKS' }).expect(201)
    expect(await Notification.countDocuments({ type: 'BETA_BLOCKING_FEEDBACK' })).toBe(0)
  })
})
