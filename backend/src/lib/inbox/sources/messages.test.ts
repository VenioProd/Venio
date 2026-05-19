import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../../../__tests__/helpers/mongoTestEnv.js'
import InternalConversation from '../../../models/InternalConversation.js'
import InternalConversationMember from '../../../models/InternalConversationMember.js'
import { getMessageItems } from './messages.js'

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

describe('getMessageItems', () => {
  it('retourne 0 items pour un user sans conversation', async () => {
    const items = await getMessageItems(new mongoose.Types.ObjectId().toString())
    expect(items).toHaveLength(0)
  })

  it('retourne les conversations avec lastMessageAt > lastReadAt', async () => {
    const userId = new mongoose.Types.ObjectId()
    const otherId = new mongoose.Types.ObjectId()
    const createdBy = new mongoose.Types.ObjectId()
    const past = new Date(Date.now() - 86400 * 1000)
    const recent = new Date()

    // c1: DM unread by userId (lastMessageAt recent > lastReadAt past)
    const c1 = await InternalConversation.create({
      type: 'DM',
      name: 'Alice',
      isArchived: false,
      lastMessageAt: recent,
      createdBy,
    } as any)
    // c2: DM already read by userId (lastMessageAt past <= lastReadAt recent)
    const c2 = await InternalConversation.create({
      type: 'DM',
      name: 'Bob',
      isArchived: false,
      lastMessageAt: past,
      createdBy,
    } as any)
    await InternalConversationMember.create({ user: userId, conversation: c1._id, lastReadAt: past } as any)   // unread
    await InternalConversationMember.create({ user: userId, conversation: c2._id, lastReadAt: recent } as any) // already read
    await InternalConversationMember.create({ user: otherId, conversation: c1._id, lastReadAt: past } as any)  // other user, not counted

    const items = await getMessageItems(userId.toString())
    expect(items).toHaveLength(1)
    expect(items[0].title).toContain('Alice')
    expect(items[0].tag.label).toBe('MSG')
    expect(items[0].type).toBe('message')
    expect(items[0].id).toBe(`message:${c1._id}`)
    expect(items[0].actions[0].kind).toBe('read')
    expect(items[0].link).toBe('/admin/messages')
  })

  it('inclut une conversation sans lastReadAt (jamais lue)', async () => {
    const userId = new mongoose.Types.ObjectId()
    const createdBy = new mongoose.Types.ObjectId()
    const recent = new Date()

    const c1 = await InternalConversation.create({
      type: 'CHANNEL',
      name: 'general',
      isArchived: false,
      lastMessageAt: recent,
      createdBy,
      slug: 'general',
      visibility: 'PUBLIC',
    } as any)
    await InternalConversationMember.create({ user: userId, conversation: c1._id, lastReadAt: null } as any)

    const items = await getMessageItems(userId.toString())
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('#general (non lus)')
    expect(items[0].type).toBe('message')
    expect(items[0].urgency).toBe(40)
  })

  it('exclut les conversations archivées', async () => {
    const userId = new mongoose.Types.ObjectId()
    const createdBy = new mongoose.Types.ObjectId()
    const past = new Date(Date.now() - 86400 * 1000)
    const recent = new Date()

    const archived = await InternalConversation.create({
      type: 'DM',
      name: 'Archived',
      isArchived: true,
      lastMessageAt: recent,
      createdBy,
    } as any)
    await InternalConversationMember.create({ user: userId, conversation: archived._id, lastReadAt: past } as any)

    const items = await getMessageItems(userId.toString())
    expect(items).toHaveLength(0)
  })

  it('exclut les conversations sans lastMessageAt', async () => {
    const userId = new mongoose.Types.ObjectId()
    const createdBy = new mongoose.Types.ObjectId()

    const empty = await InternalConversation.create({
      type: 'DM',
      name: 'Empty',
      isArchived: false,
      lastMessageAt: null,
      createdBy,
    } as any)
    await InternalConversationMember.create({ user: userId, conversation: empty._id, lastReadAt: null } as any)

    const items = await getMessageItems(userId.toString())
    expect(items).toHaveLength(0)
  })
})
