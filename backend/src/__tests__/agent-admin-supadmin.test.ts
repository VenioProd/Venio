import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createAdminTestApp } from './helpers/agentTestApp.js'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import { createSession } from '../lib/session.js'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = await createAdminTestApp()
})
afterAll(async () => teardownMongo())
beforeEach(async () => clearDb())

async function loginAs(role: 'SUPER_ADMIN' | 'ADMIN' | 'RH' | 'VIEWER'): Promise<string> {
  const u = await User.create({
    email: `${role.toLowerCase()}@venio.test`,
    passwordHash: await bcrypt.hash('x', 10),
    name: role,
    role,
  })
  const { token } = await createSession(String(u._id))
  return `venio_session=${token}`
}

describe('Durcissement /api/admin/agent-tokens à SUPER_ADMIN', () => {
  it('rejette une requête non authentifiée avec 401', async () => {
    const res = await request(app).get('/api/admin/agent-tokens')
    expect(res.status).toBe(401)
  })

  it('rejette ADMIN avec 403', async () => {
    const cookie = await loginAs('ADMIN')
    const res = await request(app).get('/api/admin/agent-tokens').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('rejette RH avec 403', async () => {
    const cookie = await loginAs('RH')
    const res = await request(app).get('/api/admin/agent-tokens').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('rejette VIEWER avec 403', async () => {
    const cookie = await loginAs('VIEWER')
    const res = await request(app).get('/api/admin/agent-tokens').set('Cookie', cookie)
    expect(res.status).toBe(403)
  })

  it('accepte SUPER_ADMIN avec 200', async () => {
    const cookie = await loginAs('SUPER_ADMIN')
    const res = await request(app).get('/api/admin/agent-tokens').set('Cookie', cookie)
    expect(res.status).toBe(200)
  })
})
