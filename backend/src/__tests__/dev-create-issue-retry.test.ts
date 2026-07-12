import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import { createIssueWithRetry } from '../lib/dev/createIssue.js'

let systemUserId: mongoose.Types.ObjectId
let projectId: mongoose.Types.ObjectId
const projectKey = 'VEN'

beforeAll(async () => {
  await setupMongo()
})
afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const u = await User.create({
    email: 'sys@test.local',
    name: 'Sys',
    role: 'SUPER_ADMIN',
    passwordHash: 'x',
  })
  systemUserId = u._id as mongoose.Types.ObjectId
  const p = await DevProject.create({ key: projectKey, name: 'Venio', createdBy: systemUserId })
  projectId = p._id as mongoose.Types.ObjectId
})

describe('createIssueWithRetry', () => {
  it('assigns sequential numbers when called serially', async () => {
    const a = await createIssueWithRetry({
      project: projectId,
      projectKey,
      title: 'A',
      type: 'TASK',
      status: 'BACKLOG',
      priority: 'NO_PRIORITY',
      reporter: systemUserId,
    })
    const b = await createIssueWithRetry({
      project: projectId,
      projectKey,
      title: 'B',
      type: 'TASK',
      status: 'BACKLOG',
      priority: 'NO_PRIORITY',
      reporter: systemUserId,
    })
    expect(a.number).toBe(1)
    expect(b.number).toBe(2)
    expect(a.identifier).toBe('VEN-1')
    expect(b.identifier).toBe('VEN-2')
  })

  it('survives concurrent creates without collisions or missing numbers', async () => {
    const N = 10
    const creates = Array.from({ length: N }, (_, i) =>
      createIssueWithRetry({
        project: projectId,
        projectKey,
        title: `Concurrent ${i}`,
        type: 'TASK',
        status: 'BACKLOG',
        priority: 'NO_PRIORITY',
        reporter: systemUserId,
      })
    )
    const results = await Promise.all(creates)
    const numbers = results.map((r) => r.number).sort((a, b) => a - b)
    expect(numbers).toEqual(Array.from({ length: N }, (_, i) => i + 1))

    const stored = await DevIssue.find({ project: projectId }).select('number identifier').lean()
    expect(stored).toHaveLength(N)
    const uniqueIds = new Set(stored.map((s) => s.identifier))
    expect(uniqueIds.size).toBe(N)
  })

  it('sets startedAt for IN_PROGRESS and completedAt for DONE', async () => {
    const wip = await createIssueWithRetry({
      project: projectId,
      projectKey,
      title: 'wip',
      type: 'TASK',
      status: 'IN_PROGRESS',
      priority: 'NO_PRIORITY',
      reporter: systemUserId,
    })
    expect(wip.startedAt).toBeTruthy()
    expect(wip.completedAt).toBeNull()
    const done = await createIssueWithRetry({
      project: projectId,
      projectKey,
      title: 'done',
      type: 'TASK',
      status: 'DONE',
      priority: 'NO_PRIORITY',
      reporter: systemUserId,
    })
    expect(done.completedAt).toBeTruthy()
  })
})
