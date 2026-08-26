import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

vi.mock('../lib/webhooks/deliver.js', () => ({
  attemptDelivery: vi.fn(async () => null),
  processDueDeliveries: vi.fn(async () => ({ processed: 0, delivered: 0, failed: 0 })),
}))

import WebhookDelivery from '../models/WebhookDelivery.js'
import WebhookEndpoint from '../models/WebhookEndpoint.js'
import { encryptWebhookSecret } from '../lib/webhooks/secret.js'
import { emitWebhookEvent } from '../lib/webhookEvents.js'
import { attemptDelivery } from '../lib/webhooks/deliver.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
})

async function endpoint(name: string, overrides: Record<string, unknown> = {}) {
  return WebhookEndpoint.create({
    name,
    url: `https://${name}.example.test/hooks`,
    secretEncrypted: encryptWebhookSecret('b'.repeat(64)),
    ...overrides,
  })
}

describe('emitWebhookEvent', () => {
  it('crée une livraison par endpoint abonné et partage le même eventId', async () => {
    await endpoint('kuro')
    await endpoint('miroir')

    const emitted = await emitWebhookEvent({
      type: 'TICKET_CREATED',
      title: 'Nouveau ticket',
      message: 'Ticket #12',
      link: '/admin/tickets',
      metadata: { ticketId: '12' },
    })

    expect(emitted?.deliveryIds).toHaveLength(2)
    const deliveries = await WebhookDelivery.find().lean()
    expect(deliveries).toHaveLength(2)
    expect(new Set(deliveries.map((d) => d.eventId)).size).toBe(1)
    expect(deliveries[0]!.eventId).toBe(emitted!.eventId)
    expect(deliveries.every((d) => d.status === 'PENDING')).toBe(true)
    expect(attemptDelivery).toHaveBeenCalledTimes(2)
  })

  it('fige un payload conforme au contrat', async () => {
    await endpoint('kuro')

    const emitted = await emitWebhookEvent({
      type: 'TICKET_CREATED',
      title: 'Nouveau ticket',
      message: 'Ticket #12',
      link: '/admin/tickets',
      metadata: { ticketId: '12' },
    })

    const delivery = await WebhookDelivery.findOne().lean()
    expect(delivery!.payload).toEqual({
      id: emitted!.eventId,
      type: 'TICKET_CREATED',
      occurredAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      title: 'Nouveau ticket',
      message: 'Ticket #12',
      link: '/admin/tickets',
      metadata: { ticketId: '12' },
    })
  })

  it('respecte le filtre eventTypes de chaque endpoint', async () => {
    const filtre = await endpoint('filtre', { eventTypes: ['BILLING_INVOICE_CREATED'] })
    const tous = await endpoint('tous', { eventTypes: [] })

    await emitWebhookEvent({ type: 'TICKET_CREATED', title: 'Ticket' })

    const deliveries = await WebhookDelivery.find().lean()
    expect(deliveries).toHaveLength(1)
    expect(String(deliveries[0]!.endpoint)).toBe(String(tous._id))
    expect(await WebhookDelivery.countDocuments({ endpoint: filtre._id })).toBe(0)

    await emitWebhookEvent({ type: 'BILLING_INVOICE_CREATED', title: 'Facture' })
    expect(await WebhookDelivery.countDocuments({ endpoint: filtre._id })).toBe(1)
  })

  it('ignore les endpoints désactivés', async () => {
    await endpoint('coupe', { isActive: false, disabledReason: 'MANUAL' })

    const emitted = await emitWebhookEvent({ type: 'TICKET_CREATED', title: 'Ticket' })

    expect(emitted?.deliveryIds).toEqual([])
    expect(await WebhookDelivery.countDocuments()).toBe(0)
    expect(attemptDelivery).not.toHaveBeenCalled()
  })

  it('n’émet jamais d’événement à propos des webhooks eux-mêmes', async () => {
    await endpoint('kuro')

    expect(await emitWebhookEvent({ type: 'WEBHOOK_ENDPOINT_DISABLED', title: 'Coupé' })).toBeNull()
    expect(await emitWebhookEvent({ type: 'WEBHOOK_TEST', title: 'Test' })).toBeNull()
    expect(await WebhookDelivery.countDocuments()).toBe(0)
  })
})
