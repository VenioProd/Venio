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
const ids: Record<string, string> = {}
const actAs = (key: string, role: NonNullable<Request['user']>['role']) => {
  authState.user = { id: ids[key], role, email: `${key}@test.local`, name: key }
}

beforeAll(async () => {
  await setupMongo()
  const { default: extras } = await import('../routes/admin/crmExtras.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', extras)
})
afterAll(async () => {
  authState.user = null
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const users = await User.create([
    { email: 's@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'c1@test.local', name: 'C1', role: 'COMMERCIAL', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'cpt@test.local', name: 'Cpt', role: 'COMPTABLE', passwordHash: 'x', twoFactorEnabled: true },
  ])
  ids.super = String(users[0]._id)
  ids.c1 = String(users[1]._id)
  ids.cpt = String(users[2]._id)
})

describe('/api/admin/crm — vues, groupées, règles', () => {
  it('refuse un rôle sans permission CRM', async () => {
    actAs('cpt', 'COMPTABLE')
    await request(app).get('/api/admin/crm/views').expect(403)
    await request(app).get('/api/admin/crm/rules').expect(403)
  })

  it('une vue d’équipe est lisible par un collègue mais seul son propriétaire la modifie', async () => {
    actAs('super', 'SUPER_ADMIN')
    const team = await request(app).post('/api/admin/crm/views').send({ name: 'Équipe', scope: 'TEAM' }).expect(201)
    await request(app).post('/api/admin/crm/views').send({ name: 'Privée' }).expect(201)
    actAs('c1', 'COMMERCIAL')
    const list = await request(app).get('/api/admin/crm/views').expect(200)
    expect(list.body.items.map((v: { name: string }) => v.name)).toEqual(['Équipe'])
    await request(app).patch(`/api/admin/crm/views/${team.body._id}`).send({ name: 'Hack' }).expect(403)
  })

  it('l’action groupée respecte le périmètre du commercial', async () => {
    const { default: Lead } = await import('../models/Lead.js')
    const mine = await Lead.create({ company: 'Mine', assignedTo: ids.c1, createdBy: ids.c1 })
    const other = await Lead.create({ company: 'Other', assignedTo: ids.super, createdBy: ids.super })
    actAs('c1', 'COMMERCIAL')
    const res = await request(app).post('/api/admin/crm/leads/bulk').send({ ids: [String(mine._id), String(other._id)], action: 'tag', payload: { tag: 'x' } }).expect(200)
    expect(res.body).toMatchObject({ ok: 1, failed: 1 })
    expect((await Lead.findById(other._id))!.tags).toEqual([])
  })

  it('un humain active une règle ; l’export est un CSV', async () => {
    actAs('super', 'SUPER_ADMIN')
    const rule = await request(app).post('/api/admin/crm/rules').send({ name: 'R', trigger: { type: 'LEAD_CREATED' }, actions: [{ type: 'ADD_TAG', params: { tag: 't' } }] }).expect(201)
    const on = await request(app).patch(`/api/admin/crm/rules/${rule.body._id}`).send({ status: 'ACTIVE' }).expect(200)
    expect(on.body.status).toBe('ACTIVE')
    const csv = await request(app).get('/api/admin/crm/leads/export').expect(200)
    expect(csv.headers['content-type']).toContain('text/csv')
  })
})
