import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type Express } from 'express'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import clientChangeRequestRoutes from '../routes/client/changeRequests.js'
import ChangeRequest from '../models/ChangeRequest.js'
import Notification from '../models/Notification.js'
import User from '../models/User.js'
import Project from '../models/Project.js'
import ProjectMember from '../models/ProjectMember.js'

let app: Express
let ownerId: string
let collaboratorId: string
let outsiderId: string
let projectId: string

async function cookieFor(userId: string): Promise<string> {
  const { token } = await createSession(userId)
  return `venio_session=${token}`
}

async function seedRequest(overrides: Record<string, unknown> = {}) {
  return ChangeRequest.create({
    client: ownerId,
    title: 'Nouvelle page « Ateliers »',
    description: 'Présenter le calendrier des ateliers.',
    createdBy: ownerId,
    createdByName: 'Owner',
    ...overrides,
  })
}

beforeAll(async () => {
  await setupMongo()
  app = express()
  app.use(express.json())
  app.use('/api/client/change-requests', clientChangeRequestRoutes)
})

afterAll(teardownMongo)

beforeEach(async () => {
  await clearDb()
  const passwordHash = await bcrypt.hash('test', 4)
  const [owner, collaborator, outsider] = await User.create([
    { name: 'Owner', email: 'owner@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Collab', email: 'collab@example.test', passwordHash, role: 'CLIENT' },
    { name: 'Outsider', email: 'outsider@example.test', passwordHash, role: 'CLIENT' },
  ])
  ownerId = String(owner._id)
  collaboratorId = String(collaborator._id)
  outsiderId = String(outsider._id)
  const project = await Project.create({ name: 'Refonte du site', client: owner._id })
  projectId = String(project._id)
  await ProjectMember.create({ project: project._id, user: collaborator._id, role: 'EDITOR', createdBy: owner._id })
  await User.create({ name: 'Raphael', email: 'admin@example.test', passwordHash, role: 'SUPER_ADMIN', isActive: true })
})

describe('création d’une demande', () => {
  it('crée une demande hors projet et notifie les super admins', async () => {
    const response = await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(ownerId))
      .field('title', 'Mettre à jour les horaires')
      .field('description', 'Nous ouvrons désormais le lundi.')
      .field('priority', 'HAUTE')
      .expect(201)

    expect(response.body.changeRequest.status).toBe('SOUMISE')
    expect(response.body.changeRequest.project).toBeNull()
    expect(response.body.changeRequest.priority).toBe('HAUTE')
    expect(response.body.changeRequest.statusHistory).toHaveLength(1)
    expect(response.body.changeRequest.statusHistory[0].status).toBe('SOUMISE')
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_CREATED' })).toBe(1)
  })

  it('rattache la demande au compte propriétaire quand un collaborateur la crée', async () => {
    const response = await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(collaboratorId))
      .field('title', 'Corriger le menu mobile')
      .field('description', 'Le menu se replie mal sur iPhone.')
      .field('projectId', projectId)
      .expect(201)

    expect(String(response.body.changeRequest.client)).toBe(ownerId)
    expect(String(response.body.changeRequest.createdBy)).toBe(collaboratorId)
    expect(String(response.body.changeRequest.project)).toBe(projectId)
  })

  it('exige un titre et une description', async () => {
    const cookie = await cookieFor(ownerId)
    await request(app).post('/api/client/change-requests').set('Cookie', cookie).field('description', 'x').expect(400)
    await request(app).post('/api/client/change-requests').set('Cookie', cookie).field('title', 'x').expect(400)
  })

  it('refuse une URL de page qui n’est pas http(s)', async () => {
    await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(ownerId))
      .field('title', 'Corriger la page tarifs')
      .field('description', 'Trois formules au lieu des tarifs à la ligne.')
      .field('pageUrl', 'javascript:alert(1)')
      .expect(400)
  })

  it('renvoie 404 pour un projet auquel l’utilisateur n’a pas accès', async () => {
    await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(outsiderId))
      .field('title', 'Intrusion')
      .field('description', 'Tentative.')
      .field('projectId', projectId)
      .expect(404)
  })

  it('exige une session CLIENT', async () => {
    await request(app).get('/api/client/change-requests').expect(401)
  })
})

