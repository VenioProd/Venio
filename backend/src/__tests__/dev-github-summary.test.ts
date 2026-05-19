import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import User from '../models/User.js'
import {
  buildRepoLinks,
  computeProjectGithubSummary,
} from '../lib/dev/githubSummary.js'

let systemUserId: mongoose.Types.ObjectId

beforeAll(async () => { await setupMongo() })
afterAll(async () => { await teardownMongo() })

beforeEach(async () => {
  await clearDb()
  const u = await User.create({
    email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x',
  })
  systemUserId = u._id as mongoose.Types.ObjectId
})

describe('buildRepoLinks', () => {
  it('returns nulls when nothing is set', () => {
    const links = buildRepoLinks(null)
    expect(links.repoUrl).toBeNull()
    expect(links.prsUrl).toBeNull()
  })

  it('derives owner/repo from htmlUrl', () => {
    const links = buildRepoLinks({
      owner: null, repo: null, defaultBranch: null,
      htmlUrl: 'https://github.com/raphaelbentv/venio',
      repoPath: null,
    })
    expect(links.repoUrl).toBe('https://github.com/raphaelbentv/venio')
    expect(links.prsUrl).toContain('/pulls')
    expect(links.actionsUrl).toContain('/actions')
  })

  it('uses defaultBranch in commits URL when set', () => {
    const links = buildRepoLinks({
      owner: 'venio', repo: 'app', defaultBranch: 'develop',
      htmlUrl: null, repoPath: null,
    })
    expect(links.commitsUrl).toContain('/commits/develop')
  })

  it('accepts an owner/repo packed in the repo field', () => {
    const links = buildRepoLinks({
      owner: null, repo: 'venio/app', defaultBranch: null,
      htmlUrl: null, repoPath: null,
    })
    expect(links.repoUrl).toBe('https://github.com/venio/app')
  })
})

describe('computeProjectGithubSummary', () => {
  it('flags non-configured when no github settings', async () => {
    const p = await DevProject.create({ key: 'VEN', name: 'Venio', createdBy: systemUserId })
    const s = await computeProjectGithubSummary({
      _id: p._id as mongoose.Types.ObjectId,
      github: p.github ?? null,
    })
    expect(s.configured).toBe(false)
    expect(s.reason).toMatch(/non configuré/i)
  })

  it('collects pull requests from related issues', async () => {
    const p = await DevProject.create({
      key: 'VEN',
      name: 'Venio',
      createdBy: systemUserId,
      github: {
        owner: 'venio',
        repo: 'app',
        defaultBranch: 'main',
        htmlUrl: null,
        repoPath: null,
      },
    })
    await DevIssue.create({
      project: p._id,
      number: 1,
      identifier: 'VEN-1',
      title: 'Open PR',
      reporter: systemUserId,
      github: {
        repo: 'venio/app',
        prNumber: 11,
        prUrl: 'https://github.com/venio/app/pull/11',
        branch: 'feat/x',
        commitSha: null,
        ciStatus: 'RUNNING',
        mergedAt: null,
      },
    })
    await DevIssue.create({
      project: p._id,
      number: 2,
      identifier: 'VEN-2',
      title: 'Merged PR',
      reporter: systemUserId,
      github: {
        repo: 'venio/app',
        prNumber: 12,
        prUrl: 'https://github.com/venio/app/pull/12',
        branch: 'feat/y',
        commitSha: null,
        ciStatus: 'SUCCESS',
        mergedAt: new Date('2026-05-10'),
      },
    })
    await DevIssue.create({
      project: p._id,
      number: 3,
      identifier: 'VEN-3',
      title: 'Failing CI',
      reporter: systemUserId,
      github: {
        repo: 'venio/app',
        prNumber: 13,
        prUrl: 'https://github.com/venio/app/pull/13',
        branch: 'feat/z',
        commitSha: null,
        ciStatus: 'FAILURE',
        mergedAt: null,
      },
    })

    const s = await computeProjectGithubSummary({
      _id: p._id as mongoose.Types.ObjectId,
      github: p.github ?? null,
    })
    expect(s.configured).toBe(true)
    expect(s.pullRequests.counts.open).toBe(2)
    expect(s.pullRequests.counts.merged).toBe(1)
    expect(s.pullRequests.counts.failing).toBe(1)
    expect(s.links.repoUrl).toBe('https://github.com/venio/app')
  })
})
