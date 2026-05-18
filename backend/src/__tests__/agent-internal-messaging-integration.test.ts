import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import {
  createTestApp,
  createAgentTokenInDb,
  authHeaders,
  uniqueIdempotencyKey,
} from './helpers/agentTestApp.js'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import AgentToken from '../models/AgentToken.js'
import InternalConversation from '../models/InternalConversation.js'
import InternalConversationMember from '../models/InternalConversationMember.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})

afterAll(async () => teardownMongo())

beforeEach(async () => clearDb())

/**
 * Helper : crée un token agent ET son User AGENT lié, comme le ferait le
 * handler POST /admin/agent-tokens.
 *
 * Note : createAgentTokenInDb retourne { id, plainSecret, prefix } — on
 * reconstruit l'objet token via AgentToken.findById pour l'associer à l'user.
 */
async function createAgentTokenWithUser(scopes: string[], name = 'Test Agent') {
  const seeded = await createAgentTokenInDb(scopes)
  const token = await AgentToken.findById(seeded.id)
  const agentUser = await User.create({
    email: `agent-${seeded.id}@venio.internal`,
    passwordHash: await bcrypt.hash('random', 10),
    name,
    role: 'AGENT',
    isActive: true,
    agentTokenId: seeded.id,
  })
  await AgentToken.updateOne({ _id: seeded.id }, { $set: { userId: agentUser._id } })
  return { token, plainSecret: seeded.plainSecret, agentUser }
}

async function createInternalHuman(role: 'SUPER_ADMIN' | 'ADMIN' = 'ADMIN', name = 'Human') {
  return User.create({
    email: `${name.toLowerCase()}@venio.test`,
    passwordHash: await bcrypt.hash('x', 10),
    name,
    role,
    isActive: true,
  })
}

describe('Agent × Messagerie interne', () => {
  // ── Task 18: GET /messaging/users ─────────────────────────────────────────
  it('GET /messaging/users liste les users internes (humains + agents)', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging'])
    await createInternalHuman('ADMIN', 'Alice')
    await createInternalHuman('SUPER_ADMIN', 'Bob')

    const res = await request(app)
      .get('/api/v1/agent/messaging/users')
      .set('Authorization', `Bearer ${plainSecret}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.users)).toBe(true)
    const names = res.body.users.map((u: { name: string }) => u.name)
    expect(names).toContain('Alice')
    expect(names).toContain('Bob')
    expect(names).toContain('Test Agent') // l'agent lui-même
  })

  it('GET /messaging/users sans scope read renvoie 403', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['read:crm'])
    const res = await request(app)
      .get('/api/v1/agent/messaging/users')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('INSUFFICIENT_SCOPE')
  })

  // ── Task 19: GET /conversations + POST /conversations + POST /direct ──────
  it('GET /messaging/conversations retourne #general pour un nouveau token', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging'])
    const res = await request(app)
      .get('/api/v1/agent/messaging/conversations')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.conversations)).toBe(true)
    const slugs = res.body.conversations.map((c: { slug: string | null }) => c.slug)
    expect(slugs).toContain('general')
  })

  it('POST /messaging/conversations crée un channel privé et l\'agent est OWNER', async () => {
    const { plainSecret, agentUser } = await createAgentTokenWithUser(['write:internal-messaging'])
    const human = await createInternalHuman('ADMIN', 'Bob')

    const res = await request(app)
      .post('/api/v1/agent/messaging/conversations')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        type: 'CHANNEL',
        name: 'Agents Channel',
        visibility: 'PRIVATE',
        participantIds: [String(human._id)],
      })
    expect(res.status).toBe(201)
    expect(res.body.conversation.name).toBe('Agents Channel')

    const members = await InternalConversationMember.find({ conversation: res.body.conversation._id }).lean()
    expect(members).toHaveLength(2)
    const owner = members.find((m) => m.user.toString() === String(agentUser._id))
    expect(owner?.role).toBe('OWNER')
  })

  it('POST /messaging/direct crée un DM idempotent (memberKey)', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
    const human = await createInternalHuman('ADMIN', 'Carol')

    const r1 = await request(app)
      .post('/api/v1/agent/messaging/direct')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ participantId: String(human._id) })
    expect(r1.status).toBe(201)
    const convId1 = r1.body.conversation._id

    const r2 = await request(app)
      .post('/api/v1/agent/messaging/direct')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ participantId: String(human._id) })
    expect(r2.status).toBe(201)
    expect(r2.body.conversation._id).toBe(convId1)
  })
})
