import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import authRoutes from '../routes/auth.js'
import documentRoutes from '../routes/documents.js'
import adminClientRoutes from '../routes/admin/clients/index.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'
import Document from '../models/Document.js'

const PASSWORD = 'motdepasse-client'

let app: Express
let ownerId: string
let viewerId: string
let outsiderId: string
let adminId: string
let agentId: string
let documentId: string
let uploadedFile: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

function sessionCookie(response: request.Response): string | undefined {
  const raw = response.headers['set-cookie']
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
  return cookies.find((c: string) => c.startsWith('venio_session='))
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/auth', authRoutes)
  app.use('/api/documents', documentRoutes)
  app.use('/api/admin/clients', adminClientRoutes)

  const uploadsDir = path.resolve(process.cwd(), 'uploads')
  await fs.promises.mkdir(uploadsDir, { recursive: true })
  uploadedFile = path.join(uploadsDir, 'client-portal-access.test.txt')
  await fs.promises.writeFile(uploadedFile, 'devis')
})

afterAll(async () => {
  await fs.promises.unlink(uploadedFile).catch(() => {})
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash(PASSWORD, 4)
  const [owner, viewer, outsider, admin, agent] = await User.create([
    { name: 'Owner', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Viewer', email: 'viewer@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Outsider', email: 'outsider@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Admin', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Agent', email: 'agent@example.test', passwordHash, role: 'AGENT' },
  ])
  ownerId = String(owner._id)
  viewerId = String(viewer._id)
  outsiderId = String(outsider._id)
  adminId = String(admin._id)
  agentId = String(agent._id)

  const project = await Project.create({ name: 'Site vitrine', client: owner._id })
  await ProjectMember.create({ project: project._id, user: viewer._id, role: 'VIEWER', createdBy: owner._id })

  const document = await Document.create({
    project: project._id,
    type: 'DEVIS',
    originalName: 'devis.txt',
    storagePath: path.relative(process.cwd(), uploadedFile),
    mimeType: 'text/plain',
    uploadedBy: admin._id,
  })
  documentId = String(document._id)
})

describe('connexion espace client', () => {
  it('ouvre une session par cookie HttpOnly sans renvoyer de jeton', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'OWNER@example.test', password: PASSWORD })
      .expect(200)

    expect(response.body).not.toHaveProperty('token')
    expect(response.body.requires2FA).toBeUndefined()
    const cookie = sessionCookie(response)
    expect(cookie).toBeDefined()
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')

    const me = await request(app).get('/api/auth/me').set('Cookie', cookie!.split(';')[0]).expect(200)
    expect(me.body.user).toMatchObject({ email: 'owner@example.test', role: 'CLIENT' })
    expect(me.body.user.passwordHash).toBeUndefined()
  })

  it('refuse un mot de passe invalide sans distinguer le compte inexistant', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.test', password: 'mauvais' })
      .expect(401)
    const unknownAccount = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inconnu@example.test', password: PASSWORD })
      .expect(401)

    expect(wrongPassword.body.error).toBe(unknownAccount.body.error)
    expect(sessionCookie(wrongPassword)).toBeUndefined()
  })

  it('bloque un client désactivé ou archivé', async () => {
    await User.findByIdAndUpdate(ownerId, { status: 'ARCHIVE' })
    await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: PASSWORD }).expect(403)

    await User.findByIdAndUpdate(ownerId, { status: 'ACTIF', isActive: false })
    await request(app).post('/api/auth/login').send({ email: 'owner@example.test', password: PASSWORD }).expect(403)
  })

  it('coupe la session en cours quand un admin réinitialise le mot de passe du client', async () => {
    const clientCookie = await cookieFor(ownerId)
    await request(app).get('/api/auth/me').set('Cookie', clientCookie).expect(200)

    await request(app)
      .patch(`/api/admin/clients/${ownerId}`)
      .set('Cookie', await cookieFor(adminId))
      .send({ password: 'nouveau-mot-de-passe' })
      .expect(200)

    await request(app).get('/api/auth/me').set('Cookie', clientCookie).expect(401)
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@example.test', password: 'nouveau-mot-de-passe' })
      .expect(200)
  })

  it('révoque la session au logout', async () => {
    const clientCookie = await cookieFor(ownerId)
    await request(app).post('/api/auth/logout').set('Cookie', clientCookie).expect(204)
    await request(app).get('/api/auth/me').set('Cookie', clientCookie).expect(401)
  })
})

/**
 * Le transfert du fichier lui-même n'est pas asserté : `res.download` s'appuie
 * sur `send`, qui refuse tout chemin absolu contenant un segment commençant par
 * un point (un worktree sous `.claude/` suffit à le déclencher). On vérifie donc
 * la décision d'autorisation, matérialisée par le tampon `downloadedAt` posé
 * juste après le contrôle d'accès.
 */
async function downloadAllowed(userId: string): Promise<boolean> {
  await Document.findByIdAndUpdate(documentId, { downloadedAt: null })
  const response = await request(app)
    .get(`/api/documents/${documentId}/download`)
    .set('Cookie', await cookieFor(userId))
  expect(response.status).not.toBe(401)
  const document = await Document.findById(documentId).select('downloadedAt').lean()
  const allowed = Boolean(document?.downloadedAt)
  if (!allowed) expect(response.status).toBe(403)
  return allowed
}

describe('téléchargement de documents depuis l’espace client', () => {
  it('autorise le propriétaire du projet', async () => {
    expect(await downloadAllowed(ownerId)).toBe(true)
  })

  it('autorise un collaborateur invité, qui voit déjà le document dans la liste projet', async () => {
    expect(await downloadAllowed(viewerId)).toBe(true)
  })

  it('refuse un client sans accès au projet', async () => {
    expect(await downloadAllowed(outsiderId)).toBe(false)
  })

  it('refuse une session non admin et non client', async () => {
    expect(await downloadAllowed(agentId)).toBe(false)
  })

  it('autorise un admin', async () => {
    expect(await downloadAllowed(adminId)).toBe(true)
  })

  it('exige une session', async () => {
    await request(app).get(`/api/documents/${documentId}/download`).expect(401)
  })
})
