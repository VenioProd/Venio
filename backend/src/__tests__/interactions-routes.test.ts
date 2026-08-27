import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))
const mailState = vi.hoisted(() => ({
  sendMail: null as null | ((options: { to: string }) => Promise<unknown>),
}))

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))

vi.mock('../lib/email/transport.js', async () => {
  const actual = await vi.importActual<typeof import('../lib/email/transport.js')>('../lib/email/transport.js')
  return {
    ...actual,
    getTransporter: () => (mailState.sendMail ? { sendMail: mailState.sendMail } : null),
  }
})

let app: Express
let superAdminId: mongoose.Types.ObjectId
let commercialId: mongoose.Types.ObjectId
let otherAdminId: mongoose.Types.ObjectId
let leadId: mongoose.Types.ObjectId
let clientId: mongoose.Types.ObjectId

function actAs(id: mongoose.Types.ObjectId, role: NonNullable<Request['user']>['role']) {
  authState.user = { id: id.toString(), role, email: `${role}@test.local`, name: role }
}

beforeAll(async () => {
  await setupMongo()
  const { default: interactionRoutes } = await import('../routes/admin/interactions.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/interactions', interactionRoutes)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  mailState.sendMail = async () => ({})
  const { default: User } = await import('../models/User.js')
  const { default: Lead } = await import('../models/Lead.js')

  const [superAdmin, commercial, otherAdmin] = await User.create([
    { email: 'super@test.local', name: 'Super', role: 'SUPER_ADMIN', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'com@test.local', name: 'Com', role: 'COMMERCIAL', passwordHash: 'x', twoFactorEnabled: true },
    { email: 'admin2@test.local', name: 'Admin2', role: 'ADMIN', passwordHash: 'x', twoFactorEnabled: true },
  ])
  superAdminId = superAdmin._id as mongoose.Types.ObjectId
  commercialId = commercial._id as mongoose.Types.ObjectId
  otherAdminId = otherAdmin._id as mongoose.Types.ObjectId

  const lead = await Lead.create({ company: 'Acme', contactEmail: 'contact@acme.fr', assignedTo: commercialId })
  leadId = lead._id as mongoose.Types.ObjectId

  const client = await User.create({
    email: 'client@acme.fr',
    name: 'Acme SAS',
    companyName: 'Acme SAS',
    role: 'CLIENT',
    passwordHash: 'x',
    ownerAdminId: otherAdminId,
  })
  clientId = client._id as mongoose.Types.ObjectId
})

describe('Consigner un échange', () => {
  it('journalise un appel sur un lead', async () => {
    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}`)
      .send({ kind: 'CALL', direction: 'OUT', body: 'Rappelé, budget confirmé' })
      .expect(201)

    expect(response.body.interaction.kind).toBe('CALL')
    expect(response.body.interaction.author).toBe(commercialId.toString())
  })

  it("accepte une date d'échange antérieure à la saisie", async () => {
    actAs(commercialId, 'COMMERCIAL')
    const occurredAt = '2026-08-20T10:00:00.000Z'
    const response = await request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}`)
      .send({ kind: 'MEETING', body: 'RDV agence', occurredAt })
      .expect(201)

    expect(new Date(response.body.interaction.occurredAt).toISOString()).toBe(occurredAt)
  })

  it('refuse un type inconnu, un contenu vide et une date invalide', async () => {
    actAs(commercialId, 'COMMERCIAL')
    const base = `/api/admin/interactions/LEAD/${leadId}`
    await request(app).post(base).send({ kind: 'PIGEON', body: 'x' }).expect(400)
    await request(app).post(base).send({ kind: 'CALL', body: '   ' }).expect(400)
    await request(app).post(base).send({ kind: 'CALL', body: 'x', occurredAt: 'hier' }).expect(400)
  })

  it("refuse de journaliser un email sortant hors de la route d'envoi", async () => {
    actAs(commercialId, 'COMMERCIAL')
    await request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}`)
      .send({ kind: 'EMAIL', direction: 'OUT', subject: 'Faux', body: 'x' })
      .expect(400)
  })

  it('accepte en revanche un email entrant, saisi à la main', async () => {
    actAs(commercialId, 'COMMERCIAL')
    await request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}`)
      .send({ kind: 'EMAIL', direction: 'IN', subject: 'Sa réponse', body: 'Ok pour moi' })
      .expect(201)
  })
})

