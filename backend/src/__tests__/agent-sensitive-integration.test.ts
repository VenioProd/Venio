import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import AuthSession from '../models/AuthSession.js'
import { createSession } from '../lib/session.js'
import auth from '../middleware/auth.js'
import { requirePermission } from '../middleware/role.js'
import { PERMISSIONS } from '../lib/permissions.js'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
  app.get('/admin-sensitive', auth, requirePermission(PERMISSIONS.MANAGE_DEV), (_req, res) => {
    res.json({ ok: true })
  })
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  await User.create({
    email: 'admin@v.test',
    passwordHash: await bcrypt.hash('x', 10),
    name: 'Admin',
    role: 'SUPER_ADMIN',
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Audit (RO)
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Audit / read-only', () => {
  it('lists audit log filtered by action + agentTokenId', async () => {
    // Génère un audit log en créant un client via API (mutation auditée)
    const { plainSecret, id: tokenId } = await createAgentTokenInDb(['read:audit', 'write:crm'])
    await request(app)
      .post('/api/v1/agent/clients')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ email: 'audit@v.test', name: 'Audit User' })
    await new Promise((r) => setTimeout(r, 100)) // finish hook async

    const all = await request(app).get('/api/v1/agent/audit/log').set('Authorization', `Bearer ${plainSecret}`)
    expect(all.status).toBe(200)
    expect(all.body.total).toBeGreaterThanOrEqual(1)

    const filtered = await request(app)
      .get(`/api/v1/agent/audit/log?action=AGENT_API_MUTATION&agentTokenId=${tokenId}`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(filtered.body.total).toBeGreaterThanOrEqual(1)
    expect(filtered.body.items[0].action).toBe('AGENT_API_MUTATION')
  })

  it('returns 403 without read:audit', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const res = await request(app).get('/api/v1/agent/audit/log').set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(403)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Users (admin) + 2FA
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Users / admin CRUD', () => {
  it('lists only admin users (CLIENT not included)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:users'])
    await User.create({
      email: 'someclient@v.test',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'Client',
      role: 'CLIENT',
    })
    const res = await request(app).get('/api/v1/agent/users').set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1) // seul SUPER_ADMIN
    expect(res.body.items[0].role).toBe('SUPER_ADMIN')
  })

  it('does not expose auth/security metadata on admin user reads', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:users'])
    const admin = await User.findOne({ role: 'SUPER_ADMIN' })
    admin!.twoFactorSecret = 'TOTPSECRET'
    admin!.lastLoginIp = '203.0.113.20'
    admin!.passwordChangedAt = new Date()
    await admin!.save()

    const list = await request(app).get('/api/v1/agent/users').set('Authorization', `Bearer ${plainSecret}`)
    expect(list.status).toBe(200)
    expect(list.body.items[0].passwordHash).toBeUndefined()
    expect(list.body.items[0].twoFactorSecret).toBeUndefined()
    expect(list.body.items[0].lastLoginIp).toBeUndefined()
    expect(list.body.items[0].passwordChangedAt).toBeUndefined()

    const detail = await request(app)
      .get(`/api/v1/agent/users/${admin!._id}`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(detail.status).toBe(200)
    expect(detail.body.passwordHash).toBeUndefined()
    expect(detail.body.twoFactorSecret).toBeUndefined()
    expect(detail.body.lastLoginIp).toBeUndefined()
    expect(detail.body.passwordChangedAt).toBeUndefined()
  })

  it('creates admin without exposing passwordHash or twoFactorSecret', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:users'])
    const res = await request(app)
      .post('/api/v1/agent/users')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ email: 'NEW@v.test', name: 'New Admin', role: 'ADMIN', password: 'verylongpwd' })
    expect(res.status).toBe(201)
    expect(res.body.email).toBe('new@v.test')
    expect(res.body.role).toBe('ADMIN')
    expect(res.body.passwordHash).toBeUndefined()
    expect(res.body.twoFactorSecret).toBeUndefined()
  })

  it('refuses to delete the last SUPER_ADMIN', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:users'])
    const sa = await User.findOne({ role: 'SUPER_ADMIN' })
    const res = await request(app)
      .delete(`/api/v1/agent/users/${sa!._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('LAST_SUPER_ADMIN')
  })

  it('refuses to modify a CLIENT user via /users (use /crm/clients)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:users'])
    const cli = await User.create({
      email: 'c@v.test',
      passwordHash: await bcrypt.hash('x', 10),
      name: 'C',
      role: 'CLIENT',
    })
    const res = await request(app)
      .patch(`/api/v1/agent/users/${cli._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ name: 'X' })
    expect(res.status).toBe(422)
    expect(res.body.code).toBe('NOT_ADMIN')
  })

  it('revokes every browser session as soon as an admin is disabled', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:users'])
    const target = await User.create({
      email: 'disabled-admin@v.test',
      passwordHash: await bcrypt.hash('password', 10),
      name: 'Disabled admin',
      role: 'ADMIN',
    })
    const { token } = await createSession(String(target._id))

    await request(app)
      .patch(`/api/v1/agent/users/${target._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ isActive: false })
      .expect(200)

    await expect(AuthSession.exists({ userId: target._id, revokedAt: { $ne: null } })).resolves.toBeTruthy()
    await request(app).get('/admin-sensitive').set('Cookie', `venio_session=${token}`).expect(401)
  })

  it('revokes sessions on role changes and uses the current role for sensitive access', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:users'])
    const target = await User.create({
      email: 'role-admin@v.test',
      passwordHash: await bcrypt.hash('password', 10),
      name: 'Role admin',
      role: 'SUPER_ADMIN',
    })
    const { token: oldToken } = await createSession(String(target._id))

    await request(app)
      .patch(`/api/v1/agent/users/${target._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ role: 'VIEWER' })
      .expect(200)

    await request(app).get('/admin-sensitive').set('Cookie', `venio_session=${oldToken}`).expect(401)
    const { token: currentToken } = await createSession(String(target._id))
    await request(app).get('/admin-sensitive').set('Cookie', `venio_session=${currentToken}`).expect(403)
  })

  it('revokes sessions on permission changes and uses the current permissions for sensitive access', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:users'])
    const target = await User.create({
      email: 'permission-admin@v.test',
      passwordHash: await bcrypt.hash('password', 10),
      name: 'Permission admin',
      role: 'ADMIN',
    })
    const { token: oldToken } = await createSession(String(target._id))

    await request(app)
      .patch(`/api/v1/agent/users/${target._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ deniedPermissions: [PERMISSIONS.MANAGE_DEV] })
      .expect(200)

    await request(app).get('/admin-sensitive').set('Cookie', `venio_session=${oldToken}`).expect(401)
    const { token: currentToken } = await createSession(String(target._id))
    await request(app).get('/admin-sensitive').set('Cookie', `venio_session=${currentToken}`).expect(403)
  })

  it('revokes sessions when an admin password is replaced', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:users'])
    const target = await User.create({
      email: 'password-admin@v.test',
      passwordHash: await bcrypt.hash('password', 10),
      name: 'Password admin',
      role: 'ADMIN',
    })
    const { token } = await createSession(String(target._id))

    await request(app)
      .patch(`/api/v1/agent/users/${target._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ password: 'replacement-password' })
      .expect(200)

    await request(app).get('/admin-sensitive').set('Cookie', `venio_session=${token}`).expect(401)
  })
})

