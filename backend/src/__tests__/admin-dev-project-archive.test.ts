import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: String(systemUserId), email: 'sys@test.local', role: 'SUPER_ADMIN' } as Request['user']
    next()
  },
}))
vi.mock('../lib/security/sensitiveActions.js', () => ({
  sensitiveAction: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))
// Les permissions accordées sont pilotées par l'en-tête x-perms pour tester les droits.
vi.mock('../middleware/role.js', () => {
  const gate = (needed: string[]) => (req: Request, res: Response, next: NextFunction) => {
    const granted = String(req.headers['x-perms'] ?? '').split(',')
    if (needed.some((p) => granted.includes(p))) return next()
    res.status(403).json({ error: 'forbidden' })
  }
  return {
    requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
    requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
    requirePermission: (p: string) => gate([p]),
    requireAnyPermission: (...p: string[]) => gate(p.flat()),
    userHasPermission: async () => true,
  }
})

let app: Express
let systemUserId: mongoose.Types.ObjectId

const MANAGE = { 'x-perms': 'manage_dev,view_dev' }
const VIEW = { 'x-perms': 'view_dev' }

beforeAll(async () => {
  await setupMongo()
  const { default: devRoutes } = await import('../routes/admin/dev/index.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/dev', devRoutes)
})
afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const { default: User } = await import('../models/User.js')
  const u = await User.create({ email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x' })
  systemUserId = u._id as mongoose.Types.ObjectId
})

async function seed() {
  const { default: DevProject } = await import('../models/DevProject.js')
  const { default: DevIssue } = await import('../models/DevIssue.js')
  const live = await DevProject.create({ key: 'LIVE', name: 'Vivant', createdBy: systemUserId })
  const old = await DevProject.create({ key: 'OLD', name: 'Ancien', createdBy: systemUserId })
  for (const [p, id] of [[live, 'LIVE-1'], [old, 'OLD-1']] as const) {
    await DevIssue.create({
      project: p._id, identifier: id, title: 'T', number: 1,
      status: 'TODO', priority: 'URGENT', type: 'TASK', reporter: systemUserId,
    })
  }
  return { live, old, DevProject, DevIssue }
}

describe('PATCH /api/admin/dev/projects/:id — archivage', () => {
  it('403 sans MANAGE_DEV (VIEW_DEV seul)', async () => {
    const { old, DevProject } = await seed()
    await request(app).patch(`/api/admin/dev/projects/${old._id}`).set(VIEW).send({ status: 'ARCHIVED' }).expect(403)
    expect((await DevProject.findById(old._id))!.status).toBe('ACTIVE')
  })

  it('archive puis restaure, tickets intacts, audit tracé', async () => {
    const { old, DevIssue } = await seed()
    const { default: AuditLog } = await import('../models/AuditLog.js')
    const a = await request(app).patch(`/api/admin/dev/projects/${old._id}`).set(MANAGE).send({ status: 'ARCHIVED' }).expect(200)
    expect(a.body.status).toBe('ARCHIVED')
    expect(a.body.archivedAt).toBeTruthy()
    const issue = await DevIssue.findOne({ identifier: 'OLD-1' }).lean()
    expect(issue!.archivedAt ?? null).toBeNull()
    expect(await AuditLog.countDocuments({ action: 'DEV_PROJECT_ARCHIVED' })).toBe(1)

    const r = await request(app).patch(`/api/admin/dev/projects/${old._id}`).set(MANAGE).send({ status: 'ACTIVE' }).expect(200)
    expect(r.body.status).toBe('ACTIVE')
    expect(r.body.archivedAt).toBeNull()
    expect(await AuditLog.countDocuments({ action: 'DEV_PROJECT_RESTORED' })).toBe(1)
  })

  it('une mise à jour sans changement de statut ne crée pas d’audit d’archivage', async () => {
    const { old } = await seed()
    const { default: AuditLog } = await import('../models/AuditLog.js')
    await request(app).patch(`/api/admin/dev/projects/${old._id}`).set(MANAGE).send({ name: 'Renommé' }).expect(200)
    expect(await AuditLog.countDocuments({ action: { $in: ['DEV_PROJECT_ARCHIVED', 'DEV_PROJECT_RESTORED'] } })).toBe(0)
  })
})

describe('projets archivés : listes et compteurs (admin)', () => {
  it('la liste exclut les archivés par défaut, includeArchived=true les montre', async () => {
    const { old, DevProject } = await seed()
    await DevProject.updateOne({ _id: old._id }, { status: 'ARCHIVED', archivedAt: new Date() })
    const def = await request(app).get('/api/admin/dev/projects').set(VIEW).expect(200)
    expect(def.body.projects.map((p: { key: string }) => p.key)).toEqual(['LIVE'])
    const all = await request(app).get('/api/admin/dev/projects?includeArchived=true').set(VIEW).expect(200)
    expect(all.body.projects.map((p: { key: string }) => p.key).sort()).toEqual(['LIVE', 'OLD'])
    const one = await request(app).get(`/api/admin/dev/projects/${old._id}`).set(VIEW).expect(200)
    expect(one.body.status).toBe('ARCHIVED')
  })

  it('stats et overview excluent les archivés par défaut', async () => {
    const { old, DevProject } = await seed()
    await DevProject.updateOne({ _id: old._id }, { status: 'ARCHIVED', archivedAt: new Date() })
    const stats = await request(app).get('/api/admin/dev/stats').set(VIEW).expect(200)
    expect(stats.body).toMatchObject({ total: 1, open: 1, totalProjects: 1 })
    const all = await request(app).get('/api/admin/dev/stats?includeArchived=true').set(VIEW).expect(200)
    expect(all.body).toMatchObject({ total: 2, open: 2, totalProjects: 2 })
    const ov = await request(app).get('/api/admin/dev/overview').set(VIEW).expect(200)
    expect(ov.body.projects.map((p: { key: string }) => p.key)).toEqual(['LIVE'])
    expect(ov.body.kpis.totalOpen).toBe(1)
    const ovAll = await request(app).get('/api/admin/dev/overview?includeArchived=true').set(VIEW).expect(200)
    expect(ovAll.body.projects).toHaveLength(2)
  })

  it('DELETE archive aussi le projet avec archivedAt', async () => {
    const { old, DevProject } = await seed()
    await request(app).delete(`/api/admin/dev/projects/${old._id}`).set(MANAGE).expect(200)
    const p = await DevProject.findById(old._id).lean()
    expect(p!.status).toBe('ARCHIVED')
    expect(p!.archivedAt).toBeTruthy()
  })
})
