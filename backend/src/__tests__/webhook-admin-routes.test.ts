import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

vi.mock('../lib/webhooks/deliver.js', () => ({
  attemptDelivery: vi.fn(async () => ({
    ok: true,
    httpStatus: 200,
    error: '',
    durationMs: 12,
    status: 'DELIVERED',
  })),
  processDueDeliveries: vi.fn(async () => ({ processed: 0, delivered: 0, failed: 0 })),
}))

import { createSession } from '../lib/session.js'
import AuditLog from '../models/AuditLog.js'
import User from '../models/User.js'
import WebhookDelivery from '../models/WebhookDelivery.js'
import WebhookEndpoint from '../models/WebhookEndpoint.js'
import { decryptWebhookSecret, encryptWebhookSecret } from '../lib/webhooks/secret.js'
import adminWebhookRoutes from '../routes/admin/webhooks.js'
import { attemptDelivery } from '../lib/webhooks/deliver.js'

let app: Express
let superAdminCookie: string
let adminCookie: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/webhooks', adminWebhookRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
  const passwordHash = await bcrypt.hash('test', 4)
  const [superAdmin, admin] = await User.create([
    { name: 'Super', email: 'super@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'ADMIN' },
  ])
  superAdminCookie = await cookieFor(String(superAdmin!._id))
  adminCookie = await cookieFor(String(admin!._id))
})

async function seedEndpoint(overrides: Record<string, unknown> = {}) {
  return WebhookEndpoint.create({
    name: 'Kuro',
    url: 'https://kuro.example.test/hooks',
    secretEncrypted: encryptWebhookSecret('d'.repeat(64)),
    ...overrides,
  })
}

describe('RBAC des routes webhooks', () => {
  it('refuse un ADMIN sans permission et un anonyme', async () => {
    await request(app).get('/api/admin/webhooks').expect(401)
    await request(app).get('/api/admin/webhooks').set('Cookie', adminCookie).expect(403)
    await request(app)
      .post('/api/admin/webhooks')
      .set('Cookie', adminCookie)
      .send({ name: 'X', url: 'https://x.example.test/h' })
      .expect(403)
  })
})