describe('Agent Users / 2FA', () => {
  it('reads 2FA status', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:2fa'])
    const u = await User.findOne({ role: 'SUPER_ADMIN' })
    const res = await request(app)
      .get(`/api/v1/agent/users/${u!._id}/2fa`)
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(res.body.twoFactorEnabled).toBe(false)
    expect(res.body.userId).toBe(String(u!._id))
  })

  it('refuses to disable 2FA through an agent token', async () => {
    const { plainSecret } = await createAgentTokenInDb(['manage:2fa'])
    const u = await User.findOne({ role: 'SUPER_ADMIN' })
    u!.twoFactorEnabled = true
    u!.twoFactorSecret = 'TOTPSECRET'
    u!.twoFactorRecoveryCodeHashes = ['hash']
    await u!.save()

    const res = await request(app)
      .post(`/api/v1/agent/users/${u!._id}/2fa/disable`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('MFA_STEP_UP_REQUIRED')

    const after = await User.findById(u!._id).lean()
    expect(after?.twoFactorEnabled).toBe(true)
    expect(after?.twoFactorSecret).toBe('TOTPSECRET')
    expect(after?.twoFactorRecoveryCodeHashes).toEqual(['hash'])
  })

  it('refuses without manage:2fa scope', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:2fa'])
    const u = await User.findOne({ role: 'SUPER_ADMIN' })
    const res = await request(app)
      .post(`/api/v1/agent/users/${u!._id}/2fa/disable`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
    expect(res.status).toBe(403)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Backup (smoke seulement — pas de mongodump dans les tests)
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Backup', () => {
  it('GET /backup returns a list (peut-être vide)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:backup'])
    const res = await request(app).get('/api/v1/agent/backup').set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
  })

  it('GET /backup refused without read:backup', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:crm'])
    const res = await request(app).get('/api/v1/agent/backup').set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(403)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Automations (registry peut être vide en test ; on teste les routes
// publiques + 404 sur key inconnue)
// ───────────────────────────────────────────────────────────────────────────

describe('Agent Automations', () => {
  it('lists registry (may be empty in isolated tests)', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:automations'])
    const res = await request(app).get('/api/v1/agent/automations').set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    // Le registry est partagé entre tests — on ne valide pas un count précis
  })

  it('returns 404 on unknown automation key', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:automations'])
    const res = await request(app)
      .get('/api/v1/agent/automations/not-an-automation-key')
      .set('Authorization', `Bearer ${plainSecret}`)
    expect(res.status).toBe(404)
  })

  it('trigger refused without trigger:automations scope', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:automations', 'write:automations'])
    const res = await request(app)
      .post('/api/v1/agent/automations/any.key/trigger')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({})
    expect(res.status).toBe(403)
  })
})
