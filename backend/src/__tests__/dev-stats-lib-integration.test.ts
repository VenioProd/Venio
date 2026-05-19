import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import User from '../models/User.js'
import { computeStats } from '../lib/dev/stats.js'

let systemUserId: mongoose.Types.ObjectId
let projectId: mongoose.Types.ObjectId

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })

beforeEach(async () => {
  await clearDb()
  const u = await User.create({
    email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x',
  })
  systemUserId = u._id as mongoose.Types.ObjectId
  const p = await DevProject.create({
    key: 'VEN', name: 'Venio', createdBy: systemUserId,
  })
  projectId = p._id as mongoose.Types.ObjectId
})

async function createIssue(over: Partial<{
  status: string; priority: string; labels: string[]; completedAt: Date | null
}> = {}) {
  const num = Math.floor(Math.random() * 1e6)
  return DevIssue.create({
    project: projectId,
    number: num,
    identifier: `VEN-${num}`,
    title: 'T',
    status: over.status ?? 'TODO',
    priority: over.priority ?? 'MEDIUM',
    type: 'TASK',
    labels: over.labels ?? [],
    reporter: systemUserId,
    completedAt: over.completedAt ?? null,
  })
}

describe('computeStats', () => {
  it('returns zeros when there are no issues', async () => {
    const s = await computeStats()
    expect(s.total).toBe(0)
    expect(s.open).toBe(0)
    expect(s.urgent).toBe(0)
    expect(s.blocked).toBe(0)
    expect(s.completed7d).toBe(0)
    expect(s.completed14d).toBe(0)
    expect(s.completedRecent).toBe(0) // alias rétro-compat
    expect(s.velocity14d).toBe(0)
    expect(s.totalProjects).toBe(1)
  })

  it('counts urgent open issues correctly', async () => {
    await createIssue({ priority: 'URGENT', status: 'TODO' })
    await createIssue({ priority: 'URGENT', status: 'DONE' }) // pas comptée
    await createIssue({ priority: 'HIGH', status: 'TODO' })   // pas urgente
    const s = await computeStats()
    expect(s.urgent).toBe(1)
  })

  it('counts blocked issues by label (case-insensitive, blocked or blocker)', async () => {
    await createIssue({ labels: ['Blocked'] })
    await createIssue({ labels: ['BLOCKER'] })
    await createIssue({ labels: ['feature'] }) // pas bloquée
    await createIssue({ labels: ['blocked'], status: 'DONE' }) // closed, pas comptée
    const s = await computeStats()
    expect(s.blocked).toBe(2)
  })

  it('computes completed7d / completed14d windows', async () => {
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    await createIssue({ status: 'DONE', completedAt: new Date(now - 3 * day) })
    await createIssue({ status: 'DONE', completedAt: new Date(now - 10 * day) })
    await createIssue({ status: 'DONE', completedAt: new Date(now - 30 * day) })
    const s = await computeStats()
    expect(s.completed7d).toBe(1)
    expect(s.completed14d).toBe(2)
    expect(s.completedRecent).toBe(2)
    expect(s.velocity14d).toBeCloseTo(2 / 14, 2)
  })

  it('filters by project when match is supplied', async () => {
    const other = await DevProject.create({ key: 'ZEP', name: 'Zephyr', createdBy: systemUserId })
    await createIssue({ status: 'TODO' })
    await DevIssue.create({
      project: other._id, number: 1, identifier: 'ZEP-1', title: 'Z', status: 'TODO',
      priority: 'MEDIUM', type: 'TASK', reporter: systemUserId,
    })
    const sFiltered = await computeStats({ project: projectId })
    expect(sFiltered.total).toBe(1)
    const sAll = await computeStats()
    expect(sAll.total).toBe(2)
  })
})
