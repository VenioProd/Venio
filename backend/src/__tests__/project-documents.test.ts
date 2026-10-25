import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import Project from '../models/Project.js'
import ProjectItem from '../models/ProjectItem.js'
import ProjectSection from '../models/ProjectSection.js'
import User from '../models/User.js'
import SyncTombstone from '../models/SyncTombstone.js'
import { createNotification } from '../lib/notifications.js'
import { triggerAutomations } from '../automation/trigger.js'

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    return next()
  },
}))
vi.mock('../lib/notifications.js', () => ({ createNotification: vi.fn().mockResolvedValue(null) }))
vi.mock('../automation/trigger.js', () => ({ triggerAutomations: vi.fn() }))

const uploadDir = path.join(process.cwd(), 'uploads', 'items')
const files = () => (fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [])
let initialFiles: Set<string>
let app: Express
let projectId: string
let userId: string

const newFiles = () => files().filter((name) => !initialFiles.has(name))
const post = (key?: string, content = 'scan PDF') => {
  const req = request(app).post(`/api/admin/projects/${projectId}/items`)
  if (key) req.set('Idempotency-Key', key)
  return req
    .field('type', 'AUTRE')
    .field('title', 'Scan interne')
    .attach('file', Buffer.from(content), { filename: 'scan.pdf', contentType: 'application/pdf' })
}

beforeAll(async () => {
  await setupMongo()
  await ProjectItem.init()
  const { default: itemRoutes } = await import('../routes/admin/projects/items.js')
  const { default: syncRoutes } = await import('../routes/mobile/sync.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/projects', itemRoutes)
  app.use('/api/mobile/sync', syncRoutes)
})

beforeEach(async () => {
  await clearDb()
  vi.clearAllMocks()
  initialFiles = new Set(files())
  const [commercial, client] = await User.create([
    {
      email: 'commercial@test.local',
      name: 'Commercial',
      role: 'COMMERCIAL',
      passwordHash: 'x',
      twoFactorEnabled: true,
    },
    { email: 'client@test.local', name: 'Client', role: 'CLIENT', passwordHash: 'x' },
  ])
  userId = String(commercial!._id)
  authState.user = { id: userId, role: 'COMMERCIAL', email: commercial!.email, name: commercial!.name }
  const project = await Project.create({ name: 'Projet documents', client: client!._id, assignedTo: userId })
  projectId = String(project._id)
})

