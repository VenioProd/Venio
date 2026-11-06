import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import express from 'express'
import request from 'supertest'
import authRoutes from '../routes/auth.js'
import mobileAuthRoutes from '../routes/mobileAuth.js'
import twoFactorRoutes from '../routes/admin/twoFactor.js'
import adminsRoutes from '../routes/admin/admins.js'
import auth from '../middleware/auth.js'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'
import PasswordResetToken from '../models/PasswordResetToken.js'
import MfaChallenge from '../models/MfaChallenge.js'
import { generateTotp } from '../lib/auth/totp.js'
import { openTotpSecret } from '../lib/auth/twoFactor.js'
import { hashResetToken, issuePasswordResetToken } from '../lib/auth/passwordReset.js'
import { MFA_CHALLENGE_MAX_ATTEMPTS } from '../lib/auth/mfaChallenge.js'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const sendPasswordResetEmail = vi.hoisted(() => vi.fn(async () => ({ sent: true })))
vi.mock('../lib/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/email.js')>()),
  sendPasswordResetEmail,
}))

const app = express()
app.use(express.json())
app.use('/api/auth/mobile', mobileAuthRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/admin/2fa', twoFactorRoutes)
app.use('/api/admin/admins', adminsRoutes)
app.get('/protected', auth, (req, res) =>
  res.json({ userId: req.user!.id, mfaVerifiedAt: req.user!.mfaVerifiedAt ?? null }),
)

const STRONG = 'Gentiane-Orbite-58'
const STRONGER = 'Lichen-Comete-Basalte-31'

async function createUser(email: string, password = STRONG, role = 'CLIENT', name = 'Utilisateur Test') {
  return User.create({ email, name, role, passwordHash: await bcrypt.hash(password, 10) })
}

/** Dernier lien de réinitialisation envoyé (jeton extrait de l'URL). */
function lastResetToken(): string {
  const calls = sendPasswordResetEmail.mock.calls as unknown as Array<[{ resetUrl: string }]>
  const url = calls.at(-1)![0].resetUrl
  return new URL(url).searchParams.get('reset')!
}

/** Active la 2FA via les routes « Sécurité » et renvoie le secret, les codes de secours et l'agent connecté. */
async function enroll(email: string, password = STRONG) {
  const agent = request.agent(app)
  await agent.post('/api/auth/login').send({ email, password }).expect(200)
  const setup = await agent.post('/api/auth/2fa/setup').send({ password }).expect(200)
  const confirm = await agent
    .post('/api/auth/2fa/confirm')
    .send({ code: generateTotp(setup.body.secret, Date.now() - 30_000) })
    .expect(200)
  return { agent, secret: setup.body.secret as string, recoveryCodes: confirm.body.recoveryCodes as string[] }
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test'
  delete process.env.MFA_ENABLED
  await setupMongo()
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  sendPasswordResetEmail.mockClear()
  sendPasswordResetEmail.mockImplementation(async () => ({ sent: true }))
})

