import { beforeAll, afterAll, beforeEach, it, expect } from 'vitest'
import mongoose from 'mongoose'
import express from 'express'
import request from 'supertest'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import DevProject from '../models/DevProject.js'
import DevIssue from '../models/DevIssue.js'
import User from '../models/User.js'
import { computeStats, computeOverview, computeProjectCockpit } from '../lib/dev/stats.js'
import issuesRouter from '../routes/admin/dev/issues.js'
import { computeIssueAnalytics } from '../lib/dev/issueAnalytics.js'
import { issueFilter } from '../lib/dev/issueFilter.js'
import dashboard from '../routes/admin/education/dashboard.js'
import {
  EducationClass,
  EducationStudent,
  EducationAssignment,
  EducationSubmission,
} from '../models/education/index.js'

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(clearDb)

it('regression: a BLOCKED issue should count as a blocker without a label', async () => {
  const user = await User.create({
    email: 'audit@test.local',
    name: 'Audit',
    role: 'SUPER_ADMIN',
    passwordHash: 'test',
  })
  const project = await DevProject.create({ key: 'AUDIT', name: 'Audit', createdBy: user._id })
  await DevIssue.create({
    project: project._id,
    number: 1,
    identifier: 'AUDIT-1',
    title: 'Blocked',
    status: 'BLOCKED',
    type: 'TASK',
    reporter: user._id,
    labels: [],
  })
  const stats = await computeStats()
  const overview = await computeOverview()
  expect.soft(stats.byStatus.BLOCKED).toBe(1)
  expect.soft(stats.blocked).toBe(1)
  expect.soft(overview.projects[0].counts.blocked).toBe(1)
  expect.soft(overview.projects[0].health).toBe('blocked')
})

it('regression: school A dashboard should not count school B submissions', async () => {
  const owner = new mongoose.Types.ObjectId()
  await EducationClass.create({ owner, name: 'A', school: 'School A' })
  const klass = await EducationClass.create({ owner, name: 'B', school: 'School B' })
  const student = await EducationStudent.create({ owner, classId: klass._id, firstName: 'Test', lastName: 'Student' })
  const assignment = await EducationAssignment.create({
    owner,
    classId: klass._id,
    title: 'B homework',
    status: 'OUVERT',
  })
  await EducationSubmission.create({
    owner,
    studentId: student._id,
    assignmentId: assignment._id,
    status: 'EN_RETARD',
    isLate: true,
  })
  const app = express()
  app.use((req, _res, next) => {
    req.user = { id: String(owner), role: 'SUPER_ADMIN' } as typeof req.user
    next()
  })
  app.use('/dashboard', dashboard)
  const r = await request(app).get('/dashboard?school=School%20A').expect(200)
  expect.soft(r.body.toCorrect).toHaveLength(0)
  expect.soft(r.body.counters.toGrade).toBe(0)
  expect.soft(r.body.counters.lateSubmissions).toBe(0)
})

async function devFixture() {
  const user = await User.create({
    email: 'regression@test.local',
    name: 'Test',
    role: 'SUPER_ADMIN',
    passwordHash: 'test',
    twoFactorEnabled: true,
  })
  const project = await DevProject.create({ key: 'REG', name: 'Regression', createdBy: user._id })
  const app = express()
  app.use((req, _res, next) => {
    req.user = { id: String(user._id), role: 'SUPER_ADMIN' } as typeof req.user
    next()
  })
  app.use(issuesRouter)
  return { user, project, app }
}

it('counts more than eight alerts, deduplicates status/labels and excludes archived or closed blockers', async () => {
  const { user, project } = await devFixture()
  const base = {
    project: project._id,
    reporter: user._id,
    title: 'Alert',
    priority: 'URGENT',
    type: 'TASK',
    dueDate: new Date(Date.now() - 86400000),
  }
  await DevIssue.insertMany(
    Array.from({ length: 12 }, (_, i) => ({
      ...base,
      number: i + 1,
      identifier: `REG-${i + 1}`,
      status: i % 2 ? 'BLOCKED' : 'TODO',
      labels: i % 2 ? ['blocked'] : ['BLOCKER'],
    })),
  )
  await DevIssue.insertMany([
    { ...base, number: 13, identifier: 'REG-13', status: 'BLOCKED', archivedAt: new Date() },
    {
      ...base,
      number: 14,
      identifier: 'REG-14',
      status: 'DONE',
      labels: ['blocked'],
      completedAt: new Date(),
      archivedAt: new Date(),
    },
    { ...base, number: 15, identifier: 'REG-15', status: 'CANCELLED', labels: ['blocked'] },
  ])
  const cockpit = await computeProjectCockpit(project._id)
  expect(cockpit?.counts).toMatchObject({ urgent: 12, blocked: 12, overdue: 12 })
  expect(cockpit?.blockers).toHaveLength(8)
  expect(cockpit?.urgent).toHaveLength(8)
  expect(cockpit?.velocity.completed14d).toBe(0)
  expect((await computeStats()).blocked).toBe(12)
  expect((await computeOverview()).projects[0].counts.blocked).toBe(12)
})

