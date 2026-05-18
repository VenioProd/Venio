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
import InternalMessage from '../models/InternalMessage.js'

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

  // ── Task 20: GET messages + POST message texte ────────────────────────────
  it('Envoi puis lecture d\'un message texte dans une conv', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging', 'write:internal-messaging'])
    const human = await createInternalHuman('ADMIN', 'Dana')

    const dm = await request(app)
      .post('/api/v1/agent/messaging/direct')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ participantId: String(human._id) })
    expect(dm.status).toBe(201)
    const convId = dm.body.conversation._id

    const send = await request(app)
      .post(`/api/v1/agent/messaging/conversations/${convId}/messages`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'Hello world' })
    expect(send.status).toBe(201)
    expect(send.body.message.content).toBe('Hello world')

    const list = await request(app)
      .get(`/api/v1/agent/messaging/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(list.status).toBe(200)
    expect(list.body.messages).toHaveLength(1)
    expect(list.body.messages[0].content).toBe('Hello world')
  })

  it('Channel privé non-membre → 404', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging'])
    const stranger = await createInternalHuman('ADMIN', 'Stranger')

    const channel = await InternalConversation.create({
      type: 'CHANNEL',
      name: 'secret',
      slug: 'secret',
      visibility: 'PRIVATE',
      createdBy: stranger._id,
    })
    await InternalConversationMember.create({ conversation: channel._id, user: stranger._id, role: 'OWNER' })

    const res = await request(app)
      .get(`/api/v1/agent/messaging/conversations/${channel._id}/messages`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(404)
  })

  // ── Task 21: POST /read + GET /search ─────────────────────────────────────
  it('POST /read remet le unreadCount à 0', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging', 'write:internal-messaging'])
    const human = await createInternalHuman('ADMIN', 'Eve')

    const dm = await InternalConversation.create({ type: 'DM', visibility: 'PRIVATE', memberKey: 'x', createdBy: human._id })
    await InternalConversationMember.create({ conversation: dm._id, user: human._id, role: 'OWNER' })

    const agentUser = await User.findOne({ role: 'AGENT' })
    await InternalConversationMember.create({ conversation: dm._id, user: agentUser!._id, role: 'MEMBER' })

    await InternalMessage.create({ conversation: dm._id, sender: human._id, content: 'Coucou agent', mentions: [] })

    const before = await request(app)
      .get('/api/v1/agent/messaging/conversations')
      .set('Authorization', `Bearer ${plainSecret}`)
    const dmBefore = before.body.conversations.find((c: { _id: string }) => c._id === String(dm._id))
    expect(dmBefore?.unreadCount).toBe(1)

    const read = await request(app)
      .post(`/api/v1/agent/messaging/conversations/${dm._id}/read`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({})
    expect(read.status).toBe(200)

    const after = await request(app)
      .get('/api/v1/agent/messaging/conversations')
      .set('Authorization', `Bearer ${plainSecret}`)
    const dmAfter = after.body.conversations.find((c: { _id: string }) => c._id === String(dm._id))
    expect(dmAfter?.unreadCount).toBe(0)
  })

  it('GET /search trouve un message par contenu', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['read:internal-messaging', 'write:internal-messaging'])
    const human = await createInternalHuman('ADMIN', 'Frank')

    const dm = await request(app)
      .post('/api/v1/agent/messaging/direct')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ participantId: String(human._id) })
    await request(app)
      .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/messages`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'mot-clef-trouvable' })

    const res = await request(app)
      .get('/api/v1/agent/messaging/search?q=mot-clef')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(res.body.results.length).toBeGreaterThan(0)
  })

  // ── Task 22: PATCH / DELETE + reactions ───────────────────────────────────
  it('PATCH message : agent peut éditer SES messages', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
    const human = await createInternalHuman('ADMIN', 'Gina')

    const dm = await request(app)
      .post('/api/v1/agent/messaging/direct')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ participantId: String(human._id) })
    const send = await request(app)
      .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/messages`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'Avant édition' })

    const patch = await request(app)
      .patch(`/api/v1/agent/messaging/messages/${send.body.message._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'Après édition' })
    expect(patch.status).toBe(200)
    expect(patch.body.message.content).toBe('Après édition')
    expect(patch.body.message.editedAt).toBeTruthy()
  })

  it('PATCH message d\'un autre user → 404', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
    const human = await createInternalHuman('ADMIN', 'Hugo')

    const dm = await request(app)
      .post('/api/v1/agent/messaging/direct')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ participantId: String(human._id) })
    const humanMsg = await InternalMessage.create({
      conversation: dm.body.conversation._id,
      sender: human._id,
      content: 'message humain',
    })

    const patch = await request(app)
      .patch(`/api/v1/agent/messaging/messages/${humanMsg._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'tentative' })
    expect(patch.status).toBe(404)
  })

  it('DELETE message : soft delete sur SON message', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
    const human = await createInternalHuman('ADMIN', 'Ida')

    const dm = await request(app)
      .post('/api/v1/agent/messaging/direct')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ participantId: String(human._id) })
    const send = await request(app)
      .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/messages`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'Sera supprimé' })

    const del = await request(app)
      .delete(`/api/v1/agent/messaging/messages/${send.body.message._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(del.status).toBe(200)
    expect(del.body.message.deletedAt).toBeTruthy()
    expect(del.body.message.content).toBe('Message supprimé')
  })

  it('POST /messages/:id/reactions toggle on/off', async () => {
    const { plainSecret } = await createAgentTokenWithUser(['write:internal-messaging'])
    const human = await createInternalHuman('ADMIN', 'Jane')

    const dm = await request(app)
      .post('/api/v1/agent/messaging/direct')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ participantId: String(human._id) })
    const send = await request(app)
      .post(`/api/v1/agent/messaging/conversations/${dm.body.conversation._id}/messages`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ content: 'react me' })

    const on = await request(app)
      .post(`/api/v1/agent/messaging/messages/${send.body.message._id}/reactions`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ emoji: '👍' })
    expect(on.status).toBe(200)
    expect(on.body.message.reactions).toHaveLength(1)

    const off = await request(app)
      .post(`/api/v1/agent/messaging/messages/${send.body.message._id}/reactions`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ emoji: '👍' })
    expect(off.status).toBe(200)
    expect(off.body.message.reactions).toHaveLength(0)
  })
})
