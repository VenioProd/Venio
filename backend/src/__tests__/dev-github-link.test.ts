import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import {
  createTestApp,
  createAgentTokenInDb,
  authHeaders,
  uniqueIdempotencyKey,
} from './helpers/agentTestApp.js'
import User from '../models/User.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import { parseGithubPatch, mergeGithubLink } from '../lib/dev/github.js'

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

describe('parseGithubPatch', () => {
  it('returns undefined when field is absent', () => {
    expect(parseGithubPatch(undefined)).toBeUndefined()
  })
  it('returns null when caller sends null', () => {
    expect(parseGithubPatch(null)).toBeNull()
  })
  it('only includes provided keys', () => {
    const patch = parseGithubPatch({ repo: 'venio/app' })
    expect(patch).toEqual({ repo: 'venio/app' })
  })
  it('coerces prNumber to a positive integer', () => {
    expect(parseGithubPatch({ prNumber: '12' })).toEqual({ prNumber: 12 })
    expect(parseGithubPatch({ prNumber: -5 })).toEqual({ prNumber: null })
    expect(parseGithubPatch({ prNumber: 'abc' })).toEqual({ prNumber: null })
  })
  it('rejects non-http prUrl', () => {
    expect(parseGithubPatch({ prUrl: 'javascript:alert(1)' })).toEqual({ prUrl: null })
    expect(parseGithubPatch({ prUrl: 'https://github.com/v/r/pull/1' })).toEqual({
      prUrl: 'https://github.com/v/r/pull/1',
    })
  })
  it('normalizes commitSha to lowercase hex 7-40', () => {
    expect(parseGithubPatch({ commitSha: 'AbCdEf1' })).toEqual({ commitSha: 'abcdef1' })
    expect(parseGithubPatch({ commitSha: 'short' })).toEqual({ commitSha: null })
  })
  it('only accepts known ciStatus values', () => {
    expect(parseGithubPatch({ ciStatus: 'SUCCESS' })).toEqual({ ciStatus: 'SUCCESS' })
    expect(parseGithubPatch({ ciStatus: 'BAD' })).toEqual({ ciStatus: null })
  })
})

describe('mergeGithubLink', () => {
  it('initializes from empty when prev is null', () => {
    expect(mergeGithubLink(null, { repo: 'venio/app' })).toMatchObject({
      repo: 'venio/app',
      prNumber: null,
      prUrl: null,
    })
  })
  it('preserves other fields', () => {
    const prev = {
      repo: 'venio/app',
      prNumber: 1,
      prUrl: null,
      branch: null,
      commitSha: null,
      ciStatus: null,
      mergedAt: null,
    }
    expect(mergeGithubLink(prev, { ciStatus: 'SUCCESS' })).toMatchObject({ repo: 'venio/app', prNumber: 1, ciStatus: 'SUCCESS' })
  })
})

describe('PATCH /api/v1/agent/dev/issues/:id — github link', () => {
  it('attaches a github link on partial patch', async () => {
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
        github: {
          repo: 'venio/app',
          prNumber: 42,
          prUrl: 'https://github.com/venio/app/pull/42',
          ciStatus: 'RUNNING',
        },
      })
      .expect(200)
    expect(res.body.github).toMatchObject({
      repo: 'venio/app',
      prNumber: 42,
      prUrl: 'https://github.com/venio/app/pull/42',
      ciStatus: 'RUNNING',
    })
  })

  it('merges subsequent patches without dropping prior fields', async () => {
    const issue = await DevIssue.create({
      project: projectId,
      identifier: 'VEN-1',
      number: 1,
      title: 'A',
      reporter: systemUserId,
      github: {
        repo: 'venio/app',
        prNumber: 42,
        prUrl: null,
        branch: null,
        commitSha: null,
        ciStatus: null,
        mergedAt: null,
      },
    })
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const res = await request(app)
      .patch(`/api/v1/agent/dev/issues/${issue._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ github: { ciStatus: 'SUCCESS', mergedAt: '2026-05-19' } })
      .expect(200)
    expect(res.body.github.repo).toBe('venio/app')
    expect(res.body.github.prNumber).toBe(42)
    expect(res.body.github.ciStatus).toBe('SUCCESS')
    expect(new Date(res.body.github.mergedAt).toISOString().startsWith('2026-05-19')).toBe(true)
  })

  it('clears the github link when patch is null', async () => {
    const issue = await DevIssue.create({
      project: projectId,
      identifier: 'VEN-1',
      number: 1,
      title: 'A',
      reporter: systemUserId,
      github: { repo: 'venio/app', prNumber: 1, prUrl: null, branch: null, commitSha: null, ciStatus: null, mergedAt: null },
    })
    const { plainSecret } = await createAgentTokenInDb(['write:dev'])
    const res = await request(app)
      .patch(`/api/v1/agent/dev/issues/${issue._id}`)
      .set(authHeaders(plainSecret, { idempotencyKey: uniqueIdempotencyKey() }))
      .send({ github: null })
      .expect(200)
    expect(res.body.github).toBeNull()
  })
})