describe('visibilité', () => {
  it('liste les demandes du compte et filtre par statut', async () => {
    await seedRequest({ title: 'Active' })
    await seedRequest({ title: 'Terminée', status: 'VALIDEE' })

    const all = await request(app)
      .get('/api/client/change-requests')
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)
    expect(all.body.changeRequests).toHaveLength(2)

    const filtered = await request(app)
      .get('/api/client/change-requests?status=VALIDEE')
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)
    expect(filtered.body.changeRequests).toHaveLength(1)
    expect(filtered.body.changeRequests[0].title).toBe('Terminée')
  })

  it('rejette un identifiant mal formé en 400, sans erreur serveur', async () => {
    const cookie = await cookieFor(ownerId)
    for (const path of [
      '/api/client/change-requests/pas-un-objectid',
      '/api/client/change-requests/pas-un-objectid/validate',
    ]) {
      const response = await request(app).get(path).set('Cookie', cookie)
      if (response.status !== 404) expect(response.status).toBe(400)
    }
    await request(app).post('/api/client/change-requests/pas-un-objectid/validate').set('Cookie', cookie).expect(400)
    await request(app)
      .post('/api/client/change-requests/pas-un-objectid/reply')
      .set('Cookie', cookie)
      .field('message', 'Bonjour')
      .expect(400)
  })

  it('masque à un autre client la liste, le détail et interdit toute action', async () => {
    const created = await seedRequest()
    const cookie = await cookieFor(outsiderId)

    const list = await request(app).get('/api/client/change-requests').set('Cookie', cookie).expect(200)
    expect(list.body.changeRequests).toHaveLength(0)

    const detail = await request(app)
      .get(`/api/client/change-requests/${created._id}`)
      .set('Cookie', cookie)
      .expect(404)
    expect(detail.body.error).toBeDefined()

    await request(app)
      .post(`/api/client/change-requests/${created._id}/reply`)
      .set('Cookie', cookie)
      .field('message', 'Bonjour')
      .expect(404)
  })

  it('montre au collaborateur ses propres demandes, pas celles du compte qu’il n’a pas créées', async () => {
    const byOwner = await seedRequest({ title: 'Créée par le compte' })
    const byCollaborator = await seedRequest({
      title: 'Créée par le collaborateur',
      project: projectId,
      createdBy: collaboratorId,
      createdByName: 'Collab',
    })
    const cookie = await cookieFor(collaboratorId)

    const list = await request(app).get('/api/client/change-requests').set('Cookie', cookie).expect(200)
    expect(list.body.changeRequests.map((r: { title: string }) => r.title)).toEqual(['Créée par le collaborateur'])

    await request(app).get(`/api/client/change-requests/${byCollaborator._id}`).set('Cookie', cookie).expect(200)
    await request(app).get(`/api/client/change-requests/${byOwner._id}`).set('Cookie', cookie).expect(404)
  })
})

