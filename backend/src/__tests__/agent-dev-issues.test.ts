import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createTestApp, createAgentTokenInDb, authHeaders, uniqueIdempotencyKey } from './helpers/agentTestApp.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import DevIssueComment from '../models/DevIssueComment.js'
import DevIssueEvent from '../models/DevIssueEvent.js'

let app: Express
let systemUserId: mongoose.Types.ObjectId
let projectId: mongoose.Types.ObjectId

beforeAll(async () => {
  await setupMongo()
  app = await createTestApp()
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
  const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
  projectId = p._id as mongoose.Types.ObjectId
})

describe('GET /api/v1/agent/dev/issues — filters', () => {
  it('supports q (regex on title/identifier) and label', async () => {
    await DevIssue.create({
      project: projectId,
      identifier: 'VEN-1',
      number: 1,
      title: 'Authentification SSO',
      reporter: systemUserId,
      labels: ['security', 'auth'],
    })
    await DevIssue.create({
      project: projectId,
      identifier: 'VEN-2',
      number: 2,
      title: 'Page realisations',
      reporter: systemUserId,
      labels: ['frontend'],
    })

    const { plainSecret } = await createAgentTokenInDb(['read:dev'])

    const qRes = await request(app).get('/api/v1/agent/dev/issues?q=auth').set(authHeaders(plainSecret)).expect(200)
    expect(qRes.body.items).toHaveLength(1)
    expect(qRes.body.items[0].identifier).toBe('VEN-1')

    const labelRes = await request(app)
      .get('/api/v1/agent/dev/issues?label=frontend')
      .set(authHeaders(plainSecret))
      .expect(200)
    expect(labelRes.body.items).toHaveLength(1)
    expect(labelRes.body.items[0].identifier).toBe('VEN-2')
  })

  it('assignee=unassigned filters issues without an assignee', async () => {
    await DevIssue.create({
      project: projectId,
      identifier: 'VEN-1',
      number: 1,
      title: 'A',
      reporter: systemUserId,
      assignee: systemUserId,
    })
    await DevIssue.create({
      project: projectId,
      identifier: 'VEN-2',
      number: 2,
      title: 'B',
      reporter: systemUserId,
      assignee: null,
    })
    const { plainSecret } = await createAgentTokenInDb(['read:dev'])
    const res = await request(app)
      .get('/api/v1/agent/dev/issues?assignee=unassigned')
      .set(authHeaders(plainSecret))
      .expect(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].identifier).toBe('VEN-2')
  })

  it('assignee=me returns 400 UNSUPPORTED_FILTER for agent tokens', async () => {
    const { plainSecret } = await createAgentTokenInDb(['read:dev'])
    const res = await request(app).get('/api/v1/agent/dev/issues?assignee=me').set(authHeaders(plainSecret)).expect(400)
    expect(res.body.code).toBe('UNSUPPORTED_FILTER')
  })
})

