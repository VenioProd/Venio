import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminsRoutes from '../routes/admin/admins.js'
import User from '../models/User.js'
import AuditLog from '../models/AuditLog.js'

vi.mock('../lib/notifyHelpers.js', () => ({
  notifySuperAdmins: vi.fn().mockResolvedValue(undefined),
  notifyUsers: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../lib/email.js', () => ({
  sendAdminCredentials: vi.fn().mockResolvedValue({ sent: true }),
  sendPasswordResetEmail: vi.fn().mockResolvedValue({ sent: true }),
}))

const app = express()
app.use(express.json())
app.use('/api/admin/admins', adminsRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

async function cookieFor(role: string, name: string): Promise<string> {
  const user = await User.create({ name, email: `${name.toLowerCase()}@example.test`, passwordHash: 'unused', role })
  return `venio_session=${(await createSession(String(user._id))).token}`
}

const create = (cookie: string, body: object) =>
  request(app)
    .post('/api/admin/admins')
    .set('Cookie', cookie)
    .send({ password: 'Kx7-trampoline-Qv', ...body })

let superCookie: string

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  superCookie = await cookieFor('SUPER_ADMIN', 'Raphael')
})

describe("création d'un membre de l'équipe", () => {
  it('enregistre la fonction, le statut d’associé et les exceptions de droits, et trace l’associé', async () => {
    const res = await create(superCookie, {
      name: 'Camille',
      email: 'camille@example.test',
      role: 'COMMERCIAL',
      title: '  Directrice commerciale ',
      jobTitle: 'Directrice commerciale',
      isAssociate: true,
      grantedPermissions: ['manage_quotes', 'inexistante'],
      deniedPermissions: ['view_billing'],
    })
    expect(res.status).toBe(201)
    const stored = await User.findById(res.body.user._id).lean()
    expect(stored).toMatchObject({
      role: 'COMMERCIAL',
      title: 'Directrice commerciale',
      jobTitle: 'Directrice commerciale',
      isAssociate: true,
      grantedPermissions: ['manage_quotes'],
      deniedPermissions: ['view_billing'],
    })
    expect(
      await AuditLog.countDocuments({ action: 'PERMISSION_CHANGED', 'metadata.entityId': String(stored!._id) }),
    ).toBe(1)
  })

  it('refuse un statut d’associé qui n’est pas un booléen, et n’en trace aucun par défaut', async () => {
    expect((await create(superCookie, { name: 'A', email: 'a@example.test', isAssociate: 'oui' })).status).toBe(400)
    const res = await create(superCookie, { name: 'B', email: 'b@example.test', role: 'VIEWER' })
    expect(res.status).toBe(201)
    expect((await User.findById(res.body.user._id).lean())!.isAssociate).toBe(false)
    expect(await AuditLog.countDocuments({ action: 'PERMISSION_CHANGED' })).toBe(0)
  })

  it('ne crée jamais un compte système, un client ni un second super admin', async () => {
    for (const role of ['AGENT', 'CLIENT', 'SUPER_ADMIN', 'PDG']) {
      const res = await create(superCookie, { name: 'X', email: `${role.toLowerCase()}@example.test`, role })
      expect(res.status, role).toBeGreaterThanOrEqual(400)
    }
    expect(await User.countDocuments({ role: { $in: ['AGENT', 'CLIENT'] } })).toBe(0)
    expect(await User.countDocuments({ role: 'SUPER_ADMIN' })).toBe(1)
  })

  it('ignore les exceptions de droits venant d’un compte qui n’est pas super admin', async () => {
    const grantedBy = await User.create({
      name: 'Gestionnaire',
      email: 'gestionnaire@example.test',
      passwordHash: 'unused',
      role: 'ADMIN',
      grantedPermissions: ['manage_admins'],
    })
    const cookie = `venio_session=${(await createSession(String(grantedBy._id))).token}`
    const res = await create(cookie, {
      name: 'Dana',
      email: 'dana@example.test',
      role: 'VIEWER',
      grantedPermissions: ['manage_admins'],
      isAssociate: false,
    })
    expect(res.status).toBe(201)
    expect((await User.findById(res.body.user._id).lean())!.grantedPermissions).toEqual([])
  })

  it('crée un commercial externe sans aucun droit admin', async () => {
    const res = await create(superCookie, { name: 'Eli', email: 'eli@example.test', role: 'COMMERCIAL_EXTERNE' })
    expect(res.status).toBe(201)
    expect(res.body.user).toMatchObject({ role: 'COMMERCIAL_EXTERNE', isAssociate: false })
  })
})
