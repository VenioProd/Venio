import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../../__tests__/helpers/mongoTestEnv.js'
import Decision from '../../models/Decision.js'
import InboxSnooze from '../../models/InboxSnooze.js'
import InboxPin from '../../models/InboxPin.js'
import { buildInbox } from './aggregator.js'

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

describe('buildInbox', () => {
  it('retourne un objet avec items/counts/snoozedCount', async () => {
    const userId = new mongoose.Types.ObjectId().toString()
    const result = await buildInbox(userId)
    expect(result).toHaveProperty('items')
    expect(result).toHaveProperty('counts')
    expect(result).toHaveProperty('snoozedCount')
    expect(Array.isArray(result.items)).toBe(true)
  })

  it('combine plusieurs sources et masque les snoozées par défaut', async () => {
    const userId = new mongoose.Types.ObjectId()
    const submitter = new mongoose.Types.ObjectId()
    const d1 = await Decision.create({ title: 'A', status: 'PENDING', priority: 'URGENTE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'Sarah', description: 'x' })
    const d2 = await Decision.create({ title: 'B', status: 'PENDING', priority: 'NORMALE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'Sarah', description: 'x' })
    // snooze d1 for 1h
    await InboxSnooze.create({ userId, itemType: 'decision', sourceId: d1._id, snoozedUntil: new Date(Date.now() + 3600 * 1000) })

    const inbox = await buildInbox(String(userId), { includeSnoozed: false })
    // d1 (URGENTE) is snoozed → hidden. Only d2 visible.
    expect(inbox.items.find((i) => i.title === 'A')).toBeUndefined()
    expect(inbox.items.find((i) => i.title === 'B')).toBeDefined()
    expect(inbox.snoozedCount).toBe(1)
  })

  it('inclut les snoozées avec includeSnoozed=true et marque snoozedUntil', async () => {
    const userId = new mongoose.Types.ObjectId()
    const submitter = new mongoose.Types.ObjectId()
    const d1 = await Decision.create({ title: 'A', status: 'PENDING', priority: 'URGENTE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'Sarah', description: 'x' })
    await InboxSnooze.create({ userId, itemType: 'decision', sourceId: d1._id, snoozedUntil: new Date(Date.now() + 3600 * 1000) })

    const inbox = await buildInbox(String(userId), { includeSnoozed: true })
    const found = inbox.items.find((i) => i.title === 'A')
    expect(found).toBeDefined()
    expect(found?.snoozedUntil).toBeTruthy()
  })

  it('tri par urgency desc', async () => {
    const userId = new mongoose.Types.ObjectId().toString()
    const submitter = new mongoose.Types.ObjectId()
    await Decision.create([
      { title: 'Basse', status: 'PENDING', priority: 'BASSE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'X', description: 'x' },
      { title: 'Urgente', status: 'PENDING', priority: 'URGENTE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'X', description: 'x' },
      { title: 'Normale', status: 'PENDING', priority: 'NORMALE', category: 'BUDGET', submittedBy: submitter, submittedByName: 'X', description: 'x' },
    ])
    const inbox = await buildInbox(userId)
    expect(inbox.items[0].title).toBe('Urgente')
  })

  it('inclut les items pin du user', async () => {
    const userId = new mongoose.Types.ObjectId()
    await InboxPin.create({
      userId,
      refType: 'project',
      refId: new mongoose.Types.ObjectId(),
      title: 'Mon projet épinglé',
      link: '/admin/projets/x',
    })
    const inbox = await buildInbox(String(userId))
    expect(inbox.items.find((i) => i.title === 'Mon projet épinglé')).toBeDefined()
    expect(inbox.counts.pin).toBe(1)
  })
})