describe("Contrôle d'accès", () => {
  it('refuse un lead hors du périmètre du commercial', async () => {
    const { default: Lead } = await import('../models/Lead.js')
    const foreign = await Lead.create({ company: 'Ailleurs', assignedTo: otherAdminId })
    actAs(commercialId, 'COMMERCIAL')
    await request(app).post(`/api/admin/interactions/LEAD/${foreign._id}`).send({ kind: 'CALL', body: 'x' }).expect(404)
  })

  it("refuse un client à qui n'a pas la permission clients", async () => {
    // COMPTABLE est admin mais n'a pas MANAGE_CLIENTS : refus de permission,
    // distinct du 404 de périmètre testé juste après.
    const { default: User } = await import('../models/User.js')
    const accountant = await User.create({
      email: 'compta@test.local',
      name: 'Compta',
      role: 'COMPTABLE',
      passwordHash: 'x',
      twoFactorEnabled: true,
    })
    actAs(accountant._id as mongoose.Types.ObjectId, 'COMPTABLE')
    await request(app).post(`/api/admin/interactions/CLIENT/${clientId}`).send({ kind: 'NOTE', body: 'x' }).expect(403)
  })

  it('refuse un client hors du périmètre de son propriétaire', async () => {
    // COMMERCIAL a bien MANAGE_CLIENTS : c'est le périmètre qui bloque, en 404.
    actAs(commercialId, 'COMMERCIAL')
    await request(app).post(`/api/admin/interactions/CLIENT/${clientId}`).send({ kind: 'NOTE', body: 'x' }).expect(404)
  })

  it("cache le client d'un autre admin derrière un 404", async () => {
    const { default: User } = await import('../models/User.js')
    await User.findByIdAndUpdate(otherAdminId, { grantedPermissions: [] })
    actAs(superAdminId, 'SUPER_ADMIN')
    await request(app)
      .post(`/api/admin/interactions/CLIENT/${clientId}`)
      .send({ kind: 'NOTE', body: 'vu par le super admin' })
      .expect(201)

    // Un ADMIN qui n'est pas le owner du client ne doit pas le voir.
    const { default: UserModel } = await import('../models/User.js')
    const stranger = await UserModel.create({
      email: 'stranger@test.local',
      name: 'Stranger',
      role: 'ADMIN',
      passwordHash: 'x',
      twoFactorEnabled: true,
    })
    actAs(stranger._id as mongoose.Types.ObjectId, 'ADMIN')
    await request(app).post(`/api/admin/interactions/CLIENT/${clientId}`).send({ kind: 'NOTE', body: 'x' }).expect(404)
  })

  it('refuse un type de sujet inconnu', async () => {
    actAs(superAdminId, 'SUPER_ADMIN')
    await request(app).post(`/api/admin/interactions/PROJET/${leadId}`).send({ kind: 'NOTE', body: 'x' }).expect(400)
  })
})

describe('Timeline', () => {
  it('fusionne les échanges et les événements système, épinglés en tête', async () => {
    const { logInteraction } = await import('../lib/interactions.js')
    const { default: LeadActivity } = await import('../models/LeadActivity.js')

    await logInteraction({
      subjectType: 'LEAD',
      subjectId: leadId,
      kind: 'CALL',
      body: 'Ancien appel',
      occurredAt: new Date('2026-08-01T09:00:00Z'),
      author: commercialId,
    })
    await logInteraction({
      subjectType: 'LEAD',
      subjectId: leadId,
      kind: 'NOTE',
      body: 'Note épinglée',
      occurredAt: new Date('2026-07-01T09:00:00Z'),
      pinned: true,
      author: commercialId,
    })
    await LeadActivity.create({ leadId, type: 'STATUS_CHANGE', label: 'Statut passé à DEMO' })

    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app).get(`/api/admin/interactions/LEAD/${leadId}/timeline`).expect(200)

    expect(response.body.entries).toHaveLength(3)
    expect(response.body.entries[0].label).toBe('Note épinglée')
    expect(response.body.entries.map((entry: { source: string }) => entry.source)).toContain('SYSTEM')
    expect(response.body.entries.map((entry: { source: string }) => entry.source)).toContain('INTERACTION')
    expect(response.body.subject.contactEmail).toBe('contact@acme.fr')
  })

  it('rend une timeline vide sans erreur', async () => {
    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app).get(`/api/admin/interactions/LEAD/${leadId}/timeline`).expect(200)
    expect(response.body.entries).toEqual([])
    expect(response.body.hasMore).toBe(false)
  })

  it('signale la troncature plutôt que de la taire', async () => {
    const { logInteraction } = await import('../lib/interactions.js')
    for (let index = 0; index < 4; index += 1) {
      await logInteraction({ subjectType: 'LEAD', subjectId: leadId, kind: 'CALL', body: `Appel ${index}` })
    }
    actAs(commercialId, 'COMMERCIAL')
    const response = await request(app).get(`/api/admin/interactions/LEAD/${leadId}/timeline?limit=2`).expect(200)

    expect(response.body.entries).toHaveLength(2)
    expect(response.body.hasMore).toBe(true)
  })
})

