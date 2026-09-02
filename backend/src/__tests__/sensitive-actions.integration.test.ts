import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createAdminTestApp } from './helpers/agentTestApp.js'
import { createSession } from '../lib/session.js'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'

let app: Express

beforeAll(async () => {
  // Ce module valide le garde-fou d'élévation MFA : on l'arme explicitement,
  // l'instance étant livrée avec MFA_ENABLED=false.
  process.env.MFA_ENABLED = 'true'
  await setupMongo()
  app = await createAdminTestApp()
})

afterAll(async () => {
  delete process.env.MFA_ENABLED
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
})

async function sessionFor(role: 'SUPER_ADMIN' | 'ADMIN', options: { steppedUp?: boolean } = {}): Promise<string> {
  const user = await User.create({
    email: `${role.toLowerCase()}-${Date.now()}@venio.test`,
    passwordHash: await bcrypt.hash('test', 10),
    name: role,
    role,
    twoFactorEnabled: true,
    twoFactorSecret: 'JBSWY3DPEHPK3PXP',
  })
  const { token } = await createSession(String(user._id), options.steppedUp ? { mfaVerifiedAt: new Date() } : {})
  return `venio_session=${token}`
}

function createTokenRequest(cookie: string) {
  return request(app)
    .post('/api/admin/agent-tokens')
    .set('Cookie', cookie)
    .send({ name: 'Sensitive action test', scopes: ['read:crm'] })
}

describe('sensitive action guards / PAT creation', () => {
  it('refuses a role outside the route minimum permission', async () => {
    const res = await createTokenRequest(await sessionFor('ADMIN', { steppedUp: true })).set(
      'X-Venio-Confirm',
      'AGENT_TOKEN_CREATE',
    )

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Forbidden')
  })

  it('refuses a missing typed confirmation', async () => {
    const res = await createTokenRequest(await sessionFor('SUPER_ADMIN', { steppedUp: true }))

    expect(res.status).toBe(428)
    expect(res.body.error).toBe('SENSITIVE_ACTION_CONFIRMATION_REQUIRED')
  })

  it('refuses an invalid typed confirmation', async () => {
    const res = await createTokenRequest(await sessionFor('SUPER_ADMIN', { steppedUp: true })).set(
      'X-Venio-Confirm',
      'AGENT_TOKEN_REVOKE',
    )

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('SENSITIVE_ACTION_CONFIRMATION_INVALID')
  })

  it('requires a fresh step-up MFA claim', async () => {
    const res = await createTokenRequest(await sessionFor('SUPER_ADMIN')).set('X-Venio-Confirm', 'AGENT_TOKEN_CREATE')

    expect(res.status).toBe(403)
    expect(res.body.error).toBe('MFA_STEP_UP_REQUIRED')
  })

  it('allows the action and writes an append-only audit event', async () => {
    const res = await createTokenRequest(await sessionFor('SUPER_ADMIN', { steppedUp: true })).set(
      'X-Venio-Confirm',
      'AGENT_TOKEN_CREATE',
    )

    expect(res.status).toBe(201)
    await expect
      .poll(
        async () =>
          AuditLog.exists({ action: 'SENSITIVE_ACTION_EXECUTED', 'metadata.sensitiveAction': 'AGENT_TOKEN_CREATE' }),
        { timeout: 2_000 },
      )
      .not.toBeNull()
  })
})
