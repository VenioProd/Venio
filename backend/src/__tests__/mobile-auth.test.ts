import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import bcrypt from 'bcryptjs'
import express from 'express'
import request from 'supertest'
import { TOTP } from 'otpauth'
import authRoutes from '../routes/auth.js'
import mobileAuthRoutes from '../routes/mobileAuth.js'
import auth from '../middleware/auth.js'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'
import MobileDevice from '../models/MobileDevice.js'
import { createSession, revokeUserSessions } from '../lib/session.js'
import { createRecoveryCodes, createTotpSecret } from '../lib/mfa.js'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const app = express()
app.use(express.json())
app.use('/api/auth/mobile', mobileAuthRoutes)
app.use('/api/auth', authRoutes)
app.get('/api/admin/crm/leads', auth, (req, res) => res.json({ userId: req.user!.id, deviceId: req.user!.deviceId }))
app.get('/api/admin/users', auth, (_req, res) => res.json({ ok: true }))

const PASSWORD = 'mobile-password'
const DEVICE = { name: 'iPhone de Camille', platform: 'ios', installationId: 'install-0001' }

async function createUser(overrides: Record<string, unknown> = {}) {
  return User.create({
    email: 'commercial@example.test',
    name: 'Camille Commerciale',
    role: 'COMMERCIAL',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    ...overrides,
  })
}

function login(device: Record<string, unknown> = DEVICE, extra: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/auth/mobile/login')
    .send({ email: 'commercial@example.test', password: PASSWORD, device, ...extra })
}

function asBearer(token: string) {
  return request(app).get('/api/admin/crm/leads').set('Authorization', `Bearer ${token}`)
}

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  delete process.env.MFA_ENABLED
  await clearDb()
})

