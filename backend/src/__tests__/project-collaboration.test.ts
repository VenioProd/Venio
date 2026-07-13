import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import projectRoutes from '../routes/projects.js'
import projectContentRoutes from '../routes/client/projectContent.js'
import projectMessageRoutes from '../routes/client/messages.js'
import projectCollaborationRoutes from '../routes/client/collaboration.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'
import ProjectSection from '../models/ProjectSection.js'
import ProjectItem from '../models/ProjectItem.js'
import Message from '../models/Message.js'

let app: Express
let ownerId: string
let editorId: string
let viewerId: string
let outsiderId: string
let projectId: string
let otherProjectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/projects', projectRoutes)
  app.use('/api/projects', projectContentRoutes)
  app.use('/api/projects', projectMessageRoutes)
  app.use('/api/projects', projectCollaborationRoutes)
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [owner, editor, viewer, outsider] = await User.create([
    { name: 'Owner', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Editor', email: 'editor@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Viewer', email: 'viewer@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Outsider', email: 'outsider@example.test', passwordHash, role: 'CLIENT' },
  ])
  ownerId = String(owner._id)
  editorId = String(editor._id)
  viewerId = String(viewer._id)
  outsiderId = String(outsider._id)
  const [project, otherProject] = await Project.create([
    { name: 'Shared project', client: owner._id },
    { name: 'Other project', client: outsider._id },
  ])
  projectId = String(project._id)
  otherProjectId = String(otherProject._id)
  await ProjectSection.create({ project: project._id, title: 'Planification', createdBy: owner._id, isVisible: true })
})

describe('project collaboration', () => {
  it('lets the owner grant read or edit access by normalized exact email without a share secret', async () => {
    const response = await request(app)
      .post(`/api/projects/${projectId}/collaborators`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ email: '  EDITOR@EXAMPLE.TEST  ', role: 'EDITOR' })
      .expect(201)

    expect(response.body.collaborator).toMatchObject({ role: 'EDITOR', user: { _id: editorId, name: 'Editor' } })
    expect(response.body.collaborator).not.toHaveProperty('token')
    expect(await ProjectMember.countDocuments({ project: projectId, user: editorId })).toBe(1)

    await request(app)
      .post(`/api/projects/${projectId}/collaborators`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ email: 'viewer@example.test', role: 'VIEWER' })
      .expect(201)

    const ownerList = await request(app)
      .get(`/api/projects/${projectId}/collaborators`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)
    expect(ownerList.body.collaborators).toHaveLength(2)
  })

  it('gives editors project-scoped access and lets them comment, not manage membership', async () => {
    await ProjectMember.create({ project: projectId, user: editorId, role: 'EDITOR', createdBy: ownerId })

    const detail = await request(app)
      .get(`/api/projects/${projectId}`)
      .set('Cookie', await cookieFor(editorId))
      .expect(200)
    expect(detail.body.accessRole).toBe('EDITOR')

    const content = await request(app)
      .get(`/api/projects/${projectId}/sections`)
      .set('Cookie', await cookieFor(editorId))
      .expect(200)
    expect(content.body.sections).toHaveLength(1)

    const comment = await request(app)
      .post(`/api/projects/${projectId}/messages`)
      .set('Cookie', await cookieFor(editorId))
      .send({ content: 'Je peux commenter' })
      .expect(201)
    expect(comment.body.message).toMatchObject({ content: 'Je peux commenter', sender: { _id: editorId } })
    expect(await Message.countDocuments({ project: projectId })).toBe(1)

    await request(app)
      .post(`/api/projects/${projectId}/collaborators`)
      .set('Cookie', await cookieFor(editorId))
      .send({ email: 'viewer@example.test', role: 'VIEWER' })
      .expect(403)

    await request(app)
      .get(`/api/projects/${projectId}/collaborators`)
      .set('Cookie', await cookieFor(editorId))
      .expect(403)

    await request(app)
      .get(`/api/projects/${otherProjectId}`)
      .set('Cookie', await cookieFor(editorId))
      .expect(404)
  })

  it('keeps viewers read-only and revocation blocks all future project reads', async () => {
    const member = await ProjectMember.create({
      project: projectId,
      user: viewerId,
      role: 'VIEWER',
      createdBy: ownerId,
    })
    const item = await ProjectItem.create({
      project: projectId,
      title: 'Visible Gantt item',
      type: 'NOTE',
      createdBy: ownerId,
      isVisible: true,
    })

    await request(app)
      .get(`/api/projects/${projectId}/messages`)
      .set('Cookie', await cookieFor(viewerId))
      .expect(200)
    await request(app)
      .get(`/api/projects/${projectId}/items/${item._id}`)
      .set('Cookie', await cookieFor(viewerId))
      .expect(200)
    expect((await ProjectItem.findById(item._id))!.viewedAt).toBeNull()
    await request(app)
      .post(`/api/projects/${projectId}/messages`)
      .set('Cookie', await cookieFor(viewerId))
      .send({ content: 'Mutation interdite' })
      .expect(403)
    await request(app)
      .post(`/api/projects/${projectId}/messages/read`)
      .set('Cookie', await cookieFor(viewerId))
      .expect(403)

    // A member id from another project cannot be used to target this project.
    await request(app)
      .delete(`/api/projects/${otherProjectId}/collaborators/${member._id}`)
      .set('Cookie', await cookieFor(outsiderId))
      .expect(404)

    await request(app)
      .delete(`/api/projects/${projectId}/collaborators/${member._id}`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)
    await request(app)
      .get(`/api/projects/${projectId}/sections`)
      .set('Cookie', await cookieFor(viewerId))
      .expect(404)
  })

  it('lets only the owner update and revoke a collaborator', async () => {
    await ProjectMember.create({
      project: projectId,
      user: editorId,
      role: 'EDITOR',
      createdBy: ownerId,
    })
    const member = await ProjectMember.create({
      project: projectId,
      user: viewerId,
      role: 'VIEWER',
      createdBy: ownerId,
    })

    await request(app)
      .patch(`/api/projects/${projectId}/collaborators/${member._id}`)
      .set('Cookie', await cookieFor(editorId))
      .send({ role: 'EDITOR' })
      .expect(403)

    const updated = await request(app)
      .patch(`/api/projects/${projectId}/collaborators/${member._id}`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ role: 'EDITOR' })
      .expect(200)
    expect(updated.body.collaborator).toMatchObject({ _id: String(member._id), role: 'EDITOR' })

    await request(app)
      .delete(`/api/projects/${projectId}/collaborators/${member._id}`)
      .set('Cookie', await cookieFor(editorId))
      .expect(403)

    await request(app)
      .delete(`/api/projects/${projectId}/collaborators/${member._id}`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)
    expect(await ProjectMember.findById(member._id)).toBeNull()
  })
})