describe('CRUD des endpoints', () => {
  it('crée un endpoint et révèle le secret une seule fois', async () => {
    const created = await request(app)
      .post('/api/admin/webhooks')
      .set('Cookie', superAdminCookie)
      .send({ name: 'Kuro', url: 'https://kuro.example.test/hooks', eventTypes: ['TICKET_CREATED'] })
      .expect(201)

    expect(created.body.secret).toMatch(/^[0-9a-f]{64}$/)
    expect(created.body.endpoint.secretEncrypted).toBeUndefined()
    expect(created.body.endpoint.eventTypes).toEqual(['TICKET_CREATED'])

    const stored = await WebhookEndpoint.findById(created.body.endpoint._id).select('+secretEncrypted')
    expect(decryptWebhookSecret(stored!.secretEncrypted)).toBe(created.body.secret)

    const listed = await request(app).get('/api/admin/webhooks').set('Cookie', superAdminCookie).expect(200)
    expect(listed.body.endpoints).toHaveLength(1)
    expect(JSON.stringify(listed.body)).not.toContain(created.body.secret)
    expect(listed.body.endpoints[0].secretEncrypted).toBeUndefined()

    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_ENDPOINT_CREATE' })).toBe(1)
  })

  it('refuse une URL non https hors localhost', async () => {
    const response = await request(app)
      .post('/api/admin/webhooks')
      .set('Cookie', superAdminCookie)
      .send({ name: 'Clair', url: 'http://kuro.example.test/hooks' })
      .expect(400)
    expect(response.body.error).toMatch(/https/i)
    expect(await WebhookEndpoint.countDocuments()).toBe(0)
  })

  it('met à jour un endpoint et remet la santé à zéro à la réactivation', async () => {
    const endpoint = await seedEndpoint({
      isActive: false,
      consecutiveFailures: 20,
      disabledReason: 'AUTO_FAILURES',
      disabledAt: new Date(),
    })

    const response = await request(app)
      .patch(`/api/admin/webhooks/${endpoint._id}`)
      .set('Cookie', superAdminCookie)
      .send({ name: 'Kuro prod', isActive: true })
      .expect(200)

    expect(response.body.endpoint.name).toBe('Kuro prod')
    expect(response.body.endpoint.isActive).toBe(true)
    expect(response.body.endpoint.consecutiveFailures).toBe(0)
    expect(response.body.endpoint.disabledReason).toBeNull()
    expect(response.body.endpoint.disabledAt).toBeNull()
    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_ENDPOINT_UPDATE' })).toBe(1)
  })

  it('marque une désactivation manuelle', async () => {
    const endpoint = await seedEndpoint()

    const response = await request(app)
      .patch(`/api/admin/webhooks/${endpoint._id}`)
      .set('Cookie', superAdminCookie)
      .send({ isActive: false })
      .expect(200)

    expect(response.body.endpoint.disabledReason).toBe('MANUAL')
  })

  it('régénère le secret et ne le renvoie qu’une fois', async () => {
    const endpoint = await seedEndpoint()

    const response = await request(app)
      .post(`/api/admin/webhooks/${endpoint._id}/rotate-secret`)
      .set('Cookie', superAdminCookie)
      .expect(200)

    expect(response.body.secret).toMatch(/^[0-9a-f]{64}$/)
    expect(response.body.secret).not.toBe('d'.repeat(64))
    const stored = await WebhookEndpoint.findById(endpoint._id).select('+secretEncrypted')
    expect(decryptWebhookSecret(stored!.secretEncrypted)).toBe(response.body.secret)
    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_ENDPOINT_ROTATE' })).toBe(1)
  })

  it('supprime l’endpoint et son journal', async () => {
    const endpoint = await seedEndpoint()
    await WebhookDelivery.create({
      endpoint: endpoint._id,
      eventId: 'e1',
      eventType: 'TICKET_CREATED',
      payload: { id: 'e1' },
    })

    const response = await request(app)
      .delete(`/api/admin/webhooks/${endpoint._id}`)
      .set('Cookie', superAdminCookie)
      .expect(200)

    expect(response.body.deletedDeliveries).toBe(1)
    expect(await WebhookEndpoint.countDocuments()).toBe(0)
    expect(await WebhookDelivery.countDocuments()).toBe(0)
    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_ENDPOINT_DELETE' })).toBe(1)
  })

  it('envoie un événement de test immédiat sans passer par le pipeline', async () => {
    const endpoint = await seedEndpoint({ eventTypes: ['TICKET_CREATED'] })

    const response = await request(app)
      .post(`/api/admin/webhooks/${endpoint._id}/test`)
      .set('Cookie', superAdminCookie)
      .expect(200)

    expect(response.body.outcome).toMatchObject({ ok: true, httpStatus: 200 })
    expect(attemptDelivery).toHaveBeenCalledTimes(1)
    const delivery = await WebhookDelivery.findOne().lean()
    // Le filtre eventTypes de l'endpoint ne s'applique pas à un test manuel.
    expect(delivery!.eventType).toBe('WEBHOOK_TEST')
    expect(delivery!.payload).toMatchObject({ type: 'WEBHOOK_TEST' })
    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_TEST_SENT' })).toBe(1)
  })

  it('expose le catalogue des types d’événement abonnables', async () => {
    const response = await request(app).get('/api/admin/webhooks').set('Cookie', superAdminCookie).expect(200)

    expect(Array.isArray(response.body.eventTypes)).toBe(true)
    expect(response.body.eventTypes).toEqual(expect.arrayContaining(['TICKET_CREATED', 'BILLING_INVOICE_CREATED']))
    // Anti-boucle : les types du pipeline ne sont pas abonnables.
    expect(response.body.eventTypes).not.toContain('WEBHOOK_TEST')
    expect(response.body.eventTypes).not.toContain('WEBHOOK_ENDPOINT_DISABLED')
  })
})

