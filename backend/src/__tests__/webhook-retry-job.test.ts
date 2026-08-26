import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

vi.mock('../lib/webhooks/deliver.js', () => ({
  attemptDelivery: vi.fn(async () => null),
  processDueDeliveries: vi.fn(async () => ({ processed: 3, delivered: 2, failed: 1 })),
}))

import { shouldRunNow } from '../automation/scheduler.js'
import { getAutomation, getCronAutomations } from '../automation/registry.js'
import { buildContext } from '../automation/engine.js'
import { definition, register } from '../automation/jobs/webhookDeliveryRetry.js'
import { processDueDeliveries } from '../lib/webhooks/deliver.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
})

describe('planification à la minute', () => {
  it('déclenche une expression cron "toutes les minutes" à chaque tick', () => {
    expect(shouldRunNow('* * * * *', new Date('2026-08-26T10:00:00'))).toBe(true)
    expect(shouldRunNow('* * * * *', new Date('2026-08-26T10:37:00'))).toBe(true)
  })

  it('respecte un pas "*/5"', () => {
    expect(shouldRunNow('*/5 * * * *', new Date('2026-08-26T10:05:00'))).toBe(true)
    expect(shouldRunNow('*/5 * * * *', new Date('2026-08-26T10:07:00'))).toBe(false)
  })

  it('conserve les formats horaires existants', () => {
    expect(shouldRunNow('08:00', new Date('2026-08-26T08:00:00'))).toBe(true)
    expect(shouldRunNow('08:00', new Date('2026-08-26T08:01:00'))).toBe(false)
    expect(shouldRunNow(undefined, new Date())).toBe(false)
  })
})

describe('automation webhooks.delivery_retry', () => {
  it('s’enregistre comme automation cron du moteur', () => {
    register()
    expect(getAutomation('webhooks.delivery_retry')).toBeDefined()
    expect(getCronAutomations().map((job) => job.key)).toContain('webhooks.delivery_retry')
    expect(definition.schedule).toBe('* * * * *')
    expect(definition.triggerType).toBe('cron')
  })

  it('produit une clé d’idempotence distincte à chaque minute', () => {
    const first = definition.buildIdempotencyKey({
      ...buildContext(),
      now: new Date('2026-08-26T10:00:00'),
      dateKey: '2026-08-26',
    })
    const second = definition.buildIdempotencyKey({
      ...buildContext(),
      now: new Date('2026-08-26T10:01:00'),
      dateKey: '2026-08-26',
    })
    expect(first).not.toBe(second)
    expect(first).toContain('webhooks.delivery_retry')
  })

  it('reprend les livraisons échues par lot borné et rend compte du résultat', async () => {
    const ctx = buildContext()
    const result = await definition.execute(ctx)

    expect(processDueDeliveries).toHaveBeenCalledWith(ctx.now, 50)
    expect(result.details).toMatchObject({ processed: 3, delivered: 2, failed: 1 })
    expect(result.actionsExecuted).toContain('webhooks:retry:3')
    expect(result.recipientsNotified).toEqual([])
  })
})
