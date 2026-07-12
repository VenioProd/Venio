import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import express from 'express'
import request from 'supertest'
import authRoutes, { resetTokens } from '../routes/auth.js'
import auth from '../middleware/auth.js'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'
import { createSession } from '../lib/session.js'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const app = express()
app.use(express.json())
app.use('/api/auth', authRoutes)
app.get('/protected', auth, (req, res) => res.json({ userId: req.user!.id }))

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  await setupMongo()
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
})

describe('browser sessions', () => {
  it('uses an HttpOnly SameSite cookie and never returns a login bearer token', async () => {
    const passwordHash = await bcrypt.hash('correct horse battery staple', 10)
    await User.create({
      email: 'client@example.test',
      name: 'Client Example',
      role: 'CLIENT',
      passwordHash,
    })

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'client@example.test', password: 'correct horse battery staple' })
      .expect(200)

    expect(login.body).not.toHaveProperty('token')
    const cookie = login.headers['set-cookie']?.[0]
    expect(cookie).toMatch(/^venio_session=/)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/')

    await request(app).get('/api/auth/me').set('Cookie', cookie!).expect(200)
  })

  it('marks browser session cookies Secure in production', async () => {
    const passwordHash = await bcrypt.hash('production-cookie-password', 10)
    await User.create({
      email: 'production@example.test',
      name: 'Production Cookie',
      role: 'CLIENT',
      passwordHash,
    })
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'production@example.test', password: 'production-cookie-password' })
        .expect(200)
      expect(login.headers['set-cookie']?.[0]).toContain('Secure')
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  })

  it('does not accept a user session from an Authorization bearer header', async () => {
    const user = await User.create({
      email: 'bearer@example.test',
      name: 'Bearer Example',
      role: 'CLIENT',
      passwordHash: 'not-used',
    })
    const { token } = await createSession(user._id.toString())

    await request(app).get('/protected').set('Authorization', `Bearer ${token}`).expect(401)
    await request(app).get('/protected').set('Cookie', `venio_session=${token}`).expect(200)
  })

  it('revokes the active server-side session on logout', async () => {
    const passwordHash = await bcrypt.hash('logout-password', 10)
    await User.create({
      email: 'logout@example.test',
      name: 'Logout Example',
      role: 'CLIENT',
      passwordHash,
    })
    const agent = request.agent(app)
    const login = await agent
      .post('/api/auth/login')
      .send({ email: 'logout@example.test', password: 'logout-password' })
      .expect(200)
    const originalCookie = login.headers['set-cookie']?.[0]

    await agent.post('/api/auth/logout').expect(204)
    await request(app).get('/api/auth/me').set('Cookie', originalCookie!).expect(401)
  })

  it('rejects a session whose server-side authorization version is no longer current', async () => {
    const user = await User.create({
      email: 'versioned@example.test',
      name: 'Versioned User',
      role: 'CLIENT',
      passwordHash: 'not-used',
    })
    const { token } = await createSession(String(user._id))

    await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } })

    await request(app).get('/protected').set('Cookie', `venio_session=${token}`).expect(401)
  })

  it('revokes all sessions after a password reset', async () => {
    const user = await User.create({
      email: 'reset@example.test',
      name: 'Reset User',
      role: 'CLIENT',
      passwordHash: await bcrypt.hash('old-password', 10),
    })
    const { token } = await createSession(String(user._id))
    resetTokens.set('valid-reset-token', { userId: String(user._id), expiresAt: Date.now() + 60_000 })

    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'valid-reset-token', password: 'new-password' })
      .expect(200)

    await request(app).get('/protected').set('Cookie', `venio_session=${token}`).expect(401)
  })

  it('revokes a managed admin session after role, permission, or password changes', async () => {
    const passwordHash = await bcrypt.hash('super-admin-password', 10)
    const actor = await User.create({
      email: 'manager@example.test',
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      passwordHash,
    })
    const target = await User.create({
      email: 'managed-admin@example.test',
      name: 'Managed Admin',
      role: 'ADMIN',
      passwordHash: await bcrypt.hash('old-password', 10),
    })
    const { token } = await createSession(String(target._id))
    const adminsRouter = (await import('../routes/admin/admins.js')).default
    const adminApp = express()
    adminApp.use(express.json())
    adminApp.use('/api/auth', authRoutes)
    adminApp.use('/api/admin/admins', adminsRouter)
    const actorLogin = await request(adminApp)
      .post('/api/auth/login')
      .send({ email: actor.email, password: 'super-admin-password' })
      .expect(200)
    const actorCookie = actorLogin.headers['set-cookie']?.[0]
    expect(actorCookie).toBeDefined()

    await request(adminApp)
      .patch(`/api/admin/admins/${target._id}`)
      .set('Cookie', actorCookie ?? '')
      .send({ role: 'MANAGER', deniedPermissions: ['manage_dev'], password: 'new-password' })
      .expect(200)

    await request(adminApp).get('/api/auth/me').set('Cookie', `venio_session=${token}`).expect(401)
  })

  it('marks impersonation sessions as short-lived and auditable without returning a token', async () => {
    const passwordHash = await bcrypt.hash('super-admin-password', 10)
    const actor = await User.create({
      email: 'admin@example.test',
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      passwordHash,
    })
    const target = await User.create({
      email: 'target@example.test',
      name: 'Target User',
      role: 'CLIENT',
      passwordHash: 'not-used',
    })

    const adminsRouter = (await import('../routes/admin/admins.js')).default
    const adminApp = express()
    adminApp.use(express.json())
    adminApp.use('/api/auth', authRoutes)
    adminApp.use('/api/admin/admins', adminsRouter)
    const agent = request.agent(adminApp)
    const login = await agent
      .post('/api/auth/login')
      .send({ email: actor.email, password: 'super-admin-password' })
      .expect(200)
    const actorCookie = login.headers['set-cookie']?.[0]

    const impersonation = await agent.post(`/api/admin/admins/impersonate/${target._id}`).expect(200)
    expect(impersonation.body).not.toHaveProperty('token')
    expect(impersonation.body.user._id).toBe(target._id.toString())
    const impersonationCookie = impersonation.headers['set-cookie']?.[0]
    expect(impersonationCookie).toContain('HttpOnly')
    expect(impersonationCookie).toContain('SameSite=Strict')
    expect(impersonationCookie).toMatch(/(?:^|;\s*)Max-Age=900(?:;|$)/)

    // The previous administrator session has been revoked, while the new
    // cookie authenticates as the target account.
    await request(adminApp).get('/api/auth/me').set('Cookie', actorCookie!).expect(401)
    await request(adminApp).get('/api/auth/me').set('Cookie', impersonationCookie!).expect(200)
    await expect(
      AuditLog.exists({
        action: 'IMPERSONATION_STARTED',
        userId: target._id,
        'metadata.impersonatorId': actor._id.toString(),
      }),
    ).resolves.toBeTruthy()
  })
})
