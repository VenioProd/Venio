import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const shouldNotifyMock = vi.fn(async () => true)

vi.mock('../lib/notificationPreferences.js', () => ({
  shouldNotify: (...args: unknown[]) => shouldNotifyMock(...(args as [])),
}))
vi.mock('../lib/webPush.js', () => ({ sendPushToUser: vi.fn(async () => {}) }))
vi.mock('../realtime/ioSingleton.js', () => ({ getIo: vi.fn(() => null) }))
vi.mock('../lib/webhooks/deliver.js', () => ({
  attemptDelivery: vi.fn(async () => null),
  processDueDeliveries: vi.fn(async () => ({ processed: 0, delivered: 0, failed: 0 })),
}))

import User from '../models/User.js'
import WebhookDelivery from '../models/WebhookDelivery.js'
import WebhookEndpoint from '../models/WebhookEndpoint.js'
import { encryptWebhookSecret } from '../lib/webhooks/secret.js'
import { createNotification } from '../lib/notifications.js'
import { notifyInternalAdmins, notifySuperAdmins, notifyUsers } from '../lib/notifyHelpers.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
  shouldNotifyMock.mockImplementation(async () => true)
  await WebhookEndpoint.create({
    name: 'Kuro',
    url: 'https://kuro.example.test/hooks',
    secretEncrypted: encryptWebhookSecret('c'.repeat(64)),
  })
})

async function seedSuperAdmins(count: number): Promise<string[]> {
  const admins = await User.create(
    Array.from({ length: count }, (_, index) => ({
      name: `Admin ${index}`,
      email: `admin${index}@example.test`,
      passwordHash: 'x',
      role: 'SUPER_ADMIN',
      isActive: true,
    })),
  )
  return admins.map((admin) => String(admin._id))
}

const waitForDeliveries = (count: number) =>
  vi.waitFor(async () => expect(await WebhookDelivery.countDocuments()).toBe(count))

describe('dédup du pipeline face aux broadcasts', () => {
  it('n’émet qu’une livraison par endpoint quand 3 super admins sont notifiés', async () => {
    const admins = await seedSuperAdmins(3)

    await notifySuperAdmins({
      type: 'TICKET_CREATED',
      title: 'Nouveau ticket',
      message: 'Ticket #12',
      link: '/admin/tickets',
    })

    await waitForDeliveries(1)
    expect(await mongoose.model('Notification').countDocuments({ recipient: { $in: admins } })).toBe(3)
  })

  it('n’émet qu’une livraison pour notifyInternalAdmins et pour notifyUsers', async () => {
    const admins = await seedSuperAdmins(2)

    await notifyInternalAdmins({ type: 'TICKET_CREATED', title: 'Interne' })
    await waitForDeliveries(1)

    await notifyUsers(admins, { type: 'TICKET_CREATED', title: 'Ciblé' })
    await waitForDeliveries(2)
  })

  it('émet même quand la préférence in-app coupe la notification', async () => {
    const [admin] = await seedSuperAdmins(1)
    shouldNotifyMock.mockImplementation(async () => false)

    await notifySuperAdmins({ type: 'TICKET_CREATED', title: 'Broadcast coupé' })
    await waitForDeliveries(1)

    await createNotification({ recipient: admin!, type: 'TICKET_CREATED', title: 'Direct coupé' })
    await waitForDeliveries(2)
    expect(await mongoose.model('Notification').countDocuments()).toBe(0)
  })

  it('émet une livraison pour un createNotification direct', async () => {
    const [admin] = await seedSuperAdmins(1)

    await createNotification({ recipient: admin!, type: 'TICKET_CREATED', title: 'Direct' })

    await waitForDeliveries(1)
  })

  it('n’émet rien quand skipWebhook est demandé', async () => {
    const [admin] = await seedSuperAdmins(1)

    await createNotification({
      recipient: admin!,
      type: 'TICKET_CREATED',
      title: 'Silencieux',
      skipWebhook: true,
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await WebhookDelivery.countDocuments()).toBe(0)
  })

  it('n’émet pas une seconde fois quand un dedupeKey met à jour une alerte non lue', async () => {
    const [admin] = await seedSuperAdmins(1)

    await createNotification({
      recipient: admin!,
      type: 'TASK_UPDATED',
      title: 'Tâche en retard',
      dedupeKey: 'crm:task-overdue:task-1',
    })
    await waitForDeliveries(1)

    await createNotification({
      recipient: admin!,
      type: 'TASK_UPDATED',
      title: 'Tâche toujours en retard',
      dedupeKey: 'crm:task-overdue:task-1',
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await WebhookDelivery.countDocuments()).toBe(1)
  })
})
