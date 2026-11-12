import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import devRoutes from '../routes/admin/dev/index.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import DevSuggestion from '../models/DevSuggestion.js'
import Notification from '../models/Notification.js'

let app: Express
let adminCookie: string
let salesCookie: string
let viewerCookie: string
let adminId: string
let salesId: string
let projectId: string

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/dev', devRoutes)
})
afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [admin, sales, viewer] = await User.create([
    { name: 'Admin', email: 'a@example.test', passwordHash, role: 'ADMIN' },
    { name: 'Camille', email: 's@example.test', passwordHash, role: 'COMMERCIAL' },
    { name: 'Viewer', email: 'v@example.test', passwordHash, role: 'COMPTABLE' },
  ])
  adminId = String(admin._id)
  salesId = String(sales._id)
  const [a, s, v] = await Promise.all([admin, sales, viewer].map((u) => createSession(String(u._id))))
  adminCookie = `venio_session=${a.token}`
  salesCookie = `venio_session=${s.token}`
  viewerCookie = `venio_session=${v.token}`
  projectId = String((await DevProject.create({ key: 'ARR', name: 'Arrow', createdBy: admin._id }))._id)
})

const post = (path: string, cookie: string, body: Record<string, unknown> = {}) =>
  request(app).post(`/api/admin/dev${path}`).set('Cookie', cookie).send(body)

describe('admin dev suggestions', () => {
  it('lets a commercial submit and vote but not manage', async () => {
    const created = await post('/suggestions', salesCookie, {
      title: 'Signature',
      problem: 'Impression papier',
      project: projectId,
    })
    expect(created.status).toBe(201)
    expect(created.body.requester.name).toBe('Camille')
    expect(String(created.body.requester.user)).toBe(salesId)
    const id = created.body._id
    const vote = await post(`/suggestions/${id}/vote`, salesCookie)
    expect(vote.body.voteCount).toBe(1)
    expect(vote.body.hasVoted).toBe(true)
    expect((await post(`/suggestions/${id}/convert`, salesCookie)).status).toBe(403)
    expect((await post('/suggestions/bulk', salesCookie, { ids: [id], action: 'archive' })).status).toBe(403)
    expect(
      (
        await request(app)
          .patch(`/api/admin/dev/suggestions/${id}`)
          .set('Cookie', salesCookie)
          .send({ status: 'STUDIED' })
      ).status,
    ).toBe(403)
    expect((await request(app).get('/api/admin/dev/suggestions').set('Cookie', salesCookie)).status).toBe(200)
  })

  it('lets COMPTABLE read through the submit permission', async () => {
    const res = await request(app).get('/api/admin/dev/suggestions').set('Cookie', viewerCookie)
    expect(res.status).toBe(200) // COMPTABLE reçoit SUBMIT_DEV_SUGGESTION
  })

  it('notifies managers on submission', async () => {
    await post('/suggestions', salesCookie, { title: 'T', problem: 'P' })
    await new Promise((r) => setTimeout(r, 100))
    expect(await Notification.countDocuments({ recipient: adminId, type: 'DEV_SUGGESTION_SUBMITTED' })).toBe(1)
  })

  it('accept flow: convert creates an issue and notifies the requester; DONE notifies delivery', async () => {
    const c = await post('/suggestions', salesCookie, {
      title: 'Import',
      problem: 'CSV',
      project: projectId,
      level: 'HIGH',
    })
    const conv = await post(`/suggestions/${c.body._id}/convert`, adminCookie)
    expect(conv.status).toBe(201)
    expect(conv.body.issue.identifier).toBe('ARR-1')
    expect(await Notification.countDocuments({ recipient: salesId, type: 'DEV_SUGGESTION_STATUS_CHANGED' })).toBe(1)
    const done = await request(app)
      .patch(`/api/admin/dev/issues/${conv.body.issue._id}`)
      .set('Cookie', adminCookie)
      .send({ status: 'DONE' })
    expect(done.status).toBe(200)
    expect(await Notification.countDocuments({ recipient: salesId, type: 'DEV_SUGGESTION_STATUS_CHANGED' })).toBe(2)
  })

  it('bulk suggestions: delete, status and per-id failures', async () => {
    const a = await post('/suggestions', adminCookie, { title: 'a', problem: 'p' })
    const b = await post('/suggestions', adminCookie, { title: 'b', problem: 'p' })
    const missing = String(new mongoose.Types.ObjectId())
    const r = await post('/suggestions/bulk', adminCookie, {
      ids: [a.body._id, missing],
      action: 'status',
      status: 'STUDIED',
    })
    expect(r.body.processed).toEqual([a.body._id])
    expect(r.body.failed[0].id).toBe(missing)
    const noReason = await post('/suggestions/bulk', adminCookie, {
      ids: [b.body._id],
      action: 'status',
      status: 'REJECTED',
    })
    expect(noReason.body.failed).toHaveLength(1)
    const del = await post('/suggestions/bulk', adminCookie, { ids: [a.body._id, b.body._id], action: 'delete' })
    expect(del.body.processed).toHaveLength(2)
    expect(await DevSuggestion.countDocuments()).toBe(0)
  })

  it('bulk issues: archive, status, assign, delete', async () => {
    const mk = (n: number) =>
      DevIssue.create({ project: projectId, identifier: `ARR-${n}`, number: n, title: `i${n}`, reporter: adminId })
    const [i1, i2] = [await mk(1), await mk(2)]
    const ids = [String(i1._id), String(i2._id)]
    expect(
      (await post('/issues/bulk', adminCookie, { ids, action: 'status', status: 'IN_REVIEW' })).body.processed,
    ).toHaveLength(2)
    expect(
      (await post('/issues/bulk', adminCookie, { ids, action: 'assign', assignee: salesId })).body.processed,
    ).toHaveLength(2)
    expect((await post('/issues/bulk', adminCookie, { ids: [ids[0]], action: 'archive' })).body.processed).toHaveLength(
      1,
    )
    expect((await DevIssue.findById(i1._id))!.archivedAt).not.toBeNull()
    expect((await post('/issues/bulk', adminCookie, { ids: [ids[1]], action: 'delete' })).body.processed).toHaveLength(
      1,
    )
    expect(await DevIssue.countDocuments()).toBe(1)
    expect((await post('/issues/bulk', adminCookie, { ids: [], action: 'archive' })).status).toBe(400)
  })
})
