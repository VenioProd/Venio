import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import membersRoutes from '../routes/admin/members.js'
import User from '../models/User.js'
import Intern from '../models/Intern.js'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const sendAdminCredentials = vi.hoisted(() => vi.fn())
vi.mock('../lib/email.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/email.js')>()),
  sendAdminCredentials,
}))

let app: Express
let actorRole = 'SUPER_ADMIN'
let actorId = ''

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: actorId, role: actorRole } as Request['user']
    next()
  })
  app.use('/api/admin/members', membersRoutes)
})
afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  sendAdminCredentials.mockReset().mockResolvedValue({ sent: true })
  actorRole = 'SUPER_ADMIN'
  const actor = await User.create({ email: 'root@venio.test', passwordHash: 'x', role: 'SUPER_ADMIN', name: 'Root' })
  actorId = String(actor._id)
})

const post = (payload: Record<string, unknown>) => request(app).post('/api/admin/members').send(payload)

describe('POST /api/admin/members', () => {
  it.each(['ADMIN', 'MANAGER', 'RH', 'COMMERCIAL', 'COMPTABLE', 'VIEWER', 'COMMERCIAL_EXTERNE', 'CLIENT'])(
    'crée un compte %s et envoie les identifiants',
    async (kind) => {
      const res = await post({ kind, name: 'Test', email: `${kind.toLowerCase()}@venio.test` })
      expect(res.status).toBe(201)
      expect(res.body.user.role).toBe(kind)
      expect(res.body.user.passwordHash).toBeUndefined()
      expect(res.body.credentialsSent).toBe(true)
      expect(sendAdminCredentials).toHaveBeenCalledOnce()
    },
  )

  it('crée un alternant avec sa fiche', async () => {
    const res = await post({
      kind: 'ALTERNANT',
      name: 'Alex',
      email: 'alex@venio.test',
      intern: {
        poste: 'Dev',
        dateDebut: '2026-09-01',
        dateFin: '2027-08-31',
        joursPresence: ['lundi', 'mardi', 'zzz'],
      },
    })
    expect(res.status).toBe(201)
    expect(res.body.user.tags).toEqual(['ALTERNANT'])
    const fiche = await Intern.findOne({ userId: res.body.user._id })
    expect(fiche?.type).toBe('ALTERNANT')
    expect(fiche?.joursPresence).toEqual(['lundi', 'mardi'])
  })

  it('refuse un stagiaire dont la fin précède le début, sans créer de compte', async () => {
    const res = await post({
      kind: 'STAGIAIRE',
      name: 'Sam',
      email: 'sam@venio.test',
      intern: { poste: 'Dev', dateDebut: '2026-09-01', dateFin: '2026-01-01' },
    })
    expect(res.status).toBe(400)
    expect(await User.countDocuments({ email: 'sam@venio.test' })).toBe(0)
  })

  it('refuse un statut inconnu, AGENT compris', async () => {
    expect((await post({ kind: 'AGENT', name: 'Bot', email: 'bot@venio.test' })).status).toBe(400)
  })

  it('refuse un email déjà utilisé', async () => {
    await post({ kind: 'ADMIN', name: 'A', email: 'dup@venio.test' })
    expect((await post({ kind: 'RH', name: 'B', email: 'DUP@venio.test' })).status).toBe(409)
  })

  it('un seul super admin', async () => {
    expect((await post({ kind: 'SUPER_ADMIN', name: 'Bis', email: 'bis@venio.test' })).status).toBe(409)
  })

  it('un admin ne peut créer ni super admin, ni stagiaire, ni RH, mais crée un client', async () => {
    actorRole = 'ADMIN'
    expect((await post({ kind: 'SUPER_ADMIN', name: 'X', email: 'x@venio.test' })).status).toBe(403)
    expect(
      (
        await post({
          kind: 'STAGIAIRE',
          name: 'Y',
          email: 'y@venio.test',
          intern: { poste: 'p', dateDebut: '2026-01-01', dateFin: '2026-06-01' },
        })
      ).status,
    ).toBe(403)
    // ADMIN n'a pas MANAGE_ADMINS par défaut : créer un RH est refusé, créer un client reste permis.
    expect((await post({ kind: 'RH', name: 'Z', email: 'z@venio.test' })).status).toBe(403)
    expect((await post({ kind: 'CLIENT', name: 'C', email: 'c@venio.test' })).status).toBe(201)
  })

  it("garde le compte quand l'email échoue et le signale", async () => {
    sendAdminCredentials.mockResolvedValue({ sent: false, error: 'smtp' })
    const res = await post({ kind: 'ADMIN', name: 'A', email: 'a@venio.test' })
    expect(res.status).toBe(201)
    expect(res.body.credentialsSent).toBe(false)
  })

  it("n'envoie rien quand sendInvitation est false", async () => {
    const res = await post({ kind: 'VIEWER', name: 'V', email: 'v@venio.test', sendInvitation: false })
    expect(res.body.credentialsSent).toBe(false)
    expect(sendAdminCredentials).not.toHaveBeenCalled()
  })
})