describe('Corriger et supprimer', () => {
  it("corrige le contenu d'un échange", async () => {
    actAs(commercialId, 'COMMERCIAL')
    const created = await request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}`)
      .send({ kind: 'CALL', body: 'Faute de frappe' })
      .expect(201)

    const updated = await request(app)
      .patch(`/api/admin/interactions/${created.body.interaction._id}`)
      .send({ body: 'Corrigé' })
      .expect(200)

    expect(updated.body.interaction.body).toBe('Corrigé')
  })

  it('supprime un échange', async () => {
    const { default: Interaction } = await import('../models/Interaction.js')
    actAs(commercialId, 'COMMERCIAL')
    const created = await request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}`)
      .send({ kind: 'CALL', body: 'À supprimer' })
      .expect(201)

    await request(app).delete(`/api/admin/interactions/${created.body.interaction._id}`).expect(200)
    expect(await Interaction.countDocuments()).toBe(0)
  })

  it("refuse de toucher à l'échange d'un lead hors périmètre", async () => {
    const { default: Lead } = await import('../models/Lead.js')
    const { logInteraction } = await import('../lib/interactions.js')
    const foreign = await Lead.create({ company: 'Ailleurs', assignedTo: otherAdminId })
    const interaction = await logInteraction({
      subjectType: 'LEAD',
      subjectId: foreign._id as mongoose.Types.ObjectId,
      kind: 'CALL',
      body: 'Confidentiel',
    })

    actAs(commercialId, 'COMMERCIAL')
    await request(app).patch(`/api/admin/interactions/${interaction._id}`).send({ body: 'x' }).expect(404)
    await request(app).delete(`/api/admin/interactions/${interaction._id}`).expect(404)
  })
})

describe("Envoi d'email", () => {
  it("envoie au contact du lead et journalise l'échange", async () => {
    const sent: string[] = []
    mailState.sendMail = async ({ to }) => {
      sent.push(to)
      return {}
    }
    actAs(commercialId, 'COMMERCIAL')

    const response = await request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}/email`)
      .send({ subject: 'Notre proposition', body: 'Bonjour,\nvoici le devis.' })
      .expect(201)

    expect(sent).toEqual(['contact@acme.fr'])
    expect(response.body.interaction.kind).toBe('EMAIL')
    expect(response.body.interaction.direction).toBe('OUT')
    expect(response.body.interaction.deliveryStatus).toBe('SENT')
    expect(response.body.interaction.recipients[0].status).toBe('SENT')
  })

  it('journalise aussi un envoi échoué, et répond 502', async () => {
    const { default: Interaction } = await import('../models/Interaction.js')
    mailState.sendMail = async () => {
      throw new Error('relay refused')
    }
    actAs(commercialId, 'COMMERCIAL')

    const response = await request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}/email`)
      .send({ subject: 'Relance', body: 'Bonjour' })
      .expect(502)

    expect(response.body.interaction.deliveryStatus).toBe('FAILED')
    expect(response.body.interaction.recipients[0].error).toBe('relay refused')
    // La trace existe bel et bien en base, pas seulement dans la réponse.
    expect(await Interaction.countDocuments({ kind: 'EMAIL' })).toBe(1)
  })

  it('répond 207 quand une partie seulement des destinataires a reçu', async () => {
    mailState.sendMail = async ({ to }) => {
      if (to === 'ko@acme.fr') throw new Error('unknown mailbox')
      return {}
    }
    actAs(commercialId, 'COMMERCIAL')

    const response = await request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}/email`)
      .send({ subject: 'Relance', body: 'Bonjour', recipients: ['ok@acme.fr', 'ko@acme.fr'] })
      .expect(207)

    expect(response.body.sent).toBe(1)
    expect(response.body.failed).toBe(1)
    expect(response.body.interaction.deliveryStatus).toBe('PARTIAL')
  })

  it('refuse un envoi sans objet, sans corps ou sans destinataire valide', async () => {
    actAs(commercialId, 'COMMERCIAL')
    const base = `/api/admin/interactions/LEAD/${leadId}/email`
    await request(app).post(base).send({ body: 'x' }).expect(400)
    await request(app).post(base).send({ subject: 'x' }).expect(400)
    await request(app)
      .post(base)
      .send({ subject: 'x', body: 'y', recipients: ['pas-un-email'] })
      .expect(400)
  })

  it('répond 503 sans rien journaliser quand SMTP est absent', async () => {
    const { default: Interaction } = await import('../models/Interaction.js')
    mailState.sendMail = null
    actAs(commercialId, 'COMMERCIAL')

    await request(app)
      .post(`/api/admin/interactions/LEAD/${leadId}/email`)
      .send({ subject: 'Relance', body: 'Bonjour' })
      .expect(503)

    expect(await Interaction.countDocuments()).toBe(0)
  })
})
