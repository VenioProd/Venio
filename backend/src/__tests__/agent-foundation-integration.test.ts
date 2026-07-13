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
import AgentToken from '../models/AgentToken.js'
import AgentIdempotencyKey from '../models/AgentIdempotencyKey.js'
import AuditLog from '../models/AuditLog.js'

/**
 * Tests d'intégration end-to-end du pipeline de l'API agent contre une
 * vraie base Mongo en mémoire :
 *
 *   - Auth Bearer (token valide, expiré, révoqué, format invalide)
 *   - Scope check (read, write, admin:*)
 *   - Idempotency (clé absente, replay, conflict)
 *   - Audit (entrée AGENT_API_MUTATION sur mutations 2xx)
 *   - Stats lastUsedAt / totalRequests / totalMutations
 *
 * On utilise un endpoint POST de test simple (création de client CRM) pour
 * exercer toute la chaîne.
 */

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
})

// ───────────────────────────────────────────────────────────────────────────
// Auth Bearer
// ───────────────────────────────────────────────────────────────────────────

describe('Agent integration / auth', () => {
  it('ping is rejected without an Authorization header', async () => {
    const res = await request(app).get('/api/v1/agent/ping')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('MISSING_TOKEN')
  })

  it('ping is rejected on malformed token', async () => {
    const res = await request(app)
      .get('/api/v1/agent/ping')
      .set('Authorization', 'Bearer not-a-real-token')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_TOKEN')
  })

  it('ping is rejected on unknown prefix', async () => {
    const res = await request(app)
      .get('/api/v1/agent/ping')
      .set('Authorization', 'Bearer vno_pat_zzzzaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_TOKEN')
  })

  it('ping is rejected when the hash does not match', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    // On vandalise le secret pour garder le prefix mais corrompre la fin
    const tampered = plainSecret.slice(0, -2) + (plainSecret.endsWith('aa') ? 'bb' : 'aa')
    const res = await request(app)
      .get('/api/v1/agent/ping')
      .set('Authorization', `Bearer ${tampered}`)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('INVALID_TOKEN')
  })

  it('ping succeeds with a valid token and returns the token identity', async () => {
    const { id, plainSecret, prefix } = await createAgentTokenInDb(['read:crm'])
    const res = await request(app)
      .get('/api/v1/agent/ping')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.token.id).toBe(id)
    expect(res.body.token.prefix).toBe(prefix)
    expect(res.body.token.scopes).toEqual(['read:crm'])
  })

  it('rejects a revoked token', async () => {
    const { id, plainSecret } = await createAgentTokenInDb(['read:crm'])
    await AgentToken.updateOne({ _id: id }, { status: 'REVOKED' })
    const res = await request(app)
      .get('/api/v1/agent/ping')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(401)
  })

  it('rejects an expired token', async () => {
    const { id, plainSecret } = await createAgentTokenInDb(['read:crm'])
    await AgentToken.updateOne({ _id: id }, { expiresAt: new Date(Date.now() - 60_000) })
    const res = await request(app)
      .get('/api/v1/agent/ping')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(401)
    expect(res.body.code).toBe('EXPIRED_TOKEN')
  })

  it('updates lastUsedAt and totalRequests on each call', async () => {
    const { id, plainSecret } = await createAgentTokenInDb(['read:crm'])
    await request(app).get('/api/v1/agent/ping').set('Authorization', `Bearer ${plainSecret}`)
    await request(app).get('/api/v1/agent/ping').set('Authorization', `Bearer ${plainSecret}`)
    // Laisser le fire-and-forget se déclencher
    await new Promise((r) => setTimeout(r, 80))
    const t = await AgentToken.findById(id).lean()
    expect(t?.totalRequests).toBeGreaterThanOrEqual(2)
    expect(t?.lastUsedAt).toBeInstanceOf(Date)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Scope check
// ───────────────────────────────────────────────────────────────────────────

describe('Agent integration / scopes', () => {
  it('GET /crm/clients is rejected without read:crm', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:projects'])
    const res = await request(app)
      .get('/api/v1/agent/clients')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('INSUFFICIENT_SCOPE')
    expect(res.body.details.required).toContain('read:crm')
  })

  it('GET /crm/clients succeeds with read:crm', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const res = await request(app)
      .get('/api/v1/agent/clients')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ items: [], page: 1, pageSize: 50, total: 0 })
  })

  it('admin:* grants access without explicit scope', async () => {
    const { plainSecret } = await createAgentTokenInDb(['admin:*'])
    const res = await request(app)
      .get('/api/v1/agent/clients')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
  })

  it('POST /crm/clients is rejected without write:crm', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const res = await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ email: 'c1@x.com', name: 'C1' })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('INSUFFICIENT_SCOPE')
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Idempotency
// ───────────────────────────────────────────────────────────────────────────

