import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import DevIssueComment from '../models/DevIssueComment.js'
import User from '../models/User.js'
import { computeProjectCockpit } from '../lib/dev/stats.js'

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
    key: 'VEN', name: 'Venio', description: 'Test project', createdBy: systemUserId,
  })
  projectId = p._id as mongoose.Types.ObjectId
})

let counter = 0
async function createIssue(over: Partial<{
  status: string; priority: string; type: string; labels: string[];
  completedAt: Date | null; startedAt: Date | null; createdAt: Date;
  dueDate: Date | null; assignee: mongoose.Types.ObjectId | null
}> = {}) {
  counter += 1
  const doc = await DevIssue.create({
    project: projectId,
    number: counter,
    identifier: `VEN-${counter}`,
    title: `Issue ${counter}`,
    status: over.status ?? 'TODO',
    priority: over.priority ?? 'MEDIUM',
    type: over.type ?? 'TASK',
    labels: over.labels ?? [],
    reporter: systemUserId,
    assignee: over.assignee ?? null,
    completedAt: over.completedAt ?? null,
    startedAt: over.startedAt ?? null,
    dueDate: over.dueDate ?? null,
  })
  if (over.createdAt) {
    await DevIssue.updateOne(
      { _id: doc._id },
      { $set: { createdAt: over.createdAt } },
      { timestamps: false }
    )
  }
  return doc
}

describe('computeProjectCockpit', () => {
  it('returns null for an unknown project', async () => {
    const res = await computeProjectCockpit(new mongoose.Types.ObjectId())
    expect(res).toBeNull()
  })

  it('returns a fully shaped payload for an empty project', async () => {
    const c = await computeProjectCockpit(projectId)
    expect(c).not.toBeNull()
    if (!c) return
    expect(c.project.key).toBe('VEN')
    expect(c.project.description).toBe('Test project')
    expect(c.counts).toMatchObject({ total: 0, open: 0, done: 0, urgent: 0, blocked: 0, overdue: 0 })
    expect(c.progress).toBe(0)
    expect(c.health).toBe('on_track')
    expect(c.velocity.days).toHaveLength(14)
    expect(c.velocity.completed14d).toBe(0)
    expect(c.blockers).toEqual([])
    expect(c.assignees).toEqual([])
  })

  it('computes counts, progress, health and breakdowns', async () => {
    const assignee = await User.create({
      email: 'a@t.local', name: 'A', role: 'ADMIN', passwordHash: 'x',
    })
    await createIssue({ status: 'IN_PROGRESS', priority: 'URGENT', type: 'BUG', assignee: assignee._id as mongoose.Types.ObjectId })
    await createIssue({ status: 'TODO', priority: 'HIGH', type: 'FEATURE', labels: ['blocked'] })
    await createIssue({ status: 'DONE', priority: 'LOW', type: 'TASK', completedAt: new Date() })
    await createIssue({ status: 'CANCELLED', priority: 'NO_PRIORITY', type: 'CHORE' })

    const c = (await computeProjectCockpit(projectId))!
    expect(c.counts.total).toBe(4)
    expect(c.counts.done).toBe(1)
    expect(c.counts.cancelled).toBe(1)
    expect(c.counts.urgent).toBe(1)
    expect(c.counts.blocked).toBe(1)
    expect(c.counts.open).toBe(2)
    expect(c.health).toBe('blocked')
    expect(c.byStatus.IN_PROGRESS).toBe(1)
    expect(c.byStatus.DONE).toBe(1)
    expect(c.byPriority.URGENT).toBe(1)
    expect(c.byType.BUG).toBe(1)
    expect(c.byType.FEATURE).toBe(1)
    expect(c.blockers).toHaveLength(1)
    expect(c.urgent).toHaveLength(1)
  })

  it('counts overdue issues only when not closed and dueDate in the past', async () => {
    const pastDue = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    const futureDue = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    await createIssue({ status: 'TODO', dueDate: pastDue })
    await createIssue({ status: 'DONE', dueDate: pastDue, completedAt: new Date() }) // closed → ignored
    await createIssue({ status: 'TODO', dueDate: futureDue }) // future → nextDue

    const c = (await computeProjectCockpit(projectId))!
    expect(c.counts.overdue).toBe(1)
    expect(c.overdue).toHaveLength(1)
    expect(c.nextDue).toHaveLength(1)
  })

  it('builds a 14-day velocity series with completed and created counts', async () => {
    const day = 24 * 60 * 60 * 1000
    await createIssue({ status: 'DONE', completedAt: new Date(Date.now() - 2 * day) })
    await createIssue({ status: 'DONE', completedAt: new Date(Date.now() - 6 * day) })
    await createIssue({ status: 'DONE', completedAt: new Date(Date.now() - 12 * day) })
    await createIssue({ status: 'TODO', createdAt: new Date(Date.now() - 1 * day) })

    const c = (await computeProjectCockpit(projectId))!
    expect(c.velocity.completed14d).toBe(3)
    expect(c.velocity.completed7d).toBe(2)
    expect(c.velocity.created14d).toBeGreaterThanOrEqual(4) // all 4 issues created today/yesterday
  })

  it('returns recent activity including comments', async () => {
    const issue = await createIssue({ status: 'IN_PROGRESS' })
    await DevIssueComment.create({
      issue: issue._id,
      project: projectId,
      author: systemUserId,
      body: 'hello',
    })
    const c = (await computeProjectCockpit(projectId))!
    expect(c.activity.length).toBeGreaterThan(0)
    expect(c.activity.some((a) => a.type === 'comment')).toBe(true)
  })

  it('groups assignees by workload', async () => {
    const u1 = await User.create({ email: 'u1@t.l', name: 'U1', role: 'ADMIN', passwordHash: 'x' })
    const u2 = await User.create({ email: 'u2@t.l', name: 'U2', role: 'ADMIN', passwordHash: 'x' })
    await createIssue({ status: 'TODO', assignee: u1._id as mongoose.Types.ObjectId })
    await createIssue({ status: 'IN_PROGRESS', priority: 'URGENT', assignee: u1._id as mongoose.Types.ObjectId })
    await createIssue({ status: 'DONE', assignee: u2._id as mongoose.Types.ObjectId, completedAt: new Date() })
    await createIssue({ status: 'TODO' }) // unassigned

    const c = (await computeProjectCockpit(projectId))!
    const u1Row = c.assignees.find((a) => a.user?.email === 'u1@t.l')
    expect(u1Row).toBeDefined()
    expect(u1Row!.open).toBe(2)
    expect(u1Row!.urgent).toBe(1)
    const unassigned = c.assignees.find((a) => a.user === null)
    expect(unassigned).toBeDefined()
    expect(unassigned!.open).toBe(1)
  })
})