describe('fil de discussion et actions client', () => {
  it('ajoute une réponse sans changer le statut, même sur un état terminal', async () => {
    const created = await seedRequest({ status: 'REFUSEE', refusalReason: 'Hors périmètre' })

    const response = await request(app)
      .post(`/api/client/change-requests/${created._id}/reply`)
      .set('Cookie', await cookieFor(ownerId))
      .field('message', 'Merci pour l’explication.')
      .expect(200)

    expect(response.body.changeRequest.replies).toHaveLength(1)
    expect(response.body.changeRequest.replies[0].message).toBe('Merci pour l’explication.')
    expect(response.body.changeRequest.status).toBe('REFUSEE')
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_REPLY' })).toBe(1)
  })

  it('refuse une réponse vide', async () => {
    const created = await seedRequest()
    await request(app)
      .post(`/api/client/change-requests/${created._id}/reply`)
      .set('Cookie', await cookieFor(ownerId))
      .field('message', '   ')
      .expect(400)
  })

  it('valide une livraison — compte uniquement', async () => {
    // Le collaborateur est ici l'AUTEUR : il voit donc la demande (sinon il
    // recevrait 404 au titre de la visibilité, jamais 403).
    const created = await seedRequest({
      status: 'LIVREE',
      project: projectId,
      deliveredAt: new Date(),
      createdBy: collaboratorId,
      createdByName: 'Collab',
    })

    await request(app)
      .post(`/api/client/change-requests/${created._id}/validate`)
      .set('Cookie', await cookieFor(collaboratorId))
      .expect(403)
      .expect((res) => expect(res.body.code).toBe('OWNER_REQUIRED'))

    const response = await request(app)
      .post(`/api/client/change-requests/${created._id}/validate`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    expect(response.body.changeRequest.status).toBe('VALIDEE')
    expect(response.body.changeRequest.validatedAt).not.toBeNull()
  })

  it('refuse de valider hors du statut LIVREE', async () => {
    const created = await seedRequest({ status: 'EN_COURS' })
    const response = await request(app)
      .post(`/api/client/change-requests/${created._id}/validate`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(409)

    expect(response.body.code).toBe('INVALID_TRANSITION')
  })

  it('demande une correction : LIVREE → EN_COURS avec commentaire au fil et à l’historique', async () => {
    const created = await seedRequest({ status: 'LIVREE', deliveredAt: new Date() })

    const response = await request(app)
      .post(`/api/client/change-requests/${created._id}/request-correction`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ comment: 'Le bouton renvoie vers la mauvaise page.' })
      .expect(200)

    expect(response.body.changeRequest.status).toBe('EN_COURS')
    expect(response.body.changeRequest.replies).toHaveLength(1)
    const history = response.body.changeRequest.statusHistory
    expect(history[history.length - 1].note).toBe('Le bouton renvoie vers la mauvaise page.')
    expect(await Notification.countDocuments({ type: 'CHANGE_REQUEST_REPLY' })).toBe(1)
  })

  // Transition et message doivent tomber ensemble : un échec entre les deux
  // laisserait une demande EN_COURS sans commentaire, que le client ne pourrait
  // plus rejouer (elle n'est plus LIVREE).
  it('écrit la correction en une seule opération, sans demi-état', async () => {
    const created = await seedRequest({ status: 'LIVREE', deliveredAt: new Date() })
    const saveSpy = vi.spyOn(ChangeRequest.prototype, 'save')

    await request(app)
      .post(`/api/client/change-requests/${created._id}/request-correction`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ comment: 'Le bouton renvoie vers la mauvaise page.' })
      .expect(200)

    expect(saveSpy, 'la correction ne doit pas nécessiter une seconde écriture').not.toHaveBeenCalled()
    saveSpy.mockRestore()

    const stored = await ChangeRequest.findById(created._id)
    expect(stored!.status).toBe('EN_COURS')
    expect(stored!.replies).toHaveLength(1)
    expect(stored!.statusHistory.at(-1)!.note).toBe('Le bouton renvoie vers la mauvaise page.')
  })

  it('refuse une demande de correction sans commentaire', async () => {
    const created = await seedRequest({ status: 'LIVREE' })
    await request(app)
      .post(`/api/client/change-requests/${created._id}/request-correction`)
      .set('Cookie', await cookieFor(ownerId))
      .send({ comment: '  ' })
      .expect(400)
  })
})

describe('pièces jointes', () => {
  it('persiste les fichiers et ne les sert qu’au demandeur', async () => {
    const created = await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(ownerId))
      .field('title', 'Galerie photos')
      .field('description', 'Ajouter une galerie sur l’accueil.')
      .attach('files', Buffer.from('contenu'), 'plan de page.png')
      .expect(201)

    const attachment = created.body.changeRequest.attachments[0]
    expect(attachment.originalName).toBe('plan de page.png')
    // safeName : les espaces deviennent des underscores.
    expect(attachment.filename).toMatch(/^\d+-plan_de_page\.png$/)
    expect(fs.existsSync(path.resolve('uploads/change-requests', attachment.filename))).toBe(true)

    await request(app)
      .get(`/api/client/change-requests/files/${attachment.filename}`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    await request(app)
      .get(`/api/client/change-requests/files/${attachment.filename}`)
      .set('Cookie', await cookieFor(outsiderId))
      .expect(404)
  })

  // Le mimetype vient du multipart, donc de l'uploadeur : le réémettre tel
  // quel en `inline` permettrait à un client d'exécuter du script sur
  // l'origine Venio dans la session de l'admin qui ouvre la pièce jointe.
  it('sert toute pièce jointe en téléchargement opaque, jamais en rendu inline', async () => {
    const created = await request(app)
      .post('/api/client/change-requests')
      .set('Cookie', await cookieFor(ownerId))
      .field('title', 'Capture')
      .field('description', 'Voir le rendu.')
      .attach('files', Buffer.from('<script>alert(1)</script>'), {
        filename: 'preuve.html',
        contentType: 'text/html',
      })
      .expect(201)

    const attachment = created.body.changeRequest.attachments[0]
    const response = await request(app)
      .get(`/api/client/change-requests/files/${attachment.filename}`)
      .set('Cookie', await cookieFor(ownerId))
      .expect(200)

    expect(response.headers['content-type']).toBe('application/octet-stream')
    expect(response.headers['content-disposition']).toMatch(/^attachment;/)
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })

  it('refuse un nom de fichier qui sort du répertoire', async () => {
    await request(app)
      .get('/api/client/change-requests/files/..%2F..%2Fpackage.json')
      .set('Cookie', await cookieFor(ownerId))
      .expect((res) => expect([403, 404]).toContain(res.status))
  })
})
