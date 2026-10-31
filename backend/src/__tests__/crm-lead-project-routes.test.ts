import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))

let app: Express

beforeAll(async () => {
  await setupMongo()
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', crmRoutes)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const superAdmin = await User.create({
    email: 'super@test.local',
    name: 'Super',
    role: 'SUPER_ADMIN',
    passwordHash: 'x',
    twoFactorEnabled: true,
  })
  authState.user = { id: String(superAdmin._id), role: 'SUPER_ADMIN', email: 'super@test.local', name: 'Super' }
})

describe('champ project des leads CRM', () => {
  it('crée, modifie, filtre et renvoie le projet', async () => {
    const created = await request(app)
      .post('/api/admin/crm/leads')
      .send({ company: 'Domaine A', project: 'VIGNO' })
      .expect(201)
    expect(created.body.lead.project).toBe('VIGNO')

    await request(app).post('/api/admin/crm/leads').send({ company: 'Sans projet' }).expect(201)

    const filtered = await request(app).get('/api/admin/crm/leads?project=VIGNO').expect(200)
    expect(filtered.body.leads.map((l: { company: string }) => l.company)).toEqual(['Domaine A'])

    const all = await request(app).get('/api/admin/crm/leads').expect(200)
    expect(all.body.leads).toHaveLength(2)
    expect(all.body.leads.find((l: { company: string }) => l.company === 'Sans projet').project).toBe('')

    const patched = await request(app)
      .patch(`/api/admin/crm/leads/${created.body.lead._id}`)
      .send({ project: 'ARROW' })
      .expect(200)
    expect(patched.body.lead.project).toBe('ARROW')
  })

  it('refuse un projet hors liste', async () => {
    await request(app).post('/api/admin/crm/leads').send({ company: 'X', project: 'INCONNU' }).expect(400)
    const ok = await request(app).post('/api/admin/crm/leads').send({ company: 'Y' }).expect(201)
    await request(app).patch(`/api/admin/crm/leads/${ok.body.lead._id}`).send({ project: 'INCONNU' }).expect(400)
  })
})