describe('password reset tokens (VENIO-116)', () => {
  it('persists only the SHA-256 digest of a 1-hour token', async () => {
    const user = await createUser('reset@example.test')
    await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.test' }).expect(200)
    const token = lastResetToken()
    const stored = await PasswordResetToken.find({ userId: user._id }).lean()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.tokenHash).toBe(hashResetToken(token))
    expect(JSON.stringify(stored)).not.toContain(token)
    const ttl = stored[0]!.expiresAt.getTime() - Date.now()
    expect(ttl).toBeGreaterThan(59 * 60 * 1000)
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000)
    const indexes = await PasswordResetToken.collection.indexes()
    expect(indexes.find((index) => index.key.expiresAt === 1)?.expireAfterSeconds).toBe(0)
  })

  it('resets the password once, then refuses the same link', async () => {
    await createUser('once@example.test')
    await request(app).post('/api/auth/forgot-password').send({ email: 'once@example.test' }).expect(200)
    const token = lastResetToken()
    await request(app).post('/api/auth/reset-password').send({ token, password: STRONGER }).expect(200)
    await request(app).post('/api/auth/login').send({ email: 'once@example.test', password: STRONGER }).expect(200)
    const replay = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'Autre-Phrase-Secrete-42' })
    expect(replay.status).toBe(400)
    expect(replay.body.code).toBe('RESET_TOKEN_INVALID')
  })

  it('refuses an expired link even before the TTL purge', async () => {
    const user = await createUser('expired@example.test')
    const { token } = await issuePasswordResetToken(user._id)
    await PasswordResetToken.updateOne({ userId: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: STRONGER })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('RESET_TOKEN_INVALID')
  })

  it('invalidates previous links on a new request and after a password change', async () => {
    const user = await createUser('rotate@example.test')
    await request(app).post('/api/auth/forgot-password').send({ email: 'rotate@example.test' }).expect(200)
    const first = lastResetToken()
    await request(app).post('/api/auth/forgot-password').send({ email: 'rotate@example.test' }).expect(200)
    const second = lastResetToken()
    expect(second).not.toBe(first)
    await request(app).post('/api/auth/reset-password').send({ token: first, password: STRONGER }).expect(400)

    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email: 'rotate@example.test', password: STRONG }).expect(200)
    await agent.post('/api/auth/change-password').send({ currentPassword: STRONG, newPassword: STRONGER }).expect(200)
    await request(app)
      .post('/api/auth/reset-password')
      .send({ token: second, password: 'Autre-Phrase-Secrete-42' })
      .expect(400)
    expect(await PasswordResetToken.countDocuments({ userId: user._id, usedAt: null })).toBe(0)
  })

  it('does not burn the link when the new password is refused by the policy', async () => {
    await createUser('policy-reset@example.test')
    await request(app).post('/api/auth/forgot-password').send({ email: 'policy-reset@example.test' }).expect(200)
    const token = lastResetToken()
    const weak = await request(app).post('/api/auth/reset-password').send({ token, password: 'court' })
    expect(weak.status).toBe(400)
    expect(weak.body.code).toBe('PASSWORD_TOO_SHORT')
    await request(app).post('/api/auth/reset-password').send({ token, password: STRONGER }).expect(200)
  })

  it('answers identically whether the account exists or not, even when the e-mail fails', async () => {
    await createUser('known@example.test')
    sendPasswordResetEmail.mockImplementation(async () => {
      throw new Error('SMTP down')
    })
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'known@example.test' })
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.test' })
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(known.body).toEqual(unknown.body)
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1)
    expect(await PasswordResetToken.countDocuments()).toBe(1)
  })

  it('uses the persistent store for the super-admin reset link too', async () => {
    const actor = await createUser('boss@example.test', STRONG, 'SUPER_ADMIN', 'Patronne')
    const target = await createUser('member@example.test', STRONG, 'ADMIN', 'Membre')
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email: actor.email, password: STRONG }).expect(200)
    const res = await agent.post(`/api/admin/admins/${target._id}/reset-link`).expect(200)
    const token = new URL(res.body.resetUrl).searchParams.get('reset')!
    expect(await PasswordResetToken.exists({ userId: target._id, tokenHash: hashResetToken(token) })).toBeTruthy()
    await request(app).post('/api/auth/reset-password').send({ token, password: STRONGER }).expect(200)
  })
})

describe('password policy on every write (VENIO-117)', () => {
  it('refuses short, common or personal passwords when changing it', async () => {
    await createUser('change@example.test', STRONG, 'CLIENT', 'Camille Durand')
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email: 'change@example.test', password: STRONG }).expect(200)
    for (const [newPassword, code] of [
      ['Court-1', 'PASSWORD_TOO_SHORT'],
      ['Password2026!!', 'PASSWORD_TOO_COMMON'],
      ['durand-camille-99', 'PASSWORD_CONTAINS_IDENTITY'],
      [STRONG, 'PASSWORD_UNCHANGED'],
    ]) {
      const res = await agent.post('/api/auth/change-password').send({ currentPassword: STRONG, newPassword })
      expect(res.status).toBe(400)
      expect(res.body.code).toBe(code)
    }
  })

  it('applies to accounts created or edited by an administrator', async () => {
    const actor = await createUser('boss@example.test', STRONG, 'SUPER_ADMIN', 'Patronne')
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email: actor.email, password: STRONG }).expect(200)
    const weak = await agent
      .post('/api/admin/admins')
      .send({ email: 'nouveau@example.test', name: 'Nouveau', password: 'abc123', role: 'ADMIN' })
    expect(weak.status).toBe(400)
    expect(weak.body.code).toBe('PASSWORD_TOO_SHORT')
    const created = await agent
      .post('/api/admin/admins')
      .send({ email: 'nouveau@example.test', name: 'Nouveau', password: STRONGER, role: 'ADMIN' })
      .expect(201)
    const id = created.body.user?._id ?? created.body._id
    const weakPatch = await agent.patch(`/api/admin/admins/${id}`).send({ password: 'nouveau-2026-x' })
    expect(weakPatch.status).toBe(400)
    expect(weakPatch.body.code).toBe('PASSWORD_CONTAINS_IDENTITY')
  })

  it('keeps existing weak passwords valid at login but flags them for upgrade', async () => {
    await createUser('legacy@example.test', 'azerty')
    const weak = await request(app).post('/api/auth/login').send({ email: 'legacy@example.test', password: 'azerty' })
    expect(weak.status).toBe(200)
    expect(weak.body).toMatchObject({ passwordNeedsUpgrade: true })
    await createUser('fine@example.test', STRONG)
    const fine = await request(app).post('/api/auth/login').send({ email: 'fine@example.test', password: STRONG })
    expect(fine.body.passwordNeedsUpgrade).toBeUndefined()
  })
})

