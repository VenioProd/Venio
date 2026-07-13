import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import DevIssue from '../models/DevIssue.js'
import DevIssueEvent from '../models/DevIssueEvent.js'
import DevProject from '../models/DevProject.js'
import User from '../models/User.js'
import { computeProjectDeploymentSummary } from '../lib/dev/deploymentSummary.js'

let systemUserId: mongoose.Types.ObjectId
let projectId: mongoose.Types.ObjectId

beforeAll(async () => {
  await setupMongo()
})
afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const user = await User.create({ email: 'sys@test.local', name: 'Sys', role: 'SUPER_ADMIN', passwordHash: 'x' })
  systemUserId = user._id as mongoose.Types.ObjectId
  const project = await DevProject.create({
    key: 'VEN',
    name: 'Venio',
    createdBy: systemUserId,
    github: { owner: 'acme', repo: 'venio', defaultBranch: 'main', htmlUrl: null, repoPath: null },
  })
  projectId = project._id as mongoose.Types.ObjectId
})

async function issue() {
  return DevIssue.create({
    project: projectId,
    number: 1,
    identifier: 'VEN-1',
    title: 'Déployer',
    status: 'DONE',
    priority: 'MEDIUM',
    type: 'DEPLOY',
    reporter: systemUserId,
    github: { commitSha: 'abcdef1234567890', ciStatus: 'SUCCESS' },
  })
}

describe('computeProjectDeploymentSummary', () => {
  it('uses production timeline events, keeps their source and reconstructs only canonical GitHub links', async () => {
    const devIssue = await issue()
    await DevIssueEvent.create({
      project: projectId,
      issue: devIssue._id,
      actor: systemUserId,
      type: 'deployed',
      summary: 'Production déployée',
      metadata: {
        environment: 'production',
        status: 'succeeded',
        github: { commitSha: 'abcdef1234567890', runId: 123, runUrl: 'https://attacker.invalid/logs' },
        healthcheck: { status: 'healthy', checkedAt: '2026-07-13T10:00:00.000Z' },
      },
    })
    await DevIssueEvent.create({
      project: projectId,
      issue: devIssue._id,
      actor: systemUserId,
      type: 'ci_changed',
      summary: 'CI rouge',
      metadata: { ciStatus: 'FAILURE', runId: 456, runUrl: 'https://attacker.invalid/ci' },
    })

    const project = await DevProject.findById(projectId).lean()
    const summary = await computeProjectDeploymentSummary({ _id: projectId, github: project!.github })

    expect(summary.productionCommit).toMatchObject({
      sha: 'abcdef1234567890',
      source: 'timeline_deployment',
      url: 'https://github.com/acme/venio/commit/abcdef1234567890',
    })
    expect(summary.ci).toMatchObject({
      status: 'FAILURE',
      source: 'timeline_ci',
      runUrl: 'https://github.com/acme/venio/actions/runs/456',
    })
    expect(summary.deployment).toMatchObject({
      status: 'success',
      logsUrl: 'https://github.com/acme/venio/actions/runs/123',
    })
    expect(summary.healthcheck.status).toBe('healthy')
  })

  it('does not treat staging observations as a healthy production state', async () => {
    const devIssue = await issue()
    await DevIssueEvent.create({
      project: projectId,
      issue: devIssue._id,
      type: 'deployed',
      summary: 'Staging déployée',
      metadata: { environment: 'staging', status: 'succeeded', healthcheck: { status: 'healthy' } },
    })

    const project = await DevProject.findById(projectId).lean()
    const summary = await computeProjectDeploymentSummary({ _id: projectId, github: project!.github })

    expect(summary.productionCommit.sha).toBeNull()
    expect(summary.deployment.status).toBe('unknown')
    expect(summary.healthcheck.status).toBe('unknown')
    // The linked issue CI is fresh, but it must not turn production into a healthy state.
    expect(summary.freshness).toBe('fresh')
  })

  it('does not infer a production commit from mutable issue metadata', async () => {
    const devIssue = await issue()
    await DevIssueEvent.create({
      project: projectId,
      issue: devIssue._id,
      type: 'deployed',
      summary: 'Production déployée sans SHA persistée',
      metadata: { environment: 'production', status: 'succeeded' },
    })

    const project = await DevProject.findById(projectId).lean()
    const summary = await computeProjectDeploymentSummary({ _id: projectId, github: project!.github })

    expect(summary.deployment.status).toBe('success')
    expect(summary.productionCommit.sha).toBeNull()
  })
})