describe('Agent integration / idempotency', () => {
  it('POST without Idempotency-Key returns 400', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm', 'read:crm'])
    const res = await request(app)
      .post('/api/v1/agent/clients')
      .set('Authorization', `Bearer ${plainSecret}`)
      .set('Content-Type', 'application/json')
      .send({ email: 'a@x.com', name: 'A' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('MISSING_IDEMPOTENCY_KEY')
  })

  it('POST with malformed Idempotency-Key returns 400', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm', 'read:crm'])
    const res = await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: 'too short' }))
      .send({ email: 'a@x.com', name: 'A' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_IDEMPOTENCY_KEY')
  })

  it('POST with same key replays the stored response', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm', 'read:crm'])
    const key = uniqueIdempotencyKey()
    const body = { email: 'replay@x.com', name: 'Replay' }
    const r1 = await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: key }))
      .send(body)
    expect(r1.status).toBe(201)
    // Laisser le fire-and-forget de l'idempotency-store s'écrire
    await new Promise((r) => setTimeout(r, 80))
    const r2 = await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: key }))
      .send(body)
    expect(r2.status).toBe(201)
    expect(r2.body._id).toBe(r1.body._id) // même ressource, pas de second insert
    const stored = await AgentIdempotencyKey.find({ key }).lean()
    expect(stored).toHaveLength(1)
  })

  it('POST with same key but different body returns 409 IDEMPOTENCY_CONFLICT', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm', 'read:crm'])
    const key = uniqueIdempotencyKey()
    await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: key }))
      .send({ email: 'one@x.com', name: 'One' })
    await new Promise((r) => setTimeout(r, 80))
    const r2 = await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: key }))
      .send({ email: 'two@x.com', name: 'Two' })
    expect(r2.status).toBe(409)
    expect(r2.body.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('rejects reuse of a key on a different endpoint instead of replaying another operation', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:crm', 'read:crm'])
    const key = uniqueIdempotencyKey()
    const body = { email: 'endpoint@x.com', name: 'Endpoint' }

    const created = await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: key }))
      .send(body)
    expect(created.status).toBe(201)
    await new Promise((r) => setTimeout(r, 80))

    const reused = await request(app)
      .post('/api/v1/agent/leads')
      .set(authHeaders(plainSecret, { idempotencyKey: key }))
      .send(body)
    expect(reused.status).toBe(409)
    expect(reused.body).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      details: { previousMethod: 'POST', previousPath: '/api/v1/agent/clients' },
    })
    expect(reused.body._id).toBeUndefined()
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Audit
// ───────────────────────────────────────────────────────────────────────────

describe('Agent integration / audit', () => {
  it('logs an AGENT_API_MUTATION entry on successful POST', async () => {
    const { id: tokenId, plainSecret } = await createAgentTokenInDb(['write:crm', 'read:crm'])
    const res = await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ email: 'audit@x.com', name: 'Audit' })
    expect(res.status).toBe(201)
    await new Promise((r) => setTimeout(r, 100)) // finish hook async
    const logs = await AuditLog.find({ action: 'AGENT_API_MUTATION' }).lean()
    expect(logs.length).toBeGreaterThanOrEqual(1)
    const last = logs[logs.length - 1]
    const meta = last!.metadata as Record<string, unknown>
    expect(meta.actorType).toBe('AGENT')
    expect(meta.agentTokenId).toBe(tokenId)
    expect(meta.method).toBe('POST')
    expect(meta.path).toBe('/api/v1/agent/clients')
    expect(meta.entityType).toBe('User')
  })

  it('does NOT log GET requests', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    await request(app)
      .get('/api/v1/agent/clients')
      .set('Authorization', `Bearer ${plainSecret}`)
    await new Promise((r) => setTimeout(r, 50))
    const logs = await AuditLog.find({ action: 'AGENT_API_MUTATION' }).lean()
    expect(logs).toHaveLength(0)
  })

  it('increments totalMutations on the token after a mutation', async () => {
    const { id, plainSecret } = await createAgentTokenInDb(['write:crm', 'read:crm'])
    await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ email: 'mut@x.com', name: 'M' })
    await new Promise((r) => setTimeout(r, 100))
    const t = await AgentToken.findById(id).lean()
    expect(t?.totalMutations).toBe(1)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// OpenAPI public
// ───────────────────────────────────────────────────────────────────────────

describe('Agent integration / openapi', () => {
  it('GET /openapi.json is public (no auth)', async () => {
    const res = await request(app).get('/api/v1/agent/openapi.json')
    expect(res.status).toBe(200)
    expect(res.body.openapi).toMatch(/^3\./)
    expect(res.body.info.title).toContain('Venio')
    expect(res.body['x-agent-scopes']).toContain('read:crm')
  })
})