describe('journal des livraisons', () => {
  async function seedDeliveries(endpointId: unknown) {
    await WebhookDelivery.create([
      {
        endpoint: endpointId,
        eventId: 'a',
        eventType: 'TICKET_CREATED',
        payload: { id: 'a' },
        status: 'DELIVERED',
      },
      {
        endpoint: endpointId,
        eventId: 'b',
        eventType: 'BILLING_INVOICE_CREATED',
        payload: { id: 'b' },
        status: 'FAILED',
        attempts: [{ at: new Date(), httpStatus: 500, error: 'HTTP 500', durationMs: 20 }],
      },
    ])
  }

  it('pagine et filtre par statut et par type', async () => {
    const endpoint = await seedEndpoint()
    await seedDeliveries(endpoint._id)

    const all = await request(app)
      .get(`/api/admin/webhooks/${endpoint._id}/deliveries`)
      .set('Cookie', superAdminCookie)
      .expect(200)
    expect(all.body.total).toBe(2)
    expect(all.body.deliveries[0].payload).toBeUndefined() // la liste reste légère

    const failed = await request(app)
      .get(`/api/admin/webhooks/${endpoint._id}/deliveries?status=FAILED`)
      .set('Cookie', superAdminCookie)
      .expect(200)
    expect(failed.body.deliveries.map((d: { eventId: string }) => d.eventId)).toEqual(['b'])

    const byType = await request(app)
      .get(`/api/admin/webhooks/${endpoint._id}/deliveries?eventType=TICKET_CREATED`)
      .set('Cookie', superAdminCookie)
      .expect(200)
    expect(byType.body.deliveries.map((d: { eventId: string }) => d.eventId)).toEqual(['a'])
  })

  it('expose le détail avec payload et tentatives', async () => {
    const endpoint = await seedEndpoint()
    await seedDeliveries(endpoint._id)
    const failed = await WebhookDelivery.findOne({ eventId: 'b' })

    const response = await request(app)
      .get(`/api/admin/webhooks/deliveries/${failed!._id}`)
      .set('Cookie', superAdminCookie)
      .expect(200)

    expect(response.body.delivery.payload).toEqual({ id: 'b' })
    expect(response.body.delivery.attempts).toHaveLength(1)
  })

  it('rejoue une livraison en conservant eventId et payload', async () => {
    const endpoint = await seedEndpoint()
    await seedDeliveries(endpoint._id)
    const failed = await WebhookDelivery.findOne({ eventId: 'b' })

    const response = await request(app)
      .post(`/api/admin/webhooks/deliveries/${failed!._id}/replay`)
      .set('Cookie', superAdminCookie)
      .expect(201)

    expect(response.body.delivery._id).not.toBe(String(failed!._id))
    expect(response.body.delivery.eventId).toBe('b')
    expect(response.body.delivery.payload).toEqual({ id: 'b' })
    expect(await WebhookDelivery.countDocuments({ eventId: 'b' })).toBe(2)
    expect(attemptDelivery).toHaveBeenCalledTimes(1)
    expect(await AuditLog.countDocuments({ action: 'WEBHOOK_DELIVERY_REPLAY' })).toBe(1)
  })

  it('lit le journal avec view_webhooks mais refuse le rejeu sans manage_webhooks', async () => {
    const endpoint = await seedEndpoint()
    await seedDeliveries(endpoint._id)
    const reader = await User.create({
      name: 'Lecteur',
      email: 'lecteur@example.test',
      passwordHash: await bcrypt.hash('test', 4),
      role: 'ADMIN',
      grantedPermissions: ['view_webhooks'],
    })
    const readerCookie = await cookieFor(String(reader._id))
    const failed = await WebhookDelivery.findOne({ eventId: 'b' })

    await request(app).get(`/api/admin/webhooks/${endpoint._id}/deliveries`).set('Cookie', readerCookie).expect(200)
    await request(app)
      .post(`/api/admin/webhooks/deliveries/${failed!._id}/replay`)
      .set('Cookie', readerCookie)
      .expect(403)
  })
})
