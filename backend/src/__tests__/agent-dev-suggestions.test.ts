import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import DevSuggestion from '../models/DevSuggestion.js'
import Notification from '../models/Notification.js'

let app: Express
let sysId: mongoose.Types.ObjectId
let requesterId: mongoose.Types.ObjectId
let projectId: mongoose.Types.ObjectId
const URL = '/api/v1/agent/dev/suggestions'

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
})
afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  sysId = (await User.create({ email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x' }))._id
  requesterId = (await User.create({ email: 'c@test.local', name: 'Camille', role: 'COMMERCIAL', passwordHash: 'x' }))
    ._id
  projectId = (await DevProject.create({ key: 'ARR', name: 'Arrow', createdBy: sysId }))._id
})

async function create(token: string, body: Record<string, unknown> = {}) {
  return request(app)
    .post(URL)
    .set(authHeaders(token, { idempotencyKey: uniqueIdempotencyKey() }))
    .send({ title: 'Import CSV', problem: 'Saisie manuelle de 400 élèves', project: String(projectId), ...body })
}

describe('agent dev suggestions', () => {
  it('lets a read+write token create then read, and a read-only token only read', async () => {
    const rw = await createAgentTokenInDb(['read:dev', 'write:dev'])
    const ro = await createAgentTokenInDb(['read:dev'])
    const res = await create(rw.plainSecret, { amountEur: 24000, level: 'HIGH', requesterName: 'Camille R.' })
    expect(res.status).toBe(201)
    expect(res.body.status).toBe('NEW')
    expect(res.body.requester.name).toBe('Camille R.')
    expect(res.body.impact).toEqual({ amountEur: 24000, level: 'HIGH' })
    expect(res.body.source.kind).toBe('agent')

    const list = await request(app).get(URL).set(authHeaders(ro.plainSecret))
    expect(list.status).toBe(200)
    expect(list.body.data ?? list.body.items).toHaveLength(1)
    const one = await request(app).get(`${URL}/${res.body._id}`).set(authHeaders(ro.plainSecret))
    expect(one.status).toBe(200)

    const denied = await create(ro.plainSecret)
    expect(denied.status).toBe(403)
  })

  it('rejects missing title/problem and unknown links', async () => {
    const t = await createAgentTokenInDb(['write:dev'])
    expect((await create(t.plainSecret, { title: '' })).status).toBe(400)
    expect((await create(t.plainSecret, { problem: '' })).status).toBe(400)
    const bad = await create(t.plainSecret, { link: { kind: 'lead', ref: String(new mongoose.Types.ObjectId()) } })
    expect(bad.status).toBe(400)
  })

  it('sorts by impact by default', async () => {
    const t = await createAgentTokenInDb(['read:dev', 'write:dev'])
    await create(t.plainSecret, { title: 'petit', amountEur: 1000 })
    await create(t.plainSecret, { title: 'gros', amountEur: 50000 })
    const list = await request(app).get(URL).set(authHeaders(t.plainSecret))
    const items = list.body.data ?? list.body.items
    expect(items.map((s: { title: string }) => s.title)).toEqual(['gros', 'petit'])
  })

  it('requires a reason to reject and notifies the requester', async () => {
    const t = await createAgentTokenInDb(['read:dev', 'write:dev'])
    const s = await create(t.plainSecret, { requesterUser: String(requesterId) })
    const noReason = await request(app)
      .patch(`${URL}/${s.body._id}`)
      .set(authHeaders(t.plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ status: 'REJECTED' })
    expect(noReason.status).toBe(400)
    const ok = await request(app)
      .patch(`${URL}/${s.body._id}`)
      .set(authHeaders(t.plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ status: 'REJECTED', reason: 'Hors périmètre' })
    expect(ok.status).toBe(200)
    expect(ok.body.status).toBe('REJECTED')
    expect(ok.body.rejectionReason).toBe('Hors périmètre')
    expect(await Notification.countDocuments({ recipient: requesterId, type: 'DEV_SUGGESTION_STATUS_CHANGED' })).toBe(1)
  })

  it('refuses ACCEPTED through patch (must go through convert)', async () => {
    const t = await createAgentTokenInDb(['read:dev', 'write:dev'])
    const s = await create(t.plainSecret)
    const res = await request(app)
      .patch(`${URL}/${s.body._id}`)
      .set(authHeaders(t.plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ status: 'ACCEPTED' })
    expect(res.status).toBe(400)
  })

  it('converts into a FEATURE issue, idempotently', async () => {
    const t = await createAgentTokenInDb(['read:dev', 'write:dev'])
    const s = await create(t.plainSecret, { level: 'CRITICAL', requesterUser: String(requesterId) })
    const first = await request(app)
      .post(`${URL}/${s.body._id}/convert`)
      .set(authHeaders(t.plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({})
    expect(first.status).toBe(201)
    expect(first.body.issue.type).toBe('FEATURE')
    expect(first.body.issue.priority).toBe('URGENT')
    expect(first.body.suggestion.status).toBe('ACCEPTED')
    const again = await request(app)
      .post(`${URL}/${s.body._id}/convert`)
      .set(authHeaders(t.plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({})
    expect(again.status).toBe(200)
    expect(await DevIssue.countDocuments()).toBe(1)
  })

  it('needs a project to convert', async () => {
    const t = await createAgentTokenInDb(['read:dev', 'write:dev'])
    const s = await create(t.plainSecret, { project: null })
    const res = await request(app)
      .post(`${URL}/${s.body._id}/convert`)
      .set(authHeaders(t.plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({})
    expect(res.status).toBe(400)
  })

  it('votes on behalf of a user, toggling', async () => {
    const t = await createAgentTokenInDb(['read:dev', 'write:dev'])
    const s = await create(t.plainSecret)
    const vote = () =>
      request(app)
        .post(`${URL}/${s.body._id}/vote`)
        .set(authHeaders(t.plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
        .send({ userId: String(requesterId) })
    expect((await vote()).body.voteCount).toBe(1)
    expect((await vote()).body.voteCount).toBe(0)
  })

  it('bulk: archive/status/convert, no delete for agents', async () => {
    const t = await createAgentTokenInDb(['read:dev', 'write:dev'])
    const a = await create(t.plainSecret, { title: 'a' })
    const b = await create(t.plainSecret, { title: 'b' })
    const bulk = (body: Record<string, unknown>) =>
      request(app)
        .post(`${URL}/bulk`)
        .set(authHeaders(t.plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
        .send(body)
    expect((await bulk({ ids: [a.body._id], action: 'delete' })).status).toBe(400)
    const conv = await bulk({ ids: [a.body._id, b.body._id], action: 'convert' })
    expect(conv.body.processed).toHaveLength(2)
    expect(await DevIssue.countDocuments()).toBe(2)
    const arch = await bulk({ ids: [a.body._id], action: 'archive' })
    expect(arch.body.processed).toEqual([a.body._id])
    expect((await DevSuggestion.findById(a.body._id))!.archivedAt).not.toBeNull()
    const hidden = await request(app).get(URL).set(authHeaders(t.plainSecret))
    expect(hidden.body.data ?? hidden.body.items).toHaveLength(1)
  })

  it('bulk issues: status and assign; invalid ids rejected', async () => {
    const t = await createAgentTokenInDb(['read:dev', 'write:dev'])
    const i1 = await DevIssue.create({
      project: projectId,
      identifier: 'ARR-1',
      number: 1,
      title: 'x',
      reporter: sysId,
    })
    const bulk = (body: Record<string, unknown>) =>
      request(app)
        .post('/api/v1/agent/dev/issues/bulk')
        .set(authHeaders(t.plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
        .send(body)
    expect((await bulk({ ids: ['nope'], action: 'archive' })).status).toBe(400)
    expect((await bulk({ ids: [String(i1._id)], action: 'delete' })).status).toBe(400)
    const r = await bulk({ ids: [String(i1._id)], action: 'status', status: 'IN_REVIEW' })
    expect(r.body.processed).toHaveLength(1)
    expect((await DevIssue.findById(i1._id))!.status).toBe('IN_REVIEW')
    await bulk({ ids: [String(i1._id)], action: 'assign', assignee: String(requesterId) })
    expect(String((await DevIssue.findById(i1._id))!.assignee)).toBe(String(requesterId))
  })
})
