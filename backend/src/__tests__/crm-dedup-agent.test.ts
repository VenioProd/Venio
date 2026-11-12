import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import CrmSettings from '../models/CrmSettings.js'

/** Chantier 3B — détection de doublons à la création par l'API agent. */

let app: Express
let secret: string

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})
afterAll(async () => {
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
  await User.create({
    email: 'admin@venio.test',
    passwordHash: await bcrypt.hash('test', 10),
    name: 'Admin',
    role: 'SUPER_ADMIN',
  })
  await CrmSettings.create({
    roundRobinEnabled: false,
    duplicateDetectionEnabled: true,
    duplicateCheckCompany: true,
    duplicateCheckEmail: true,
  })
  secret = (await createAgentTokenInDb(['write:crm', 'read:crm'])).plainSecret
})

const create = (body: Record<string, unknown>) =>
  request(app)
    .post('/api/v1/agent/leads')
    .set(authHeaders(secret, { idempotencyKey: uniqueIdempotencyKey() }))
    .send(body)

describe('agent POST /leads et doublons', () => {
  it('forme historique sans doublon : pas de champ duplicates', async () => {
    const res = await create({ company: 'Unique' }).expect(201)
    expect(res.body).not.toHaveProperty('duplicates')
    expect(res.body.contactEmailNormalized).toBe('')
  })

  it('signale les doublons probables sans bloquer, champs normalisés posés', async () => {
    const existing = await Lead.create({ company: 'Acme', contactEmail: 'a@acme.fr' })
    const res = await create({ company: 'Autre', contactEmail: 'A@Acme.fr' }).expect(201)
    expect(res.body.contactEmailNormalized).toBe('a@acme.fr')
    expect(res.body.duplicates.map((d: { _id: string }) => d._id)).toEqual([String(existing._id)])
    expect(await Lead.countDocuments()).toBe(2)
  })

  it('duplicateBlockOnCreate : 409 DUPLICATE_LEAD', async () => {
    await CrmSettings.updateSettings({ duplicateBlockOnCreate: true } as never)
    await Lead.create({ company: 'Acme' })
    const res = await create({ company: 'ACME' }).expect(409)
    expect(res.body.code).toBe('DUPLICATE_LEAD')
    expect(await Lead.countDocuments()).toBe(1)
  })
})
