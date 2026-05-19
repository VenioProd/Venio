import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from '../../../__tests__/helpers/mongoTestEnv.js'
import Task from '../../../models/Task.js'
import { getTaskItems } from './tasks.js'

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })
beforeEach(async () => { await clearDb() })

describe('getTaskItems', () => {
  it('inclut tâches assignées en retard > 2j', async () => {
    const userId = new mongoose.Types.ObjectId()
    const otherUser = new mongoose.Types.ObjectId()
    const projectId = new mongoose.Types.ObjectId()
    const createdBy = new mongoose.Types.ObjectId()
    const past3d = new Date(Date.now() - 3 * 86400 * 1000)
    const yesterday = new Date(Date.now() - 86400 * 1000)
    const future = new Date(Date.now() + 86400 * 1000)

    await Task.create([
      { title: 'Old mine',   status: 'EN_COURS', assignee: userId,      dueDate: past3d,   project: projectId, createdBy }, // include (3d late)
      { title: 'Yesterday',  status: 'EN_COURS', assignee: userId,      dueDate: yesterday, project: projectId, createdBy }, // skip (only 1d, threshold = 2d)
      { title: 'Done',       status: 'TERMINE',  assignee: userId,      dueDate: past3d,   project: projectId, createdBy }, // skip (done)
      { title: 'Future',     status: 'EN_COURS', assignee: userId,      dueDate: future,   project: projectId, createdBy }, // skip (future)
      { title: 'Other user', status: 'EN_COURS', assignee: otherUser,   dueDate: past3d,   project: projectId, createdBy }, // skip (not mine)
    ] as any)

    const items = await getTaskItems(userId.toString())
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('Old mine')
    expect(items[0].tag.label).toBe('TSK')
    expect(items[0].actions.some(a => a.kind === 'mark_done')).toBe(true)
  })
})
