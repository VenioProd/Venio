import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientPhaseRoutes from '../routes/client/projectPhases.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'
import ProjectItem from '../models/ProjectItem.js'
import ProjectPhase from '../models/ProjectPhase.js'
import ActivityLog from '../models/ActivityLog.js'
import Notification from '../models/Notification.js'

let app: Express
let ownerId: string
let editorId: string
let viewerId: string
let outsiderId: string
let adminId: string
let superAdminId: string
let inactiveAdminId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function createPhase(overrides: Record<string, unknown> = {}) {
  return ProjectPhase.create({
    project: projectId,
    title: 'Maquettes',
    createdBy: adminId,
    requiresClientValidation: true,
    status: 'EN_ATTENTE_VALIDATION',
    ...overrides,
  })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/projects', clientPhaseRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  // Le responsable du projet n'est volontairement PAS super-admin : c'est ce qui
  // permet de distinguer les deux catégories de destinataires exigées par la spec.
  const [owner, editor, viewer, outsider, admin, superAdmin, inactiveAdmin] = await User.create([
    { name: 'Claire Corbel', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Éditeur', email: 'editor@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Lecteur', email: 'viewer@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Étranger', email: 'outsider@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Responsable', email: 'admin@example.test', passwordHash, role: 'ADMIN' },
    { name: 'Super admin', email: 'superadmin@example.test', passwordHash, role: 'SUPER_ADMIN' },
    {
      name: 'Super admin parti',
      email: 'inactif@example.test',
      passwordHash,
      role: 'SUPER_ADMIN',
      isActive: false,
    },
  ])
  ownerId = String(owner._id)
  editorId = String(editor._id)
  viewerId = String(viewer._id)
  outsiderId = String(outsider._id)
  adminId = String(admin._id)
  superAdminId = String(superAdmin._id)
  inactiveAdminId = String(inactiveAdmin._id)
  const project = await Project.create({ name: 'Site', client: owner._id, assignedTo: admin._id })
  projectId = String(project._id)
  await ProjectMember.create([
    { project: project._id, user: editor._id, role: 'EDITOR', createdBy: owner._id },
    { project: project._id, user: viewer._id, role: 'VIEWER', createdBy: owner._id },
  ])
})

describe('lecture des étapes côté client', () => {
  it('trie par ordre et masque les données internes', async () => {
    const visible = await ProjectItem.create({
      project: projectId,
      type: 'MAQUETTE',
      title: 'Maquettes desktop',
      createdBy: adminId,
      file: { originalName: 'maq.pdf', storagePath: '/srv/uploads/maq.pdf', mimeType: 'application/pdf', size: 10 },
    })
    const hidden = await ProjectItem.create({
      project: projectId,
      type: 'NOTE',
      title: 'Note interne',
      createdBy: adminId,
      isVisible: false,
    })
    await createPhase({ title: 'Développement', order: 1, status: 'A_VENIR' })
    const phase = await createPhase({ order: 0, linkedItems: [visible._id, hidden._id] })
    phase.revisionRequests.push({
      requestedBy: ownerId,
      requestedByName: 'Claire Corbel',
      comment: 'Header trop dense',
    } as never)
    await phase.save()

    const response = await request(app)
      .get(`/api/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(viewerId))
      .expect(200)

    const [first] = response.body.phases
    expect(response.body.phases.map((p: { title: string }) => p.title)).toEqual(['Maquettes', 'Développement'])
    expect(first.createdBy).toBeUndefined()
    expect(first.linkedItems).toHaveLength(1)
    expect(first.linkedItems[0].title).toBe('Maquettes desktop')
    expect(first.linkedItems[0].file?.storagePath).toBeUndefined()
    expect(first.revisionRequests[0].comment).toBe('Header trop dense')
    expect(first.revisionRequests[0].requestedByName).toBe('Claire Corbel')
    expect(first.revisionRequests[0].requestedBy).toBeUndefined()
  })

  it('renvoie 404 à un client sans accès au projet', async () => {
    await createPhase()
    await request(app)
      .get(`/api/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(outsiderId))
      .expect(404)
  })

  it('renvoie 403 à un compte non client', async () => {
    await request(app)
      .get(`/api/projects/${projectId}/phases`)
      .set('Cookie', await cookieFor(adminId))
      .expect(403)
  })
})

