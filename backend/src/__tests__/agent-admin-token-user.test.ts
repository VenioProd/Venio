import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createAdminTestApp } from './helpers/agentTestApp.js'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import AgentToken from '../models/AgentToken.js'
import jwt from 'jsonwebtoken'

// Garantit que le middleware auth peut vérifier les tokens JWT dans les tests
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

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
  it('supprime le User AGENT si la création du Token échoue', async () => {
    const jwtTok = await loginAsSuperAdmin()

    // Provoque une erreur en envoyant un scope inconnu, qui passe les validators
    // mais déclenche findUnknownScopes côté handler.
    const res = await request(app)
      .post('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${jwtTok}`)
      .send({ name: 'Bad', scopes: ['scope:inexistant'] })

    expect(res.status).toBe(400)
    // Pas de user orphelin avec role AGENT
    const agentUsers = await User.find({ role: 'AGENT' }).lean()
    expect(agentUsers).toHaveLength(0)
  })

  it('PATCH renomme aussi le User AGENT lié', async () => {
    const jwtTok = await loginAsSuperAdmin()
    const created = await request(app)
      .post('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${jwtTok}`)
      .send({ name: 'Old name', scopes: ['read:crm'] })
    const tokenId = created.body.token._id
    const userId = (await AgentToken.findById(tokenId).lean())!.userId

    const patchRes = await request(app)
      .patch(`/api/admin/agent-tokens/${tokenId}`)
      .set('Authorization', `Bearer ${jwtTok}`)
      .send({ name: 'New name' })
    expect(patchRes.status).toBe(200)

    const user = await User.findById(userId).lean()
    expect(user!.name).toBe('New name')
  })

  it('revoke désactive le User AGENT lié et préfixe son nom', async () => {
    const jwtTok = await loginAsSuperAdmin()
    const created = await request(app)
      .post('/api/admin/agent-tokens')
      .set('Authorization', `Bearer ${jwtTok}`)
      .send({ name: 'ToRevoke', scopes: ['read:crm'] })
    const tokenId = created.body.token._id
    const userId = (await AgentToken.findById(tokenId).lean())!.userId

    const revokeRes = await request(app)
      .post(`/api/admin/agent-tokens/${tokenId}/revoke`)
      .set('Authorization', `Bearer ${jwtTok}`)
      .send({})
    expect(revokeRes.status).toBe(200)

    const user = await User.findById(userId).lean()
    expect(user!.isActive).toBe(false)
    expect(user!.name).toBe('[Révoqué] ToRevoke')
  })

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
