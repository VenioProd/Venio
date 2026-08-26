import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminClientRoutes from '../routes/admin/clients/index.js'
import adminProjectRoutes from '../routes/admin/projects/index.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ClientUpload from '../models/ClientUpload.js'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/admin/clients', adminClientRoutes)
  app.use('/api/admin/projects', adminProjectRoutes)
})

afterAll(teardownMongo)
beforeEach(clearDb)

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function makeUser(email: string, role: string, extra: Record<string, unknown> = {}) {
  const passwordHash = await bcrypt.hash('x', 4)
  return User.create({ name: role, email, passwordHash, role, isActive: true, ...extra })
}

describe('GET /api/admin/clients/:id/files', () => {
  it('exige MANAGE_CLIENTS, refuse un admin sans la permission (403)', async () => {
    const client = await makeUser('client@example.test', 'CLIENT')
    const viewer = await makeUser('viewer@example.test', 'VIEWER')

    await request(app)
      .get(`/api/admin/clients/${client._id}/files`)
      .set('Cookie', await cookieFor(String(viewer._id)))
      .expect(403)
  })

  it('liste les fichiers du compte pour un SUPER_ADMIN, refuse un fileId étranger au téléchargement', async () => {
    const client = await makeUser('client2@example.test', 'CLIENT')
    const otherClient = await makeUser('other@example.test', 'CLIENT')
    const admin = await makeUser('admin@example.test', 'SUPER_ADMIN')

    const file = await ClientUpload.create({
      client: client._id,
      originalName: 'a.pdf',
      storagePath: 'uploads/client-files/x/a.pdf',
      mimeType: 'application/pdf',
      size: 1,
    })
    const foreignFile = await ClientUpload.create({
      client: otherClient._id,
      originalName: 'b.pdf',
      storagePath: 'uploads/client-files/y/b.pdf',
      mimeType: 'application/pdf',
      size: 1,
    })

    const adminCookie = await cookieFor(String(admin._id))

    const list = await request(app).get(`/api/admin/clients/${client._id}/files`).set('Cookie', adminCookie).expect(200)
    expect(list.body.files).toHaveLength(1)
    expect(list.body.files[0].id).toBe(String(file._id))
    expect(list.body.files[0].storagePath).toBeUndefined()

    await request(app)
      .get(`/api/admin/clients/${client._id}/files/${foreignFile._id}/download`)
      .set('Cookie', adminCookie)
      .expect(404)
  })

  it('pose downloadedByAdminAt au premier téléchargement, inchangé ensuite', async () => {
    const client = await makeUser('client3@example.test', 'CLIENT')
    const admin = await makeUser('admin2@example.test', 'SUPER_ADMIN')
    const file = await ClientUpload.create({
      client: client._id,
      originalName: 'c.txt',
      storagePath: 'uploads/client-files/x/c.txt',
      mimeType: 'text/plain',
      size: 1,
    })
    const fs = await import('fs')
    const path = await import('path')
    const dir = path.resolve('uploads/client-files/x')
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(path.resolve('uploads/client-files/x/c.txt'), 'contenu')

    const adminCookie = await cookieFor(String(admin._id))
    await request(app)
      .get(`/api/admin/clients/${client._id}/files/${file._id}/download`)
      .set('Cookie', adminCookie)
      .expect(200)
    const afterFirst = await ClientUpload.findById(file._id).select('downloadedByAdminAt').lean()
    expect(afterFirst?.downloadedByAdminAt).toBeTruthy()
    const firstTimestamp = afterFirst?.downloadedByAdminAt

    await request(app)
      .get(`/api/admin/clients/${client._id}/files/${file._id}/download`)
      .set('Cookie', adminCookie)
      .expect(200)
    const afterSecond = await ClientUpload.findById(file._id).select('downloadedByAdminAt').lean()
    expect(afterSecond?.downloadedByAdminAt?.getTime()).toBe(firstTimestamp?.getTime())

    await fs.promises.rm(path.resolve('uploads/client-files'), { recursive: true, force: true })
  })
})

describe('GET /api/admin/projects/:projectId/client-files', () => {
  it('exige VIEW_CONTENT, refuse un fileId non rattaché à ce projet (404)', async () => {
    const client = await makeUser('client4@example.test', 'CLIENT')
    const admin = await makeUser('admin3@example.test', 'SUPER_ADMIN')
    const rh = await makeUser('rh@example.test', 'RH')
    const project = await Project.create({ name: 'Projet A', client: client._id })
    const otherProject = await Project.create({ name: 'Projet B', client: client._id })

    const file = await ClientUpload.create({
      client: client._id,
      project: project._id,
      originalName: 'd.pdf',
      storagePath: 'uploads/client-files/x/d.pdf',
      mimeType: 'application/pdf',
      size: 1,
    })

    await request(app)
      .get(`/api/admin/projects/${project._id}/client-files`)
      .set('Cookie', await cookieFor(String(rh._id)))
      .expect(403)

    const adminCookie = await cookieFor(String(admin._id))
    const list = await request(app)
      .get(`/api/admin/projects/${project._id}/client-files`)
      .set('Cookie', adminCookie)
      .expect(200)
    expect(list.body.files).toHaveLength(1)
    expect(list.body.files[0].client.name).toBe('CLIENT')

    await request(app)
      .get(`/api/admin/projects/${otherProject._id}/client-files/${file._id}/download`)
      .set('Cookie', adminCookie)
      .expect(404)
  })
})
