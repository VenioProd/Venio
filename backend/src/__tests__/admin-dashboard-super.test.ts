import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    ;(req as any).user = { id: new mongoose.Types.ObjectId().toHexString(), role: 'SUPER_ADMIN' }
    next()
  },
}))
vi.mock('../middleware/role.js', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  userHasPermission: async () => true,
}))

let app: Express

beforeAll(async () => {
  await setupMongo()
  const { default: dashboardRoutes } = await import('../routes/admin/dashboard.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/dashboard', dashboardRoutes)
})

afterAll(async () => {
  await teardownMongo()
})
beforeEach(async () => {
  await clearDb()
})

describe('GET /api/admin/dashboard/super', () => {
  it('returns the new pulseChecks field with 7 rules', async () => {
    const res = await request(app).get('/api/admin/dashboard/super').expect(200)
    expect(Array.isArray(res.body.pulseChecks)).toBe(true)
    expect(res.body.pulseChecks).toHaveLength(7)
    const ids = res.body.pulseChecks.map((c: { id: string }) => c.id).sort()
    expect(ids).toEqual([
      'backup-success',
      'briefs-p1-on-time',
      'ca-on-track',
      'hot-leads-followup',
      'pipeline-growing',
      'qualiopi-compliant',
      'team-balanced',
    ])
  })

  it('returns the new kpis field with ca / pipeline / hotLeads / activeProjects', async () => {
    const res = await request(app).get('/api/admin/dashboard/super').expect(200)
    expect(res.body.kpis).toBeDefined()
    expect(res.body.kpis).toHaveProperty('ca')
    expect(res.body.kpis).toHaveProperty('pipeline')
    expect(res.body.kpis).toHaveProperty('hotLeads')
    expect(res.body.kpis).toHaveProperty('activeProjects')
    expect(res.body.kpis.ca).toHaveProperty('value')
    expect(res.body.kpis.ca).toHaveProperty('delta')
    expect(res.body.kpis.ca).toHaveProperty('objective')
    expect(res.body.kpis.pipeline).toHaveProperty('delta')
  })

  it('preserves existing fields (no regression)', async () => {
    const res = await request(app).get('/api/admin/dashboard/super').expect(200)
    expect(res.body).toHaveProperty('alerts')
    expect(res.body).toHaveProperty('mine')
    expect(res.body).toHaveProperty('messages')
    expect(res.body).toHaveProperty('decisions')
    expect(res.body).toHaveProperty('business')
    expect(res.body).toHaveProperty('operations')
    expect(res.body).toHaveProperty('team')
    expect(res.body).toHaveProperty('generatedAt')
  })
})

describe('GET /api/admin/dashboard', () => {
  it('returns command dashboard signals used by the admin cockpit', async () => {
    const res = await request(app).get('/api/admin/dashboard').expect(200)
    expect(res.body).toHaveProperty('pipelineValue')
    expect(res.body).toHaveProperty('pendingDecisionCount')
    expect(res.body).toHaveProperty('staleProjectCount')
    expect(res.body).toHaveProperty('generatedAt')
    expect(res.body.cockpitMeta).toMatchObject({
      source: 'api/admin/dashboard',
      freshnessSlaMinutes: 5,
      staleProjectThresholdDays: 14,
      hotLeadFollowUpHours: 48,
    })
    expect(typeof res.body.pipelineValue).toBe('number')
    expect(typeof res.body.pendingDecisionCount).toBe('number')
    expect(typeof res.body.staleProjectCount).toBe('number')
  })
})