afterEach(() => {
  for (const name of newFiles()) fs.rmSync(path.join(uploadDir, name), { force: true })
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

describe('documents de projet des commerciaux', () => {
  it('refuse un projet hors périmètre avant de recevoir le fichier', async () => {
    await Project.updateOne({ _id: projectId }, { assignedTo: new mongoose.Types.ObjectId() })
    const response = await post()
    expect(response.status).toBe(403)
    expect(response.body.code).toBe('PROJECT_OUT_OF_SCOPE')
    expect(await ProjectItem.countDocuments()).toBe(0)
    expect(newFiles()).toEqual([])
  })

  it('crée un document interne sans notification et interdit sa publication', async () => {
    const created = await post()
    expect(created.status).toBe(201)
    expect(created.body.item.isVisible).toBe(false)
    expect(createNotification).not.toHaveBeenCalled()
    expect(triggerAutomations).not.toHaveBeenCalled()
    const rejected = await request(app)
      .post(`/api/admin/projects/${projectId}/items`)
      .field('type', 'AUTRE')
      .field('title', 'Titre confidentiel')
      .field('isVisible', 'true')
      .attach('file', Buffer.from('autre scan'), { filename: 'secret.pdf', contentType: 'application/pdf' })
    expect(rejected.status).toBe(403)
    expect(rejected.body.code).toBe('VISIBILITY_FORBIDDEN')
    const patched = await request(app)
      .patch(`/api/admin/projects/${projectId}/items/${created.body.item._id}`)
      .field('isVisible', 'true')
      .attach('file', Buffer.from('remplacement'), { filename: 'secret.pdf', contentType: 'application/pdf' })
    expect(patched.status).toBe(403)
    expect(patched.body.code).toBe('VISIBILITY_FORBIDDEN')
    expect((await ProjectItem.findById(created.body.item._id))!.isVisible).toBe(false)
    expect(await ProjectItem.countDocuments()).toBe(1)
    expect(newFiles()).toHaveLength(1)
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('rejoue le même upload sans doublon et refuse un autre fichier avec la même clé', async () => {
    const key = randomUUID()
    const created = await post(key)
    const replayed = await post(key)
    expect(created.status).toBe(201)
    expect(replayed.status).toBe(200)
    expect(replayed.body.item._id).toBe(created.body.item._id)
    expect(replayed.body.item).not.toHaveProperty('clientRequestHash')
    expect(created.body.item).not.toHaveProperty('clientRequestId')
    const conflict = await post(key, 'scan différent')
    expect(conflict.status).toBe(409)
    expect(conflict.body.code).toBe('IDEMPOTENCY_CONFLICT')
    expect(await ProjectItem.countDocuments()).toBe(1)
    expect(newFiles()).toHaveLength(1)
  })

  it('synchronise les métadonnées du fichier puis sa suppression', async () => {
    const created = await post(randomUUID())
    expect(created.status).toBe(201)
    const itemId = created.body.item._id
    await ProjectItem.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(itemId) },
      {
        $set: { updatedAt: new Date(Date.now() - 5000) },
      },
    )
    const synced = await request(app).get('/api/mobile/sync/projectDocuments')
    expect(synced.status).toBe(200)
    expect(synced.body.items).toHaveLength(1)
    expect(synced.body.items[0]).toEqual({
      _id: itemId,
      project: projectId,
      section: null,
      type: 'AUTRE',
      title: 'Scan interne',
      description: '',
      file: { originalName: 'scan.pdf', mimeType: 'application/pdf', size: Buffer.byteLength('scan PDF') },
      isVisible: false,
      createdBy: { _id: userId, name: 'Commercial' },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      downloadUrl: `/api/admin/projects/${projectId}/items/${itemId}/download`,
    })
    expect(JSON.stringify(synced.body)).not.toMatch(/storagePath|clientRequestId|clientRequestHash/)
    expect(synced.body.nextCursor).toEqual(expect.any(String))
    const delta = await request(app).get('/api/mobile/sync/projectDocuments').query({ cursor: synced.body.nextCursor })
    expect(delta.status).toBe(200)
    expect(delta.body.items).toEqual([])
    const deleted = await request(app).delete(`/api/admin/projects/${projectId}/items/${itemId}`)
    expect(deleted.status).toBe(200)
    expect(newFiles()).toEqual([])
    await SyncTombstone.collection.updateMany({}, { $set: { deletedAt: new Date(Date.now() - 5000) } })
    const deletions = await request(app).get('/api/mobile/sync/deletions')
    expect(deletions.status).toBe(200)
    expect(deletions.body.items).toEqual([
      expect.objectContaining({ entityType: 'projectDocuments', entityId: itemId }),
    ])
  })

  it('refuse un remplacement si le document est publié pendant l’envoi, et une section d’un autre projet', async () => {
    const created = await post()
    const itemId = created.body.item._id
    const other = await Project.create({ name: 'Autre', client: new mongoose.Types.ObjectId() })
    const foreign = await ProjectSection.create({ project: other._id, title: 'Section étrangère', createdBy: userId })
    const own = await ProjectSection.create({ project: projectId, title: 'Pièces', createdBy: userId })
    const patch = (section: unknown) =>
      request(app)
        .patch(`/api/admin/projects/${projectId}/items/${itemId}`)
        .field('section', String(section))
        .attach('file', Buffer.from('nouvelle version'), { filename: 'v2.pdf', contentType: 'application/pdf' })
    expect((await patch(foreign._id)).body.code).toBe('INVALID_SECTION')
    const exists = ProjectSection.exists.bind(ProjectSection)
    // Un éditeur publie le document entre le contrôle d'accès et l'enregistrement.
    vi.spyOn(ProjectSection, 'exists').mockImplementationOnce(((filter: Parameters<typeof exists>[0]) =>
      ProjectItem.updateOne({ _id: itemId }, { isVisible: true }).then(() => exists(filter))) as never)
    const raced = await patch(own._id)
    expect(raced.status).toBe(403)
    expect(raced.body.code).toBe('DOCUMENT_WRITE_FORBIDDEN')
    const item = await ProjectItem.findById(itemId)
    expect(item!.file!.originalName).toBe('scan.pdf')
    expect(item!.section).toBeNull()
    expect(newFiles()).toHaveLength(1)
  })

  it('réserve aux éditeurs les éléments sans fichier et leur laisse nettoyer un projet supprimé', async () => {
    const note = await ProjectItem.create({
      project: projectId,
      type: 'AUTRE',
      title: 'Spécification',
      content: 'texte',
      isVisible: false,
      createdBy: userId,
    })
    const denied = await request(app).delete(`/api/admin/projects/${projectId}/items/${note._id}`)
    expect(denied.body.code).toBe('DOCUMENT_WRITE_FORBIDDEN')
    await Project.deleteOne({ _id: projectId })
    await User.updateOne({ _id: userId }, { role: 'ADMIN' })
    authState.user = { ...authState.user!, role: 'ADMIN' }
    await request(app).delete(`/api/admin/projects/${projectId}/items/${note._id}`).expect(200)
    expect(await ProjectItem.countDocuments()).toBe(0)
  })
})
