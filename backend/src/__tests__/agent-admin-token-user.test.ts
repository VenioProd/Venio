import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createAdminTestApp } from './helpers/agentTestApp.js'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import AgentToken from '../models/AgentToken.js'
import jwt from 'jsonwebtoken'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = await createAdminTestApp()
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
})

async function loginAsSuperAdmin(): Promise<string> {
  const admin = await User.create({
    email: 'super@venio.test',
    passwordHash: await bcrypt.hash('test', 10),
    name: 'Super',
    role: 'SUPER_ADMIN',
  })
  return jwt.sign(
    { id: String(admin._id), email: admin.email, name: admin.name, role: 'SUPER_ADMIN' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  )
}

describe('AgentToken ↔ User AGENT lifecycle', () => {
  it('POST /agent-tokens crée un User AGENT lié et l\'ajoute à #general', async () => {
    const jwtTok = await loginAsSuperAdmin()

    const res = await request(app)
      .post('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${jwtTok}`)
      .send({
        name: 'Kuro Prod',
        scopes: ['read:internal-messaging', 'write:internal-messaging'],
      })

    expect(res.status).toBe(201)
    expect(res.body.plainSecret).toMatch(/^vno_pat_/)
    const tokenId = res.body.token._id

    const tokenInDb = await AgentToken.findById(tokenId).lean()
    expect(tokenInDb!.userId).toBeTruthy()

    const userInDb = await User.findById(tokenInDb!.userId).lean()
    expect(userInDb).toBeTruthy()
    expect(userInDb!.role).toBe('AGENT')
    expect(userInDb!.name).toBe('Kuro Prod')
    expect(userInDb!.isActive).toBe(true)
    expect(userInDb!.agentTokenId!.toString()).toBe(String(tokenId))
    expect(userInDb!.email).toMatch(/^agent-.+@venio\.internal$/)
  })
})