describe('validation nominative', () => {
  it('horodate la validation du propriétaire, termine l’étape et notifie les admins', async () => {
    const phase = await createPhase()

    const response = await request(app)
      .post(`/api/projects/${projectId}/phases/${phase._id}/validate`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ comment: 'Parfait' })
      .expect(200)

    expect(response.body.phase.status).toBe('TERMINEE')
    expect(response.body.phase.validation.validatedByName).toBe('Claire Corbel')
    expect(response.body.phase.validation.validatedAt).not.toBeNull()
    expect(response.body.phase.validation.comment).toBe('Parfait')
    expect(response.body.phase.validation.validatedBy).toBeUndefined()

    const stored = await ProjectPhase.findById(phase._id)
    expect(String(stored!.validation.validatedBy)).toBe(ownerId)

    const notifications = await Notification.find({ type: 'PHASE_VALIDATED' })
    expect(notifications.map((n) => String(n.recipient)).sort()).toEqual([adminId, superAdminId].sort())
    expect(notifications.map((n) => String(n.recipient))).not.toContain(inactiveAdminId)
    expect(notifications[0].link).toBe(`/admin/projets/${projectId}?tab=phases`)
    expect(notifications[0].metadata).toMatchObject({ projectId, phaseId: String(phase._id) })

    const log = await ActivityLog.findOne({ project: projectId, action: 'PHASE_VALIDATED' })
    expect(log!.summary).toContain('Claire Corbel')
  })

  it('refuse 403 OWNER_REQUIRED un EDITOR et un VIEWER', async () => {
    const phase = await createPhase()
    for (const userId of [editorId, viewerId]) {
      const response = await request(app)
        .post(`/api/projects/${projectId}/phases/${phase._id}/validate`)
        .set('Cookie', await cookieFor(userId))
        .expect(403)
      expect(response.body.code).toBe('OWNER_REQUIRED')
    }
  })

  it('refuse 409 INVALID_TRANSITION hors attente de validation', async () => {
    const phase = await createPhase({ status: 'EN_COURS' })
    const response = await request(app)
      .post(`/api/projects/${projectId}/phases/${phase._id}/validate`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(409)
    expect(response.body.code).toBe('INVALID_TRANSITION')
  })
})

describe('demandes de retouches', () => {
  it('exige un commentaire non vide', async () => {
    const phase = await createPhase()
    for (const body of [{}, { comment: '   ' }]) {
      const response = await request(app)
        .post(`/api/projects/${projectId}/phases/${phase._id}/revisions`)
        .set('Cookie', await cookieFor(ownerId))
        .send(body)
        .expect(422)
      expect(response.body.code).toBe('COMMENT_REQUIRED')
    }
  })

  it('enregistre la demande, repasse l’étape en cours et notifie les admins', async () => {
    const phase = await createPhase()

    const response = await request(app)
      .post(`/api/projects/${projectId}/phases/${phase._id}/revisions`)
      .set('Cookie', await cookieFor(editorId))
      .send({ comment: 'Le header est trop dense' })
      .expect(200)

    expect(response.body.phase.status).toBe('EN_COURS')
    expect(response.body.phase.revisionRequests).toHaveLength(1)
    expect(response.body.phase.revisionRequests[0].requestedByName).toBe('Éditeur')
    expect(response.body.phase.revisionRequests[0].resolvedAt).toBeNull()

    const notifications = await Notification.find({ type: 'PHASE_REVISION_REQUESTED' })
    expect(notifications.map((n) => String(n.recipient)).sort()).toEqual([adminId, superAdminId].sort())
    expect(notifications.map((n) => String(n.recipient))).not.toContain(inactiveAdminId)
    expect(notifications[0].link).toBe(`/admin/projets/${projectId}?tab=phases`)
    expect(notifications[0].metadata).toMatchObject({ projectId, phaseId: String(phase._id) })
    expect(await ActivityLog.countDocuments({ project: projectId, action: 'PHASE_REVISION_REQUESTED' })).toBe(1)
  })

  it('refuse 403 un VIEWER', async () => {
    const phase = await createPhase()
    await request(app)
      .post(`/api/projects/${projectId}/phases/${phase._id}/revisions`)
      .set('Cookie', await cookieFor(viewerId))
      .send({ comment: 'Trop dense' })
      .expect(403)
  })
})