describe('PATCH /api/v1/agent/dev/issues/:id — labels + dueDate', () => {
  it('accepts labels (normalized) and dueDate', async () => {
    const issue = await DevIssue.create({
      project: projectId,
      identifier: 'VEN-1',
      number: 1,
      title: 'A',
      reporter: systemUserId,
    })
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const res = await request(app)
      .patch(`/api/v1/agent/dev/issues/${issue._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ labels: [' Frontend ', 'FRONTEND', 'urgent'], dueDate: '2026-12-31' })
      .expect(200)
    expect(res.body.labels).toEqual(['frontend', 'urgent'])
    expect(new Date(res.body.dueDate).toISOString().startsWith('2026-12-31')).toBe(true)
  })

  it('accepts dueDate=null to clear', async () => {
    const issue = await DevIssue.create({
      project: projectId,
      identifier: 'VEN-1',
      number: 1,
      title: 'A',
      reporter: systemUserId,
      dueDate: new Date('2026-01-01'),
    })
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const res = await request(app)
      .patch(`/api/v1/agent/dev/issues/${issue._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ dueDate: null })
      .expect(200)
    expect(res.body.dueDate).toBeNull()
  })

  it('accepts issue v2 metadata and records timeline events', async () => {
    const issue = await DevIssue.create({
      project: projectId,
      identifier: 'VEN-1',
      number: 1,
      title: 'A',
      reporter: systemUserId,
    })
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const res = await request(app)
      .patch(`/api/v1/agent/dev/issues/${issue._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        status: 'BLOCKED',
        type: 'SECURITY',
        estimate: 3,
        cycle: 'linear-level',
        agentAssignee: 'Kuro',
        blockedReason: 'Needs rollout window',
        external: {
          linearId: 'lin_123',
          linearIdentifier: 'VEN-999',
          linearUrl: 'https://linear.app/example/issue/VEN-999',
        },
        executionProfile: {
          recommendedModel: 'GPT_5_6_SOL',
          reasoningEffort: 'HIGH',
          context: 'Audit sécurité après un incident CI.',
          executionPlan: 'Reproduire, corriger, tester.',
          verificationPlan: 'Tests ciblés et CI verte.',
          handoff: 'Commentaire avec commit et risque résiduel.',
        },
      })
      .expect(200)
    expect(res.body.status).toBe('BLOCKED')
    expect(res.body.type).toBe('SECURITY')
    expect(res.body.estimate).toBe(3)
    expect(res.body.external.linearIdentifier).toBe('VEN-999')
    expect(res.body.executionProfile).toMatchObject({
      recommendedModel: 'GPT_5_6_SOL',
      reasoningEffort: 'HIGH',
      context: 'Audit sécurité après un incident CI.',
    })

    const events = await DevIssueEvent.find({ issue: issue._id }).sort({ createdAt: 1 }).lean()
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['status_changed', 'type_changed', 'metadata_changed']),
    )
  })
})

describe('issue links — project integrity and cycle prevention', () => {
  it('accepts a parent from the same project and rejects a cross-project link', async () => {
    const parent = await DevIssue.create({
      project: projectId,
      identifier: 'VEN-1',
      number: 1,
      title: 'Parent',
      reporter: systemUserId,
    })
    const foreignProject = await DevProject.create({ key: 'OTH', name: 'Other', createdBy: systemUserId })
    const foreignIssue = await DevIssue.create({
      project: foreignProject._id,
      identifier: 'OTH-1',
      number: 1,
      title: 'Foreign',
      reporter: systemUserId,
    })
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])

    const created = await request(app)
      .post('/api/v1/agent/dev/issues')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ project: String(projectId), title: 'Child', parent: String(parent._id) })
      .expect(201)
    expect(created.body.parent).toBe(String(parent._id))

    const rejected = await request(app)
      .patch(`/api/v1/agent/dev/issues/${created.body._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ blockedBy: [String(foreignIssue._id)] })
      .expect(400)
    expect(rejected.body.code).toBe('INVALID_RELATION')
  })

  it('rejects self references and parent cycles', async () => {
    const first = await DevIssue.create({
      project: projectId,
      identifier: 'VEN-1',
      number: 1,
      title: 'First',
      reporter: systemUserId,
    })
    const second = await DevIssue.create({
      project: projectId,
      identifier: 'VEN-2',
      number: 2,
      title: 'Second',
      reporter: systemUserId,
      parent: first._id,
    })
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])

    await request(app)
      .patch(`/api/v1/agent/dev/issues/${first._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ blockedBy: [String(first._id)] })
      .expect(400)

    const cycle = await request(app)
      .patch(`/api/v1/agent/dev/issues/${first._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ parent: String(second._id) })
      .expect(400)
    expect(cycle.body.error).toContain('cycle')
  })
})

describe('POST /api/v1/agent/dev/issues/:id/comments — enriched context', () => {
  it('persists a typed comment and compact execution context', async () => {
    const issue = await DevIssue.create({
      project: projectId,
      identifier: 'VEN-1',
      number: 1,
      title: 'A',
      reporter: systemUserId,
    })
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const res = await request(app)
      .post(`/api/v1/agent/dev/issues/${issue._id}/comments`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        kind: 'EVIDENCE',
        context: 'GPT-5.6 Terra · raisonnement élevé',
        body: 'Typecheck et tests ciblés verts.',
      })
      .expect(201)

    expect(res.body.kind).toBe('EVIDENCE')
    expect(res.body.context).toBe('GPT-5.6 Terra · raisonnement élevé')
    const stored = await DevIssueComment.findById(res.body._id).lean()
    expect(stored?.body).toBe('Typecheck et tests ciblés verts.')
  })
})

describe('POST /api/v1/agent/dev/issues — labels + dueDate', () => {
  it('persists labels, dueDate and the exact creator model on create', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const res = await request(app)
      .post('/api/v1/agent/dev/issues')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .set('X-Agent-Model', 'openai/gpt-5.5-codex')
      .send({
        project: String(projectId),
        title: 'New issue with metadata',
        labels: ['backend', 'p1'],
        dueDate: '2026-09-01',
      })
      .expect(201)
    expect(res.body.labels).toEqual(['backend', 'p1'])
    expect(new Date(res.body.dueDate).toISOString().startsWith('2026-09-01')).toBe(true)
    expect(res.body.identifier).toMatch(/^VEN-\d+$/)
    expect(res.body.createdByModel).toBe('openai/gpt-5.5-codex')

    const stored = await DevIssue.findById(res.body._id).lean()
    expect(stored?.createdByModel).toBe('openai/gpt-5.5-codex')
  })

  it('persists issue v2 metadata on create and records a created event', async () => {
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const res = await request(app)
      .post('/api/v1/agent/dev/issues')
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({
        project: String(projectId),
        title: 'Linear import candidate',
        type: 'DOC',
        status: 'TODO',
        rank: '0001',
        agentAssignee: 'Hashirama',
        external: { linearId: 'lin_456', linearIdentifier: 'LIN-456' },
      })
      .expect(201)
    expect(res.body.type).toBe('DOC')
    expect(res.body.rank).toBe('0001')
    expect(res.body.agentAssignee).toBe('Hashirama')
    expect(res.body.external.linearId).toBe('lin_456')

    const events = await DevIssueEvent.find({ issue: res.body._id }).lean()
    expect(events.some((e) => e.type === 'created')).toBe(true)
  })
})
