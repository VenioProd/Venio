import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import User from '../models/User.js'
import { computeStats, computeOverview } from '../lib/dev/stats.js'

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

describe('computeOverview', () => {
  it('includes projects with no issues, progress=0, health=on_track', async () => {
    const o = await computeOverview()
    expect(o.projects).toHaveLength(1)
    expect(o.projects[0].key).toBe('VEN')
    expect(o.projects[0].progress).toBe(0)
    expect(o.projects[0].health).toBe('on_track')
    expect(o.projects[0].counts.total).toBe(0)
    expect(o.kpis.totalProjects).toBe(1)
    expect(o.kpis.activeProjects).toBe(1)
    expect(o.kpis.totalOpen).toBe(0)
  })

  it('computes progress, counts and health for a project with mixed issues', async () => {
    await createIssue({ status: 'BACKLOG' })
    await createIssue({ status: 'IN_PROGRESS' })
    await createIssue({ status: 'DONE' })
    await createIssue({ status: 'CANCELLED' })
    await createIssue({ priority: 'URGENT', status: 'TODO', labels: ['blocked'] })

    const o = await computeOverview()
    const p = o.projects.find((x) => x.key === 'VEN')!
    expect(p.counts.total).toBe(5)
    expect(p.counts.done).toBe(1)
    expect(p.counts.cancelled).toBe(1)
    expect(p.counts.urgent).toBe(1)
    expect(p.counts.blocked).toBe(1)
    expect(p.counts.open).toBe(3) // total - DONE - CANCELLED
    // Statuts non-CANCELLED : BACKLOG(0) + IN_PROGRESS(50) + DONE(100) + TODO(10) = 160 / 400 = 40
    expect(p.progress).toBe(40)
    // blocked > 0 → 'blocked'
    expect(p.health).toBe('blocked')
  })

  it("sorts ACTIVE projects first, then by lastActivityAt desc", async () => {
    const archived = await DevProject.create({
      key: 'ARC', name: 'Archived', status: 'ARCHIVED', createdBy: systemUserId,
    })
    const newer = await DevProject.create({
      key: 'NEW', name: 'Newer', createdBy: systemUserId,
    })
    // Force ordering: bump VEN's updatedAt
    await DevProject.updateOne({ _id: projectId }, { $set: { updatedAt: new Date(Date.now() - 1000) } }, { timestamps: false })
    const o = await computeOverview()
    const keys = o.projects.map((p) => p.key)
    // ACTIVE first (NEW, VEN), then ARCHIVED
    expect(keys[keys.length - 1]).toBe('ARC')
    expect(keys.indexOf('NEW')).toBeLessThan(keys.indexOf('VEN'))
  })

  it('populates lead with name and email when present', async () => {
    const lead = await User.create({
      email: 'lead@test.local', name: 'Lead', role: 'ADMIN', passwordHash: 'x',
    })
    await DevProject.updateOne({ _id: projectId }, { $set: { lead: lead._id } })
    const o = await computeOverview()
    const p = o.projects.find((x) => x.key === 'VEN')!
    expect(p.lead).toMatchObject({ name: 'Lead', email: 'lead@test.local' })
  })
})
