import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

vi.mock('../lib/notificationPreferences.js', () => ({
  shouldNotify: vi.fn(async () => true),
}))

vi.mock('../lib/webPush.js', () => ({
  sendPushToUser: vi.fn(async () => {}),
}))

vi.mock('../realtime/ioSingleton.js', () => ({
  getIo: vi.fn(() => null),
}))

import Notification from '../models/Notification.js'
import { createNotification } from '../lib/notifications.js'
import { sendPushToUser } from '../lib/webPush.js'

describe('createNotification — déduplication des alertes récurrentes', () => {
  beforeAll(setupMongo)
  afterAll(teardownMongo)
  beforeEach(async () => {
    await clearDb()
    vi.clearAllMocks()
  })

  const recipient = () => new mongoose.Types.ObjectId()

  it('conserve une seule notification non lue pour une même clé', async () => {
    const userId = recipient()

    const first = await createNotification({
      recipient: userId,
      type: 'TASK_UPDATED',
      title: 'Tâche en retard',
      message: 'Premier message',
      dedupeKey: 'crm:task-overdue:task-1',
    })
    const second = await createNotification({
      recipient: userId,
      type: 'TASK_UPDATED',
      title: 'Tâche en retard',
      message: 'Message actualisé',
      dedupeKey: 'crm:task-overdue:task-1',
    })

    expect(String(second?._id)).toBe(String(first?._id))
    expect(await Notification.countDocuments({ recipient: userId })).toBe(1)
    expect(second?.message).toBe('Message actualisé')
    await vi.waitFor(() => expect(sendPushToUser).toHaveBeenCalledTimes(1))
  })

  it('crée une nouvelle alerte après lecture de la précédente', async () => {
    const userId = recipient()
    const key = 'crm:task-overdue:task-2'

    const first = await createNotification({
      recipient: userId,
      type: 'TASK_UPDATED',
      title: 'Tâche en retard',
      dedupeKey: key,
    })
    await Notification.updateOne({ _id: first?._id }, { $set: { isRead: true } })

    const second = await createNotification({
      recipient: userId,
      type: 'TASK_UPDATED',
      title: 'Tâche toujours en retard',
      dedupeKey: key,
    })

    expect(String(second?._id)).not.toBe(String(first?._id))
    expect(await Notification.countDocuments({ recipient: userId })).toBe(2)
    expect(await Notification.countDocuments({ recipient: userId, isRead: false })).toBe(1)
    await vi.waitFor(() => expect(sendPushToUser).toHaveBeenCalledTimes(2))
  })

  it('ne fusionne pas deux alertes portant des clés différentes', async () => {
    const userId = recipient()

    await createNotification({
      recipient: userId,
      type: 'PROJECT_UPDATE',
      title: 'Échéance projet proche',
      dedupeKey: 'crm:project-deadline:project-1:2026-08-01',
    })
    await createNotification({
      recipient: userId,
      type: 'PROJECT_UPDATE',
      title: 'Échéance projet proche',
      dedupeKey: 'crm:project-deadline:project-2:2026-08-01',
    })

    expect(await Notification.countDocuments({ recipient: userId, isRead: false })).toBe(2)
  })

  it('préserve le comportement événementiel sans clé de déduplication', async () => {
    const userId = recipient()

    await createNotification({
      recipient: userId,
      type: 'DECISION_SUBMITTED',
      title: 'Nouvelle décision',
    })
    await createNotification({
      recipient: userId,
      type: 'DECISION_SUBMITTED',
      title: 'Nouvelle décision',
    })

    expect(await Notification.countDocuments({ recipient: userId, isRead: false })).toBe(2)
    await vi.waitFor(() => expect(sendPushToUser).toHaveBeenCalledTimes(2))
  })
})
