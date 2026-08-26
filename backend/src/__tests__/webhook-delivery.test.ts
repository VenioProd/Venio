import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

vi.mock('../lib/notifyHelpers.js', () => ({
  notifySuperAdmins: vi.fn(async () => {}),
  notifyInternalAdmins: vi.fn(async () => {}),
  notifyUsers: vi.fn(async () => {}),
}))

import Notification from '../models/Notification.js'
import WebhookDelivery from '../models/WebhookDelivery.js'
import WebhookEndpoint, { WEBHOOK_AUTO_DISABLE_THRESHOLD } from '../models/WebhookEndpoint.js'
import { computeSignature } from '../lib/external/hmac.js'
import { encryptWebhookSecret } from '../lib/webhooks/secret.js'
import { attemptDelivery, processDueDeliveries, WEBHOOK_BACKOFF_MINUTES } from '../lib/webhooks/deliver.js'
import { notifySuperAdmins } from '../lib/notifyHelpers.js'

const SECRET = 'a'.repeat(64)

interface CapturedRequest {
  method: string
  headers: Record<string, string>
  rawBody: string
}

let server: http.Server
let baseUrl: string
let captured: CapturedRequest[]
let respondWith: { status: number; location?: string }

beforeAll(async () => {
  await setupMongo()
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(chunk as Buffer))
    req.on('end', () => {
      captured.push({
        method: req.method || '',
        headers: req.headers as Record<string, string>,
        rawBody: Buffer.concat(chunks).toString('utf8'),
      })
      if (respondWith.location) res.setHeader('location', respondWith.location)
      res.statusCode = respondWith.status
      res.end('')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
  captured = []
  respondWith = { status: 200 }
})

afterEach(() => {
  vi.useRealTimers()
})

async function seed(overrides: Record<string, unknown> = {}) {
  const endpoint = await WebhookEndpoint.create({
    name: 'Kuro',
    url: `${baseUrl}/hooks/venio`,
    secretEncrypted: encryptWebhookSecret(SECRET),
    ...overrides,
  })
  const delivery = await WebhookDelivery.create({
    endpoint: endpoint._id,
    eventId: 'b3c1e0e4-0000-4000-8000-000000000000',
    eventType: 'TICKET_CREATED',
    payload: {
      id: 'b3c1e0e4-0000-4000-8000-000000000000',
      type: 'TICKET_CREATED',
      occurredAt: '2026-08-26T10:00:00.000Z',
      title: 'Nouveau ticket',
      message: 'Ticket #12',
      link: '/admin/tickets',
      metadata: {},
    },
  })
  return { endpoint, delivery }
}

describe('livraison d’un webhook', () => {
  it('signe le corps exact avec la convention HMAC de Venio', async () => {
    const { delivery } = await seed()

    const outcome = await attemptDelivery(delivery._id)

    expect(outcome?.ok).toBe(true)
    expect(captured).toHaveLength(1)
    const sent = captured[0]!
    expect(sent.method).toBe('POST')
    expect(sent.headers['content-type']).toContain('application/json')
    expect(sent.headers['x-venio-event']).toBe('TICKET_CREATED')
    expect(sent.headers['x-venio-delivery']).toBe(String(delivery._id))
    expect(sent.headers['x-venio-signature']).toBe(
      computeSignature(sent.headers['x-venio-timestamp']!, sent.rawBody, SECRET),
    )
    expect(JSON.parse(sent.rawBody)).toMatchObject({ type: 'TICKET_CREATED', link: '/admin/tickets' })
  })

  it('marque la livraison DELIVERED et remet la santé de l’endpoint à zéro', async () => {
    const { endpoint, delivery } = await seed({ consecutiveFailures: 7 })

    await attemptDelivery(delivery._id)

    const saved = await WebhookDelivery.findById(delivery._id)
    expect(saved?.status).toBe('DELIVERED')
    expect(saved?.nextRetryAt).toBeNull()
    expect(saved?.attempts).toHaveLength(1)
    expect(saved?.attempts[0]?.httpStatus).toBe(200)

    const savedEndpoint = await WebhookEndpoint.findById(endpoint._id)
    expect(savedEndpoint?.consecutiveFailures).toBe(0)
    expect(savedEndpoint?.lastSuccessAt).toBeInstanceOf(Date)
  })

  it('traite une redirection comme un échec, sans la suivre', async () => {
    respondWith = { status: 302, location: `${baseUrl}/ailleurs` }
    const { delivery } = await seed()

    const outcome = await attemptDelivery(delivery._id)

    expect(outcome?.ok).toBe(false)
    expect(captured).toHaveLength(1) // la redirection n'a pas été suivie
    expect((await WebhookDelivery.findById(delivery._id))?.status).toBe('PENDING')
  })

  it('suit le backoff 1/5/30/120/720 minutes puis bascule en FAILED', async () => {
    respondWith = { status: 500 }
    const { delivery } = await seed()

    for (const [index, minutes] of WEBHOOK_BACKOFF_MINUTES.entries()) {
      const before = Date.now()
      await attemptDelivery(delivery._id)
      const saved = await WebhookDelivery.findById(delivery._id)
      expect(saved?.status).toBe('PENDING')
      expect(saved?.attempts).toHaveLength(index + 1)
      const delayMs = saved!.nextRetryAt!.getTime() - before
      expect(delayMs).toBeGreaterThanOrEqual(minutes * 60_000 - 5_000)
      expect(delayMs).toBeLessThanOrEqual(minutes * 60_000 + 5_000)
    }

    await attemptDelivery(delivery._id)
    const exhausted = await WebhookDelivery.findById(delivery._id)
    expect(exhausted?.status).toBe('FAILED')
    expect(exhausted?.attempts).toHaveLength(WEBHOOK_BACKOFF_MINUTES.length + 1)
    expect(exhausted?.nextRetryAt).toBeNull()
  })

  it('désactive l’endpoint au 20e échec consécutif et notifie les super admins', async () => {
    respondWith = { status: 500 }
    const { endpoint, delivery } = await seed({
      consecutiveFailures: WEBHOOK_AUTO_DISABLE_THRESHOLD - 1,
    })

    await attemptDelivery(delivery._id)

    const saved = await WebhookEndpoint.findById(endpoint._id)
    expect(saved?.isActive).toBe(false)
    expect(saved?.disabledReason).toBe('AUTO_FAILURES')
    expect(saved?.disabledAt).toBeInstanceOf(Date)
    expect(notifySuperAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WEBHOOK_ENDPOINT_DISABLED', link: '/admin/webhooks' }),
    )
    // Anti-boucle : la notification d'un webhook ne produit aucune livraison.
    expect(await WebhookDelivery.countDocuments({ eventType: 'WEBHOOK_ENDPOINT_DISABLED' })).toBe(0)
    expect(await Notification.countDocuments()).toBe(0) // notifyHelpers est mocké ici
  })

  it('ne livre rien vers un endpoint désactivé', async () => {
    const { delivery } = await seed({ isActive: false, disabledReason: 'MANUAL' })

    const outcome = await attemptDelivery(delivery._id)

    expect(outcome?.ok).toBe(false)
    expect(captured).toHaveLength(0)
  })

  it('ne reprend que les livraisons PENDING dont le nextRetryAt est échu', async () => {
    const { endpoint } = await seed()
    const now = new Date('2026-08-26T12:00:00.000Z')
    const base = {
      endpoint: endpoint._id,
      eventType: 'TICKET_CREATED',
      payload: { id: 'x', type: 'TICKET_CREATED' },
    }
    const due = await WebhookDelivery.create({
      ...base,
      eventId: 'due',
      nextRetryAt: new Date(now.getTime() - 60_000),
    })
    await WebhookDelivery.create({
      ...base,
      eventId: 'future',
      nextRetryAt: new Date(now.getTime() + 60_000),
    })
    await WebhookDelivery.create({ ...base, eventId: 'failed', status: 'FAILED', nextRetryAt: new Date(0) })

    const result = await processDueDeliveries(now)

    expect(result.processed).toBe(1)
    expect(captured).toHaveLength(1)
    expect(captured[0]!.headers['x-venio-delivery']).toBe(String(due._id))
  })
})
