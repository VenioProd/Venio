import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import request from 'supertest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    ;(req as Request & { user: unknown }).user = {
      id: new mongoose.Types.ObjectId().toHexString(),
      email: 'analytics-test@venio.test',
      name: 'Analytics test',
      role: 'SUPER_ADMIN',
    }
    next()
  },
}))
vi.mock('../middleware/role.js', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  userHasPermission: async () => true,
}))

let app: Express

beforeAll(async () => {
  await setupMongo()
  const [{ default: publicAnalyticsRoutes }, { default: adminAnalyticsRoutes }] = await Promise.all([
    import('../routes/public/analytics.js'),
    import('../routes/admin/analytics.js'),
  ])
  app = express()
  app.use(express.json())
  app.use('/api/public/analytics', publicAnalyticsRoutes)
  app.use('/api/admin/analytics', adminAnalyticsRoutes)
})

afterAll(teardownMongo)
beforeEach(clearDb)

describe('public aggregate analytics', () => {
  it('increments an aggregate daily counter without accepting private paths', async () => {
    await request(app)
      .post('/api/public/analytics/event')
      .send({ event: 'cta_click', path: '/contact', cta: 'home_hero_contact' })
      .expect(204)
    await request(app)
      .post('/api/public/analytics/event')
      .send({ event: 'cta_click', path: '/contact', cta: 'home_hero_contact' })
      .expect(204)
    await request(app)
      .post('/api/public/analytics/event')
      .send({ event: 'page_view', path: '/admin', cta: 'nope' })
      .expect(400)
    await request(app)
      .post('/api/public/analytics/event')
      .send({ event: 'admin_palette_selected', path: '/admin/crm', cta: 'create_lead' })
      .expect(204)

    const report = await request(app).get('/api/admin/analytics/public-site').expect(200)
    const currentMonth = report.body.months.at(-1)
    expect(currentMonth.ctaClicks).toBe(2)
    expect(currentMonth.contactForms).toBe(0)
    expect(report.body.privacy).toMatch(/sans cookie/i)
  })
})