describe('optional TOTP 2FA (VENIO-117)', () => {
  it('enrolls any account, encrypts the secret at rest and returns 10 recovery codes once', async () => {
    const user = await createUser('client2fa@example.test')
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ email: user.email, password: STRONG }).expect(200)
    await agent.post('/api/auth/2fa/setup').send({ password: 'mauvais' }).expect(400)
    const setup = await agent.post('/api/auth/2fa/setup').send({ password: STRONG }).expect(200)
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/Venio%3Aclient2fa%40example\.test\?secret=/)
    expect(setup.body.qrDataUrl).toMatch(/^data:image\/png;base64,/)
    const stored = await User.findById(user._id).select('+twoFactorSecret').lean()
    expect(stored!.twoFactorSecret).toMatch(/^v1:/)
    expect(stored!.twoFactorSecret).not.toContain(setup.body.secret)
    expect(openTotpSecret(stored!.twoFactorSecret)).toBe(setup.body.secret)
    expect(stored!.twoFactorEnabled).toBe(false)

    await agent.post('/api/auth/2fa/confirm').send({ code: '000000' }).expect(400)
    const confirm = await agent
      .post('/api/auth/2fa/confirm')
      .send({ code: generateTotp(setup.body.secret) })
      .expect(200)
    expect(confirm.body.recoveryCodes).toHaveLength(10)
    const enabled = await User.findById(user._id).select('+twoFactorRecoveryCodeHashes').lean()
    expect(enabled!.twoFactorEnabled).toBe(true)
    expect(enabled!.twoFactorRecoveryCodeHashes).toHaveLength(10)
    expect(enabled!.twoFactorRecoveryCodeHashes.join(' ')).not.toContain(confirm.body.recoveryCodes[0])
    const status = await agent.get('/api/auth/2fa/status').expect(200)
    expect(status.body).toMatchObject({ enabled: true, recoveryCodesRemaining: 10 })
    expect(await AuditLog.exists({ userId: user._id, action: 'MFA_ENABLED' })).toBeTruthy()
  })

  it('logs in in two steps with a short-lived token, then refuses the replayed code', async () => {
    const user = await createUser('twostep@example.test', 'azerty')
    await User.updateOne({ _id: user._id }, { $set: { passwordHash: await bcrypt.hash(STRONG, 10) } })
    const { secret } = await enroll(user.email)

    const first = await request(app).post('/api/auth/login').send({ email: user.email, password: STRONG }).expect(200)
    expect(first.body).toMatchObject({ mfaRequired: true, requires2FA: true })
    expect(first.body.mfaToken).toMatch(/^mfa_/)
    expect(first.body.mfaTokenExpiresIn).toBe(300)
    expect(first.headers['set-cookie']).toBeUndefined()

    const code = generateTotp(secret)
    const verified = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: first.body.mfaToken, code })
      .expect(200)
    const cookie = verified.headers['set-cookie']?.[0]
    expect(cookie).toMatch(/^venio_session=/)
    const me = await request(app).get('/protected').set('Cookie', cookie!).expect(200)
    expect(me.body.mfaVerifiedAt).toBeTruthy()

    // Jeton consommé, et le même code ne repasse pas sur une nouvelle connexion.
    await request(app).post('/api/auth/mfa/verify').send({ mfaToken: first.body.mfaToken, code }).expect(401)
    const again = await request(app).post('/api/auth/login').send({ email: user.email, password: STRONG }).expect(200)
    const replay = await request(app).post('/api/auth/mfa/verify').send({ mfaToken: again.body.mfaToken, code })
    expect(replay.status).toBe(401)
    expect(replay.body.code).toBe('MFA_CODE_INVALID')
    // Le code du pas suivant (dans la fenêtre de tolérance) est accepté.
    await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: again.body.mfaToken, code: generateTotp(secret, Date.now() + 30_000) })
      .expect(200)
  })

  it('carries the "password to strengthen" flag through the second step', async () => {
    await createUser('weak2fa@example.test')
    const { secret } = await enroll('weak2fa@example.test')
    await User.updateOne({ email: 'weak2fa@example.test' }, { $set: { passwordHash: await bcrypt.hash('soleil', 10) } })
    const first = await request(app).post('/api/auth/login').send({ email: 'weak2fa@example.test', password: 'soleil' })
    const verified = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: first.body.mfaToken, code: generateTotp(secret, Date.now() + 30_000) })
      .expect(200)
    expect(verified.body).toMatchObject({ passwordNeedsUpgrade: true })
  })

  it('refuses codes outside the ±1 step window', async () => {
    await createUser('window@example.test')
    const { secret } = await enroll('window@example.test')
    const first = await request(app).post('/api/auth/login').send({ email: 'window@example.test', password: STRONG })
    for (const offset of [-90_000, 90_000]) {
      await request(app)
        .post('/api/auth/mfa/verify')
        .send({ mfaToken: first.body.mfaToken, code: generateTotp(secret, Date.now() + offset) })
        .expect(401)
    }
  })

  it('burns the login token after too many wrong codes, and expires it', async () => {
    await createUser('brute@example.test')
    const { secret } = await enroll('brute@example.test')
    const first = await request(app).post('/api/auth/login').send({ email: 'brute@example.test', password: STRONG })
    for (let attempt = 0; attempt < MFA_CHALLENGE_MAX_ATTEMPTS; attempt += 1) {
      await request(app)
        .post('/api/auth/mfa/verify')
        .send({ mfaToken: first.body.mfaToken, code: '000000' })
        .expect(401)
    }
    const locked = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: first.body.mfaToken, code: generateTotp(secret, Date.now() + 30_000) })
    expect(locked.status).toBe(401)
    expect(locked.body.code).toBe('MFA_TOKEN_INVALID')

    const second = await request(app).post('/api/auth/login').send({ email: 'brute@example.test', password: STRONG })
    await MfaChallenge.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const expired = await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: second.body.mfaToken, code: generateTotp(secret, Date.now() + 30_000) })
    expect(expired.body.code).toBe('MFA_TOKEN_INVALID')
  })

  it('accepts each recovery code exactly once', async () => {
    const user = await createUser('recovery@example.test')
    const { recoveryCodes } = await enroll(user.email)
    const login = () => request(app).post('/api/auth/login').send({ email: user.email, password: STRONG })
    const first = await login()
    await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: first.body.mfaToken, recoveryCode: recoveryCodes[0]!.toLowerCase() })
      .expect(200)
    const second = await login()
    await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: second.body.mfaToken, recoveryCode: recoveryCodes[0] })
      .expect(401)
    const left = await User.findById(user._id).select('+twoFactorRecoveryCodeHashes').lean()
    expect(left!.twoFactorRecoveryCodeHashes).toHaveLength(9)
    expect(await AuditLog.exists({ userId: user._id, action: 'MFA_RECOVERY_CODE_USED' })).toBeTruthy()
  })

  it('regenerates recovery codes with password and code, invalidating the old ones', async () => {
    const user = await createUser('regen@example.test')
    const { agent, secret, recoveryCodes } = await enroll(user.email)
    await agent.post('/api/auth/2fa/recovery-codes').send({ password: STRONG, code: '000000' }).expect(400)
    const regen = await agent
      .post('/api/auth/2fa/recovery-codes')
      .send({ password: STRONG, code: generateTotp(secret) })
      .expect(200)
    expect(regen.body.recoveryCodes).toHaveLength(10)
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: STRONG })
    await request(app)
      .post('/api/auth/mfa/verify')
      .send({ mfaToken: login.body.mfaToken, recoveryCode: recoveryCodes[1] })
      .expect(401)
  })

  it('disables 2FA only with the password and a valid code', async () => {
    const user = await createUser('disable@example.test')
    const { agent, secret } = await enroll(user.email)
    await agent.post('/api/auth/2fa/disable').send({ password: STRONG, code: '000000' }).expect(400)
    await agent
      .post('/api/auth/2fa/disable')
      .send({ password: 'mauvais-mot-de-passe', code: generateTotp(secret) })
      .expect(400)
    await agent
      .post('/api/auth/2fa/disable')
      .send({ password: STRONG, code: generateTotp(secret) })
      .expect(200)
    const after = await User.findById(user._id).select('+twoFactorSecret +twoFactorRecoveryCodeHashes').lean()
    expect(after).toMatchObject({ twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodeHashes: [] })
    const login = await request(app).post('/api/auth/login').send({ email: user.email, password: STRONG }).expect(200)
    expect(login.body.mfaRequired).toBeUndefined()
    expect(await AuditLog.exists({ userId: user._id, action: 'MFA_DISABLED' })).toBeTruthy()
  })

  it("lets only the super-admin reset a member's 2FA, with an audit entry", async () => {
    const boss = await createUser('boss@example.test', STRONG, 'SUPER_ADMIN', 'Patronne')
    const admin = await createUser('admin@example.test', STRONG, 'ADMIN', 'Adjointe')
    const member = await createUser('member@example.test', STRONG, 'ADMIN', 'Membre')
    await enroll(member.email)

    const adminAgent = request.agent(app)
    await adminAgent.post('/api/auth/login').send({ email: admin.email, password: STRONG }).expect(200)
    await adminAgent.post(`/api/admin/2fa/users/${member._id}/reset`).expect(403)

    const bossAgent = request.agent(app)
    await bossAgent.post('/api/auth/login').send({ email: boss.email, password: STRONG }).expect(200)
    await bossAgent.post(`/api/admin/2fa/users/${member._id}/reset`).expect(200)
    const after = await User.findById(member._id).select('+twoFactorSecret').lean()
    expect(after).toMatchObject({ twoFactorEnabled: false, twoFactorSecret: null })
    const entry = await AuditLog.findOne({ action: 'MFA_RESET_BY_ADMIN' }).lean()
    expect(String(entry!.userId)).toBe(String(boss._id))
    expect(entry!.metadata).toMatchObject({ entityType: 'User', entityId: String(member._id) })
    await request(app).post('/api/auth/login').send({ email: member.email, password: STRONG }).expect(200)
    await bossAgent.post(`/api/admin/2fa/users/${member._id}/reset`).expect(400)
  })

  it('still requires the code once MFA_ENABLED is off (voluntary 2FA)', async () => {
    await createUser('voluntary@example.test', STRONG, 'ADMIN', 'Volontaire')
    await enroll('voluntary@example.test')
    expect(process.env.MFA_ENABLED).toBeUndefined()
    const login = await request(app).post('/api/auth/login').send({ email: 'voluntary@example.test', password: STRONG })
    expect(login.body.mfaRequired).toBe(true)
  })

  it('keeps the mobile app flow: requires2FA, then credentials and code in one request', async () => {
    await createUser('mobile@example.test', STRONG, 'ADMIN', 'Mobile')
    const { secret } = await enroll('mobile@example.test')
    const device = { name: 'iPhone test', platform: 'ios' }
    const challenge = await request(app)
      .post('/api/auth/mobile/login')
      .send({ email: 'mobile@example.test', password: STRONG, device })
      .expect(200)
    expect(challenge.body).toEqual({ requires2FA: true })
    const res = await request(app)
      .post('/api/auth/mobile/login')
      .send({ email: 'mobile@example.test', password: STRONG, totpCode: generateTotp(secret), device })
      .expect(200)
    expect(res.body.accessToken).toBeTruthy()
    // Les routes de sécurité du compte restent fermées aux jetons de l'app.
    await request(app)
      .post('/api/auth/2fa/disable')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .send({ password: STRONG, code: generateTotp(secret, Date.now() + 30_000) })
      .expect(403)
  })
})