it('paginates 602 issues with stable ordering and computes analytics over every filtered record', async () => {
  const { user, project, app } = await devFixture()
  const completedAt = new Date(Date.now() - 3 * 86400000)
  await DevIssue.insertMany(
    Array.from({ length: 602 }, (_, i) => ({
      project: project._id,
      reporter: user._id,
      number: i + 1,
      identifier: `REG-${i + 1}`,
      title: 'Full collection',
      type: 'TASK',
      status: 'DONE',
      completedAt,
      rank: 'a',
      createdByModel: i < 501 ? 'GPT_5_6_SOL' : 'CLAUDE_SONNET',
    })),
  )
  await DevIssue.create({
    project: project._id,
    reporter: user._id,
    number: 603,
    identifier: 'REG-603',
    title: 'Archived',
    status: 'DONE',
    completedAt,
    archivedAt: new Date(),
  })
  const params = `project=${project._id}&pageSize=500`
  const first = await request(app).get(`/issues?${params}`).expect(200)
  const second = await request(app).get(`/issues?${params}&page=2`).expect(200)
  expect(first.body).toMatchObject({ total: 602, page: 1, pageSize: 500, nextPage: 2 })
  expect(first.body.issues).toHaveLength(500)
  expect(second.body.issues).toHaveLength(102)
  expect(second.body.nextPage).toBeNull()
  expect(new Set([...first.body.issues, ...second.body.issues].map((i: { _id: string }) => i._id)).size).toBe(602)
  const repeat = await request(app).get(`/issues?${params}`).expect(200)
  expect(repeat.body.issues.map((i: { _id: string }) => i._id)).toEqual(
    first.body.issues.map((i: { _id: string }) => i._id),
  )
  const analytics = await request(app).get(`/issues/analytics?project=${project._id}&timezone=Europe/Paris`).expect(200)
  expect(analytics.body.total).toBe(602)
  expect(analytics.body.creatorModels).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ label: 'GPT_5_6_SOL', value: 501 }),
      expect.objectContaining({ label: 'CLAUDE_SONNET', value: 101 }),
    ]),
  )
  expect(analytics.body.velocity.reduce((sum: number, row: { count: number }) => sum + row.count, 0)).toBe(602)
  const empty = await request(app).get(`/issues/analytics?project=${project._id}&q=absent&timezone=invalid`).expect(200)
  expect(empty.body.total).toBe(0)
  expect(empty.body.velocity).toHaveLength(14)
  expect(empty.body.creatorModels).toEqual([])
  const byAssignee = await computeIssueAnalytics(
    issueFilter({ project: String(project._id), assignee: 'me' }, String(user._id)),
    'UTC',
  )
  expect(byAssignee.total).toBe(0)
  await request(app).get('/issues?page=1.5').expect(400)
})

it('only lists assignments with actual ungraded submissions in the selected school', async () => {
  const owner = new mongoose.Types.ObjectId()
  const klass = await EducationClass.create({ owner, name: 'A', school: 'A' })
  const student = await EducationStudent.create({ owner, classId: klass._id, lastName: 'Test' })
  const assignments = await EducationAssignment.insertMany(
    ['pending', 'empty', 'graded', 'missing', 'closed'].map((title) => ({
      owner,
      classId: klass._id,
      title,
      status: title === 'closed' ? 'CLOS' : 'OUVERT',
    })),
  )
  await EducationSubmission.insertMany(
    [0, 2, 3, 4].map((i) => ({
      owner,
      studentId: student._id,
      assignmentId: assignments[i]._id,
      status: i === 3 ? 'NON_RENDU' : 'EN_RETARD',
      grade: i === 2 ? 15 : null,
      isLate: true,
    })),
  )
  const app = express()
  app.use((req, _res, next) => {
    req.user = { id: String(owner), role: 'SUPER_ADMIN' } as typeof req.user
    next()
  })
  app.use('/dashboard', dashboard)
  const result = await request(app).get('/dashboard?school=A').expect(200)
  expect(result.body.toCorrect.map((a: { title: string }) => a.title)).toEqual(['pending'])
  expect(result.body.counters).toMatchObject({ toGrade: 1, lateSubmissions: 1 })
})
