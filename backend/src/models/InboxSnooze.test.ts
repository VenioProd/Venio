import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../__tests__/helpers/mongoTestEnv.js'
import InboxSnooze from './InboxSnooze.js'

beforeAll(async () => {
  await setupMongo()
  await InboxSnooze.init()  // ensure unique index is built before tests
})
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

describe('InboxSnooze', () => {
  it('crée un snooze', async () => {
    const s = await InboxSnooze.create({
      userId: new mongoose.Types.ObjectId(),
      itemType: 'decision',
      sourceId: new mongoose.Types.ObjectId(),
      snoozedUntil: new Date(Date.now() + 3600 * 1000),
    })
    expect(s._id).toBeDefined()
    expect(s.itemType).toBe('decision')
    expect(s.createdAt).toBeInstanceOf(Date)
  })

  it('rejette un doublon (userId+itemType+sourceId) via index unique', async () => {
    const userId = new mongoose.Types.ObjectId()
    const sourceId = new mongoose.Types.ObjectId()
    await InboxSnooze.create({ userId, itemType: 'decision', sourceId, snoozedUntil: new Date(Date.now() + 1000) })
    await expect(
      InboxSnooze.create({ userId, itemType: 'decision', sourceId, snoozedUntil: new Date(Date.now() + 2000) })
    ).rejects.toThrow()
  })

  it('autorise des snoozes pour différents itemType ou différents users', async () => {
    const userA = new mongoose.Types.ObjectId()
    const userB = new mongoose.Types.ObjectId()
    const sourceId = new mongoose.Types.ObjectId()
    await InboxSnooze.create({ userId: userA, itemType: 'decision', sourceId, snoozedUntil: new Date(Date.now() + 1000) })
    await InboxSnooze.create({ userId: userA, itemType: 'brief', sourceId, snoozedUntil: new Date(Date.now() + 1000) })
    await InboxSnooze.create({ userId: userB, itemType: 'decision', sourceId, snoozedUntil: new Date(Date.now() + 1000) })
    expect(await InboxSnooze.countDocuments()).toBe(3)
  })
})
