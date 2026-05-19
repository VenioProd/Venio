import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../../../__tests__/helpers/mongoTestEnv.js'
import InboxPin from '../../../models/InboxPin.js'
import { getPinnedItems } from './pinned.js'

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

describe('getPinnedItems', () => {
  it('retourne les pins non expirés du user', async () => {
    const userId = new mongoose.Types.ObjectId()
    const otherUser = new mongoose.Types.ObjectId()
    const future = new Date(Date.now() + 86400 * 1000)
    const past = new Date(Date.now() - 86400 * 1000)
    const ref = new mongoose.Types.ObjectId()
    await InboxPin.create([
      { userId, refType: 'project', refId: ref, title: 'Projet Acme', link: '/admin/projets/x' },                     // include (no expires)
      { userId, refType: 'client', refId: ref, title: 'Client', link: '/admin/clients/x', expiresAt: future },        // include (future expires)
      { userId, refType: 'lead', refId: ref, title: 'Lead expiré', link: '/admin/crm/x', expiresAt: past },           // skip (expired)
      { userId: otherUser, refType: 'project', refId: ref, title: 'Other user', link: '/x' },                          // skip (other user)
    ] as any)
    const items = await getPinnedItems(userId.toString())
    expect(items).toHaveLength(2)
    expect(items.every(i => i.type === 'pin')).toBe(true)
    expect(items.every(i => i.tag.label === 'PIN')).toBe(true)
    expect(items.every(i => i.actions.some(a => a.kind === 'unpin'))).toBe(true)
  })

  it('utilise color custom du pin si fourni', async () => {
    const userId = new mongoose.Types.ObjectId()
    await InboxPin.create({
      userId, refType: 'project', refId: new mongoose.Types.ObjectId(),
      title: 'Pink', link: '/x', color: '#ff0080',
    })
    const items = await getPinnedItems(userId.toString())
    expect(items[0].tag.color).toBe('#ff0080')
  })
})
