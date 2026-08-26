import { describe, expect, it } from 'vitest'
import type { IndexDefinition, IndexOptions } from 'mongoose'
import WebhookDelivery, { WEBHOOK_DELIVERY_TTL_DAYS } from './WebhookDelivery.js'
import WebhookEndpoint from './WebhookEndpoint.js'

type Model = { schema: { indexes: () => [IndexDefinition, IndexOptions][] } }

function findIndex(model: Model, keys: IndexDefinition): IndexOptions | undefined {
  return model.schema.indexes().find(([declared]) => JSON.stringify(declared) === JSON.stringify(keys))?.[1]
}

describe('contrats d’index du pipeline webhooks', () => {
  it('purge automatiquement les livraisons après 30 jours', () => {
    const options = findIndex(WebhookDelivery, { createdAt: 1 })
    expect(options).toBeDefined()
    expect(options?.expireAfterSeconds).toBe(WEBHOOK_DELIVERY_TTL_DAYS * 24 * 60 * 60)
  })

  it('indexe le journal par endpoint et la reprise des livraisons échues', () => {
    expect(findIndex(WebhookDelivery, { endpoint: 1, createdAt: -1 })).toBeDefined()
    expect(findIndex(WebhookDelivery, { status: 1, nextRetryAt: 1 })).toBeDefined()
    expect(findIndex(WebhookDelivery, { eventId: 1 })).toBeDefined()
  })

  it('indexe les endpoints actifs pour la résolution à l’émission', () => {
    expect(findIndex(WebhookEndpoint, { isActive: 1 })).toBeDefined()
  })

  it('applique les valeurs par défaut d’un endpoint neuf', () => {
    const endpoint = new WebhookEndpoint({
      name: 'Kuro',
      url: 'https://kuro.example.test/hooks/venio',
      secretEncrypted: 'v1:chiffre',
    })
    expect(endpoint.isActive).toBe(true)
    expect(endpoint.eventTypes).toEqual([])
    expect(endpoint.consecutiveFailures).toBe(0)
    expect(endpoint.disabledAt).toBeNull()
    expect(endpoint.disabledReason).toBeNull()
  })

  it('applique les valeurs par défaut d’une livraison neuve', () => {
    const delivery = new WebhookDelivery({
      endpoint: new WebhookEndpoint()._id,
      eventId: 'b3c1e0e4-0000-4000-8000-000000000000',
      eventType: 'TICKET_CREATED',
      payload: { id: 'x' },
    })
    expect(delivery.status).toBe('PENDING')
    expect(delivery.attempts).toEqual([])
    expect(delivery.nextRetryAt).toBeNull()
  })
})
