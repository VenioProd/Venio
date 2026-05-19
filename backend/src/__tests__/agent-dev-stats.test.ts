import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'

let app: Express
let systemUserId: mongoose.Types.ObjectId

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})
afterAll(async () => { await teardownMongo() })

beforeEach(async () => {
  await clearDb()
  const u = await User.create({
    email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x',
  })
  systemUserId = u._id as mongoose.Types.ObjectId
})

describe('GET /api/v1/agent/dev/stats', () => {
  it('401 without token', async () => {
    await request(app).get('/api/v1/agent/dev/stats').expect(401)
  })

  it('403 with wrong scope', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    await request(app)
      .get('/api/v1/agent/dev/stats')
      .set(authHeaders(plainSecret))
      .expect(403)
  })

  it('200 with read:dev, returns enriched stats payload', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:dev'])
    const res = await request(app)
      .get('/api/v1/agent/dev/stats')
      .set(authHeaders(plainSecret))
      .expect(200)
    expect(res.body).toMatchObject({
      total: 0, open: 0, urgent: 0, blocked: 0,
      completed7d: 0, completed14d: 0, velocity14d: 0,
    })
  })
})

describe('GET /api/v1/agent/dev/overview', () => {
  it('200 with read:dev returns kpis + projects', async () => {
    const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
    await DevIssue.create({
      project: p._id, identifier: 'VEN-1', title: 'T', number: 1,
      status: 'IN_PROGRESS', priority: 'URGENT', type: 'TASK',
      reporter: systemUserId, labels: ['blocked'],
    })
    const { plainSecret } = await createAgentTokenInDb(['read:dev'])
    const res = await request(app)
      .get('/api/v1/agent/dev/overview')
      .set(authHeaders(plainSecret))
      .expect(200)
    expect(res.body.projects).toHaveLength(1)
    expect(res.body.projects[0]).toMatchObject({
      key: 'VEN', health: 'blocked',
    })
    expect(res.body.kpis).toMatchObject({ urgent: 1, blocked: 1 })
  })

  it('403 without read:dev', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    await request(app)
      .get('/api/v1/agent/dev/overview')
      .set(authHeaders(plainSecret))
      .expect(403)
  })
})
