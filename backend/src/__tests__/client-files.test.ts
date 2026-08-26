import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientFileRoutes from '../routes/client/files.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ClientUpload from '../models/ClientUpload.js'
import ClientActivity from '../models/ClientActivity.js'
import ActivityLog from '../models/ActivityLog.js'
import Notification from '../models/Notification.js'

let app: Express

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use('/api/client', clientFileRoutes)
})

afterAll(async () => {
  await teardownMongo()
  await fs.promises.rm(path.resolve('uploads/client-files'), { recursive: true, force: true }).catch(() => {})
})

beforeEach(clearDb)

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function makeClient(email: string) {
  const passwordHash = await bcrypt.hash('x', 4)
  return User.create({ name: 'Client', email, passwordHash, role: 'CLIENT' })
}

describe('POST /api/client/files', () => {
  it('accepte un dépôt multiple sans projet : fichiers sur disque, documents créés, pas de storagePath en réponse', async () => {
    const client = await makeClient('deposant@example.test')

    const response = await request(app)
      .post('/api/client/files')
      .set('Cookie', await cookieFor(String(client._id)))
      .field('category', 'LOGO')
      .field('note', 'Logo v2')
      .attach('files', Buffer.from('fake-png'), { filename: 'logo.png', contentType: 'image/png' })
      .attach('files', Buffer.from('fake-pdf'), { filename: 'brief.pdf', contentType: 'application/pdf' })
      .expect(201)

    expect(response.body.files).toHaveLength(2)
    for (const file of response.body.files) {
      expect(file.storagePath).toBeUndefined()
    }

    const stored = await ClientUpload.find({ client: client._id })
    expect(stored).toHaveLength(2)
    for (const doc of stored) {
      expect(fs.existsSync(path.resolve(process.cwd(), doc.storagePath))).toBe(true)
      expect(doc.storagePath).toContain(`uploads/client-files/${client._id}`)
    }
  })

  it('accepte un dépôt avec projectId accessible', async () => {
    const client = await makeClient('proprio@example.test')
    const project = await Project.create({ name: 'Site', client: client._id })

    const response = await request(app)
      .post('/api/client/files')
      .set('Cookie', await cookieFor(String(client._id)))
      .field('projectId', String(project._id))
      .attach('files', Buffer.from('data'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(201)

    expect(response.body.files[0].project).toBe(String(project._id))
  })

  it('refuse un projectId étranger (404) et ne laisse aucun fichier sur disque', async () => {
    const client = await makeClient('sans-acces@example.test')
    const otherClient = await makeClient('autre@example.test')
    const foreignProject = await Project.create({ name: 'Étranger', client: otherClient._id })

    const response = await request(app)
      .post('/api/client/files')
      .set('Cookie', await cookieFor(String(client._id)))
      .field('projectId', String(foreignProject._id))
      .attach('files', Buffer.from('data'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(404)

    expect(response.body.error).toBeDefined()
    const remaining = await ClientUpload.find({ client: client._id })
    expect(remaining).toHaveLength(0)
    const dir = path.resolve('uploads/client-files', String(client._id))
    const files = fs.existsSync(dir) ? await fs.promises.readdir(dir) : []
    expect(files).toHaveLength(0)
  })

  it('refuse un 11e fichier (400/413) et un MIME hors allowlist (400 UNSUPPORTED_FILE_TYPE)', async () => {
    const client = await makeClient('limites@example.test')
    const cookie = await cookieFor(String(client._id))

    let requestBuilder = request(app).post('/api/client/files').set('Cookie', cookie)
    for (let i = 0; i < 11; i++) {
      requestBuilder = requestBuilder.attach('files', Buffer.from(`f${i}`), {
        filename: `f${i}.pdf`,
        contentType: 'application/pdf',
      })
    }
    const tooMany = await requestBuilder
    expect(tooMany.status).toBe(400)
    expect(tooMany.body.error).toBeDefined()

    const badMime = await request(app)
      .post('/api/client/files')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('exe'), { filename: 'virus.exe', contentType: 'application/x-msdownload' })
      .expect(400)
    expect(badMime.body.code).toBe('UNSUPPORTED_FILE_TYPE')
  })

  it('crée une notification CLIENT_FILE_UPLOADED par SUPER_ADMIN actif, une seule par dépôt, dedupe au dépôt suivant', async () => {
    const client = await makeClient('notif@example.test')
    const passwordHash = await bcrypt.hash('x', 4)
    const admin = await User.create({
      name: 'Admin',
      email: 'admin@example.test',
      passwordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
    })
    const cookie = await cookieFor(String(client._id))

    await request(app)
      .post('/api/client/files')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('a'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .attach('files', Buffer.from('b'), { filename: 'b.pdf', contentType: 'application/pdf' })
      .expect(201)

    const notifications = await Notification.find({ recipient: admin._id, type: 'CLIENT_FILE_UPLOADED' })
    expect(notifications).toHaveLength(1)

    await request(app)
      .post('/api/client/files')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('c'), { filename: 'c.pdf', contentType: 'application/pdf' })
      .expect(201)

    const afterSecond = await Notification.find({ recipient: admin._id, type: 'CLIENT_FILE_UPLOADED' })
    expect(afterSecond).toHaveLength(1)
  })

  it('trace un ClientActivity systématiquement, un ActivityLog FICHIER_CLIENT_DEPOSE seulement si projet', async () => {
    const client = await makeClient('trace@example.test')
    const project = await Project.create({ name: 'Traçable', client: client._id })
    const cookie = await cookieFor(String(client._id))

    await request(app)
      .post('/api/client/files')
      .set('Cookie', cookie)
      .attach('files', Buffer.from('a'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .expect(201)
    const activities = await ClientActivity.find({ clientId: client._id, type: 'FICHIER_DEPOSE' })
    expect(activities).toHaveLength(1)
    const logsWithoutProject = await ActivityLog.find({ action: 'FICHIER_CLIENT_DEPOSE' })
    expect(logsWithoutProject).toHaveLength(0)

    await request(app)
      .post('/api/client/files')
      .set('Cookie', cookie)
      .field('projectId', String(project._id))
      .attach('files', Buffer.from('b'), { filename: 'b.pdf', contentType: 'application/pdf' })
      .expect(201)
    const logsWithProject = await ActivityLog.find({ action: 'FICHIER_CLIENT_DEPOSE', project: project._id })
    expect(logsWithProject).toHaveLength(1)
  })
})

describe('scoping et sécurité des fichiers déposés', () => {
  it('un client B ne liste pas, ne télécharge pas et ne supprime pas les fichiers du client A ; A gère les siens', async () => {
    const clientA = await makeClient('a@example.test')
    const clientB = await makeClient('b@example.test')
    const cookieA = await cookieFor(String(clientA._id))
    const cookieB = await cookieFor(String(clientB._id))

    const uploadResponse = await request(app)
      .post('/api/client/files')
      .set('Cookie', cookieA)
      .attach('files', Buffer.from('secret'), { filename: 'secret.pdf', contentType: 'application/pdf' })
      .expect(201)
    const fileId = uploadResponse.body.files[0].id

    const listB = await request(app).get('/api/client/files').set('Cookie', cookieB).expect(200)
    expect(listB.body.files).toHaveLength(0)

    await request(app).get(`/api/client/files/${fileId}/download`).set('Cookie', cookieB).expect(404)
    await request(app).delete(`/api/client/files/${fileId}`).set('Cookie', cookieB).expect(404)

    await request(app).get(`/api/client/files/${fileId}/download`).set('Cookie', cookieA).expect(200)
    await request(app).delete(`/api/client/files/${fileId}`).set('Cookie', cookieA).expect(200)

    const stored = await ClientUpload.findById(fileId)
    expect(stored).toBeNull()
  })

  it('un storagePath forgé hors de uploads/ répond 403 et ne sert jamais le fichier', async () => {
    const client = await makeClient('traversal@example.test')
    const forged = await ClientUpload.create({
      client: client._id,
      originalName: 'evil.txt',
      storagePath: '../../etc/passwd',
      mimeType: 'text/plain',
      size: 1,
    })

    const response = await request(app)
      .get(`/api/client/files/${forged._id}/download`)
      .set('Cookie', await cookieFor(String(client._id)))
      .expect(403)
    expect(response.body.error).toBeDefined()
  })
})