describe('auth native', () => {
  it('émet un access et un refresh préfixés, utilisables seulement en Bearer', async () => {
    await createUser()
    const res = await login().expect(200)

    expect(res.body.accessToken).toMatch(/^vnm_at_/)
    expect(res.body.refreshToken).toMatch(/^vnm_rt_/)
    expect(res.headers['set-cookie']).toBeUndefined()
    expect(res.body.device).toMatchObject({ name: DEVICE.name, platform: 'ios', current: true })
    expect(res.body.user.permissions).toContain('view_crm')

    const ok = await asBearer(res.body.accessToken).expect(200)
    expect(ok.body.deviceId).toBe(res.body.device.id)
    // Un jeton ne change jamais de transport, et un refresh n'est pas un access.
    await request(app).get('/api/admin/crm/leads').set('Cookie', `venio_session=${res.body.accessToken}`).expect(401)
    await asBearer(res.body.refreshToken).expect(401)
  })

  it("refuse en Bearer une session navigateur, et le Bearer l'emporte sur le cookie", async () => {
    const user = await createUser()
    const { token: browserToken } = await createSession(String(user._id))
    await asBearer(browserToken).expect(401)
    await request(app)
      .get('/api/admin/crm/leads')
      .set('Cookie', `venio_session=${browserToken}`)
      .set('Authorization', 'Bearer vno_pat_notAUserToken')
      .expect(401)
  })

  it('fait tourner le refresh, et un rejeu révoque tout l’appareil', async () => {
    await createUser()
    const first = (await login().expect(200)).body

    const second = (
      await request(app).post('/api/auth/mobile/refresh').send({ refreshToken: first.refreshToken }).expect(200)
    ).body
    expect(second.refreshToken).not.toBe(first.refreshToken)
    await asBearer(second.accessToken).expect(200)

    const replay = await request(app)
      .post('/api/auth/mobile/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(401)
    expect(replay.body.code).toBe('INVALID_REFRESH_TOKEN')

    await asBearer(second.accessToken).expect(401)
    await request(app).post('/api/auth/mobile/refresh').send({ refreshToken: second.refreshToken }).expect(401)
    const device = await MobileDevice.findById(first.device.id).lean()
    expect(device?.revokedReason).toBe('REFRESH_REUSE')
    expect(await AuditLog.countDocuments({ action: 'MOBILE_REFRESH_REUSE' })).toBe(1)
  })

  it('ne survit pas à un changement de mot de passe ni de droits', async () => {
    const user = await createUser()
    const a = (await login().expect(200)).body
    await revokeUserSessions(String(user._id))
    await asBearer(a.accessToken).expect(401)
    await request(app).post('/api/auth/mobile/refresh').send({ refreshToken: a.refreshToken }).expect(401)

    // Version de session incrémentée sans révocation explicite : le refresh échoue quand même.
    const b = (await login({ ...DEVICE, installationId: 'install-0002' }).expect(200)).body
    await User.updateOne({ _id: user._id }, { $inc: { sessionVersion: 1 } })
    await request(app).post('/api/auth/mobile/refresh').send({ refreshToken: b.refreshToken }).expect(401)
    expect((await MobileDevice.findById(b.device.id).lean())?.revokedReason).toBe('CREDENTIALS_CHANGED')
  })

  it('exige le second facteur quand la MFA est active', async () => {
    process.env.MFA_ENABLED = 'true'
    const secret = createTotpSecret()
    await createUser({ role: 'ADMIN', twoFactorEnabled: true, twoFactorSecret: secret })

    expect((await login().expect(200)).body).toEqual({ requires2FA: true })
    await login(DEVICE, { totpCode: '000000' }).expect(401)

    const totp = new TOTP({ issuer: 'Venio', label: 'commercial@example.test', secret })
    const res = await login(DEVICE, { totpCode: totp.generate() }).expect(200)
    expect((await MobileDevice.findById(res.body.device.id).lean())?.mfaVerifiedAt).toBeInstanceOf(Date)
  })

  it('ne livre pas les secrets MFA, et une connexion ne consomme un code de secours qu’une fois', async () => {
    process.env.MFA_ENABLED = 'true'
    const { codes, hashes } = await createRecoveryCodes(2)
    await createUser({
      role: 'ADMIN',
      twoFactorEnabled: true,
      twoFactorSecret: createTotpSecret(),
      twoFactorRecoveryCodeHashes: hashes,
    })

    const attempts = await Promise.all([1, 2].map(() => login(DEVICE, { recoveryCode: codes[0] })))
    expect(attempts.map((r) => r.status).sort()).toEqual([200, 401])
    const { accessToken } = attempts.find((r) => r.status === 200)!.body
    expect((await User.findOne().lean())?.twoFactorRecoveryCodeHashes).toHaveLength(1)

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200)
    expect(me.body.user).not.toHaveProperty('twoFactorSecret')
    expect(me.body.user).not.toHaveProperty('twoFactorRecoveryCodeHashes')
  })

  it('invalide un appareil émis avec une version périmée, et redemande la MFA quand elle est réarmée', async () => {
    await createUser({ twoFactorEnabled: true, twoFactorSecret: createTotpSecret() })
    const a = (await login().expect(200)).body
    // Course : le mot de passe a changé entre la vérification et l'émission.
    await MobileDevice.updateOne({ _id: a.device.id }, { $inc: { sessionVersion: -1 } })
    await asBearer(a.accessToken).expect(401)

    // Connecté MFA désactivée, puis MFA réarmée : le refresh échoue.
    const b = (await login({ ...DEVICE, installationId: 'install-0002' }).expect(200)).body
    process.env.MFA_ENABLED = 'true'
    await request(app).post('/api/auth/mobile/refresh').send({ refreshToken: b.refreshToken }).expect(401)
  })

  it("refuse les comptes clients et l'enrôlement MFA en attente", async () => {
    await createUser({ role: 'CLIENT' })
    expect((await login().expect(403)).body.code).toBe('MOBILE_ROLE_NOT_ALLOWED')

    await User.deleteMany({})
    process.env.MFA_ENABLED = 'true'
    await createUser({ role: 'ADMIN', mfaGraceUntil: new Date(Date.now() - 1000) })
    expect((await login().expect(403)).body.code).toBe('MFA_SETUP_REQUIRED')
    expect(await MobileDevice.countDocuments()).toBe(0)
  })

  it('réserve au navigateur les surfaces qui ouvrent des accès', async () => {
    await createUser({ role: 'SUPER_ADMIN' })
    const { accessToken } = (await login().expect(200)).body
    for (const path of ['/api/admin/users', '/API/Admin/Users']) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${accessToken}`).expect(403)
      expect(res.body.code).toBe('BROWSER_SESSION_REQUIRED')
    }
  })

  it('liste, révoque et remplace les appareils', async () => {
    const user = await createUser()
    const phone = (await login().expect(200)).body
    const ipad = (await login({ name: 'iPad', platform: 'ipados', installationId: 'install-ipad' }).expect(200)).body

    const list = await request(app)
      .get('/api/auth/mobile/devices')
      .set('Authorization', `Bearer ${ipad.accessToken}`)
      .expect(200)
    expect(list.body.devices.map((d: { name: string; current: boolean }) => [d.name, d.current])).toEqual(
      expect.arrayContaining([
        ['iPad', true],
        [DEVICE.name, false],
      ]),
    )

    // Depuis l'app, « tout révoquer » épargne l'appareil qui le demande.
    await request(app)
      .post('/api/auth/mobile/devices/revoke-all')
      .set('Authorization', `Bearer ${ipad.accessToken}`)
      .expect(200, { revoked: 1 })
    await asBearer(phone.accessToken).expect(401)
    await asBearer(ipad.accessToken).expect(200)

    // Un appareil d'un autre utilisateur est introuvable.
    const other = await User.create({ email: 'o@example.test', name: 'O', role: 'ADMIN', passwordHash: 'x' })
    const foreign = await MobileDevice.create({
      userId: other._id,
      name: 'Autre',
      platform: 'ios',
      expiresAt: new Date(Date.now() + 60_000),
    })
    await request(app)
      .delete(`/api/auth/mobile/devices/${foreign._id}`)
      .set('Authorization', `Bearer ${ipad.accessToken}`)
      .expect(404)

    // Se reconnecter depuis la même installation remplace l'appareil.
    const again = (await login({ name: 'iPad', platform: 'ipados', installationId: 'install-ipad' }).expect(200)).body
    await asBearer(ipad.accessToken).expect(401)
    expect(await MobileDevice.countDocuments({ userId: user._id, revokedAt: null })).toBe(1)

    await request(app).post('/api/auth/mobile/logout').send({ refreshToken: again.refreshToken }).expect(204)
    await asBearer(again.accessToken).expect(401)
    await request(app).post('/api/auth/mobile/logout').send({ refreshToken: 'vnm_rt_inconnu' }).expect(204)
  })
})
