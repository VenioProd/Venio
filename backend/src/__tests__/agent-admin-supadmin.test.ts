import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createAdminTestApp } from './helpers/agentTestApp.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

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
  return jwt.sign(
    { id: String(u._id), email: u.email, name: u.name, role, sessionVersion: u.sessionVersion },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  )
}

describe('Durcissement /api/admin/agent-tokens à SUPER_ADMIN', () => {
  it('rejette ADMIN avec 403', async () => {
    const tok = await loginAs('ADMIN')
    const res = await request(app)
      .get('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${tok}`)
    expect(res.status).toBe(403)
  })

  it('rejette RH avec 403', async () => {
    const tok = await loginAs('RH')
    const res = await request(app)
      .get('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${tok}`)
    expect(res.status).toBe(403)
  })

  it('rejette VIEWER avec 403', async () => {
    const tok = await loginAs('VIEWER')
    const res = await request(app)
      .get('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${tok}`)
    expect(res.status).toBe(403)
  })

  it('accepte SUPER_ADMIN avec 200', async () => {
    const tok = await loginAs('SUPER_ADMIN')
    const res = await request(app)
      .get('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${tok}`)
    expect(res.status).toBe(200)
  })
})
