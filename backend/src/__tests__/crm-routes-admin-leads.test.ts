import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import {
  asReqUser,
  newIdempotencyKey,
  resetCrmSettings,
  seedTeam,
  type Team,
  type TeamMember,
} from './crm-routes-helpers.js'

/**
 * Non-régression des routes leads de l'admin CRM (POST, PATCH, DELETE).
 *
 * Ces tests figent le contrat HTTP actuel : codes, formes de réponse, effets en
 * base. Ils n'enferment pas l'implémentation (pas de spy sur les helpers du
 * routeur) : un refactor qui garde le contrat doit les laisser verts.
 * Les comportements que l'audit du 6 novembre 2026 range parmi les bugs sont
 * en it.todo.
 */

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))

// Effets de bord vers l'extérieur : jamais appelés pour de vrai.
vi.mock('../lib/nextcloud.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createClientFolders: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../automation/trigger.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  triggerAutomations: vi.fn(),
}))

let app: Express
let team: Team
let Lead: typeof import('../models/Lead.js').default
let LeadActivity: typeof import('../models/LeadActivity.js').default
let User: typeof import('../models/User.js').default

function as(member: TeamMember | null): void {
  authState.user = member ? asReqUser(member) : null
}

async function makeLead(fields: Record<string, unknown> = {}) {
  return Lead.create({ company: 'Domaine Test', createdBy: team.superAdmin.id, ...fields })
}

async function activityTypes(leadId: unknown): Promise<string[]> {
  const rows = await LeadActivity.find({ leadId }).sort({ createdAt: 1, _id: 1 }).lean()
  return rows.map((r) => r.type)
}

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  LeadActivity = (await import('../models/LeadActivity.js')).default
  User = (await import('../models/User.js')).default
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', crmRoutes)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  team = await seedTeam()
  await resetCrmSettings()
  as(team.superAdmin)
})

// ───────────────────────────────────────────────────────────────────────────
// Droits d'accès aux routes d'écriture
// ───────────────────────────────────────────────────────────────────────────

describe("admin CRM leads / droits d'accès", () => {
  it('401 sans authentification', async () => {
    as(null)
    await request(app).post('/api/admin/crm/leads').send({ company: 'X' }).expect(401)
  })

  it.each(['stagiaire', 'viewer', 'comptable', 'externe', 'client'])(
    '403 pour %s sur POST, PATCH et DELETE (aucun lead créé ni modifié)',
    async (who) => {
      const lead = await makeLead({ assignedTo: team[who]!.id, createdBy: team[who]!.id })
      as(team[who]!)
      const post = await request(app).post('/api/admin/crm/leads').send({ company: 'Nouveau' })
      expect(post.status).toBe(403)
      expect(post.body.error).toBe('Forbidden')
      await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ company: 'Renommé' }).expect(403)
      await request(app).delete(`/api/admin/crm/leads/${lead._id}`).expect(403)
      const after = await Lead.findById(lead._id).lean()
      expect(after?.company).toBe('Domaine Test')
      expect(await Lead.countDocuments()).toBe(1)
    },
  )

  it.each(['superAdmin', 'admin', 'manager', 'commercialA'])('%s peut créer un lead (201)', async (who) => {
    as(team[who]!)
    await request(app).post('/api/admin/crm/leads').send({ company: 'Autorisé' }).expect(201)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// POST /leads
// ───────────────────────────────────────────────────────────────────────────

describe('admin CRM leads / POST', () => {
  it('crée un lead : 201, { lead }, valeurs par défaut et traçabilité', async () => {
    const res = await request(app)
      .post('/api/admin/crm/leads')
      .send({ company: '  Domaine A  ', contactName: 'Alice', contactEmail: 'alice@example.com', priority: 'HAUTE' })
      .expect(201)
    expect(Object.keys(res.body)).toEqual(['lead'])
    const { lead } = res.body
    expect(lead.company).toBe('Domaine A')
    expect(lead.status).toBe('LEAD')
    expect(lead.priority).toBe('HAUTE')
    expect(lead.createdBy).toBe(team.superAdmin.id)
    expect(lead.statusChangedAt).toBeTruthy()

    const inDb = await Lead.findById(lead._id).lean()
    expect(inDb?.company).toBe('Domaine A')
    expect(String(inDb?.createdBy)).toBe(team.superAdmin.id)
    expect(await activityTypes(lead._id)).toEqual(['CREATED'])
  })

  it("journalise CREATED avec l'auteur de la création", async () => {
    const res = await request(app).post('/api/admin/crm/leads').send({ company: 'Trace' }).expect(201)
    const activity = await LeadActivity.findOne({ leadId: res.body.lead._id }).lean()
    expect(activity?.type).toBe('CREATED')
    expect(String(activity?.actorId)).toBe(team.superAdmin.id)
  })

  it("n'écrit pas le journal si activityLogging est désactivé", async () => {
    await resetCrmSettings({ activityLogging: false })
    const res = await request(app).post('/api/admin/crm/leads').send({ company: 'Silence' }).expect(201)
    expect(await LeadActivity.countDocuments({ leadId: res.body.lead._id })).toBe(0)
  })

  it('400 sans société : { error, errors[] }', async () => {
    const res = await request(app).post('/api/admin/crm/leads').send({ contactName: 'Sans société' }).expect(400)
    expect(res.body.error).toBe("Le nom de l'entreprise est requis")
    expect(Array.isArray(res.body.errors)).toBe(true)
    expect(await Lead.countDocuments()).toBe(0)
  })

  it('400 pour un e-mail de contact invalide', async () => {
    const res = await request(app)
      .post('/api/admin/crm/leads')
      .send({ company: 'X', contactEmail: 'pas-un-mail' })
      .expect(400)
    expect(res.body.error).toBe('Email de contact invalide')
  })

  it('400 pour un projet hors liste', async () => {
    const res = await request(app).post('/api/admin/crm/leads').send({ company: 'X', project: 'INCONNU' }).expect(400)
    expect(res.body.error).toBe('Projet invalide')
  })

  it('ignore silencieusement un statut ou une priorité hors liste (valeurs par défaut)', async () => {
    const res = await request(app)
      .post('/api/admin/crm/leads')
      .send({ company: 'X', status: 'WAT', priority: 'WAT' })
      .expect(201)
    expect(res.body.lead.status).toBe('LEAD')
    expect(res.body.lead.priority).toBe('NORMALE')
  })

  it('ignore createdBy, clientAccountId et champs inconnus fournis par le client', async () => {
    const res = await request(app)
      .post('/api/admin/crm/leads')
      .send({ company: 'X', createdBy: team.commercialA.id, clientAccountId: team.client.id, foo: 'bar' })
      .expect(201)
    expect(res.body.lead.createdBy).toBe(team.superAdmin.id)
    expect(res.body.lead.clientAccountId ?? null).toBeNull()
    expect(res.body.lead.foo).toBeUndefined()
  })

  describe('assignation', () => {
    it('accepte un commercial actif comme assigné', async () => {
      const res = await request(app)
        .post('/api/admin/crm/leads')
        .send({ company: 'X', assignedTo: team.commercialA.id })
        .expect(201)
      expect(res.body.lead.assignedTo).toBe(team.commercialA.id)
    })

    it.each([
      ['un compte inactif', () => team.inactive.id],
      ['un lecteur (VIEWER)', () => team.viewer.id],
      ['un comptable', () => team.comptable.id],
      ['un client', () => team.client.id],
      ['un identifiant inconnu', () => String(new mongoose.Types.ObjectId())],
      ['un identifiant mal formé', () => 'pas-un-id'],
    ])("400 si l'assigné est %s", async (_label, id) => {
      const res = await request(app).post('/api/admin/crm/leads').send({ company: 'X', assignedTo: id() }).expect(400)
      expect(res.body.error).toBe('Commercial introuvable, inactif ou non habilité à suivre un lead')
      expect(await Lead.countDocuments()).toBe(0)
    })

    it('un non-super-admin se voit attribuer son propre lead', async () => {
      as(team.commercialA)
      const res = await request(app).post('/api/admin/crm/leads').send({ company: 'X' }).expect(201)
      expect(res.body.lead.assignedTo).toBe(team.commercialA.id)
      expect(res.body.lead.createdBy).toBe(team.commercialA.id)
    })

    it('un non-super-admin peut en désigner un autre à la création', async () => {
      as(team.commercialA)
      const res = await request(app)
        .post('/api/admin/crm/leads')
        .send({ company: 'X', assignedTo: team.commercialB.id })
        .expect(201)
      expect(res.body.lead.assignedTo).toBe(team.commercialB.id)
    })

    it('super-admin sans assigné et sans round-robin : lead non assigné', async () => {
      const res = await request(app).post('/api/admin/crm/leads').send({ company: 'X' }).expect(201)
      expect(res.body.lead.assignedTo ?? null).toBeNull()
    })

    it("super-admin sans assigné avec round-robin : un membre de l'équipe admin est désigné", async () => {
      await resetCrmSettings({ roundRobinEnabled: true })
      const res = await request(app).post('/api/admin/crm/leads').send({ company: 'X' }).expect(201)
      const assignee = await User.findById(res.body.lead.assignedTo).lean()
      expect(assignee).toBeTruthy()
      expect(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'COMMERCIAL', 'STAGIAIRE', 'VIEWER', 'COMPTABLE', 'RH']).toContain(
        assignee!.role,
      )
    })
  })

  describe('automatismes de statut à la création', () => {
    it('auto-qualification : budget + source sur un lead LEAD => QUALIFIED', async () => {
      const res = await request(app)
        .post('/api/admin/crm/leads')
        .send({ company: 'X', budget: 5000, source: 'Salon' })
        .expect(201)
      expect(res.body.lead.status).toBe('QUALIFIED')
    })

    it("pas d'auto-qualification sans source, sans budget ou avec budget nul", async () => {
      const a = await request(app).post('/api/admin/crm/leads').send({ company: 'A', budget: 5000 }).expect(201)
      const b = await request(app).post('/api/admin/crm/leads').send({ company: 'B', source: 'Salon' }).expect(201)
      const c = await request(app)
        .post('/api/admin/crm/leads')
        .send({ company: 'C', budget: 0, source: 'Salon' })
        .expect(201)
      expect([a, b, c].map((r) => r.body.lead.status)).toEqual(['LEAD', 'LEAD', 'LEAD'])
    })

    it("pas d'auto-qualification si le réglage est désactivé", async () => {
      await resetCrmSettings({ autoQualifyEnabled: false })
      const res = await request(app)
        .post('/api/admin/crm/leads')
        .send({ company: 'X', budget: 5000, source: 'Salon' })
        .expect(201)
      expect(res.body.lead.status).toBe('LEAD')
    })

    it("l'auto-qualification ne touche pas un statut explicite", async () => {
      const res = await request(app)
        .post('/api/admin/crm/leads')
        .send({ company: 'X', budget: 5000, source: 'Salon', status: 'CONTACTED' })
        .expect(201)
      expect(res.body.lead.status).toBe('CONTACTED')
    })

    it('CONTACTED renseigne lastContactAt ; PROPOSAL et DEMO programment la prochaine action', async () => {
      const contacted = await request(app)
        .post('/api/admin/crm/leads')
        .send({ company: 'C', status: 'CONTACTED' })
        .expect(201)
      expect(contacted.body.lead.lastContactAt).toBeTruthy()
      const proposal = await request(app)
        .post('/api/admin/crm/leads')
        .send({ company: 'P', status: 'PROPOSAL' })
        .expect(201)
      expect(proposal.body.lead.nextActionAt).toBeTruthy()
      const demo = await request(app).post('/api/admin/crm/leads').send({ company: 'D', status: 'DEMO' }).expect(201)
      expect(demo.body.lead.nextActionAt).toBeTruthy()
    })

    it('LOST vide la prochaine action', async () => {
      const res = await request(app)
        .post('/api/admin/crm/leads')
        .send({ company: 'X', status: 'LOST', nextActionAt: '2030-01-01T00:00:00.000Z' })
        .expect(201)
      expect(res.body.lead.nextActionAt ?? null).toBeNull()
    })

    it('création directe en WON : le lead est relié à un compte client créé', async () => {
      const res = await request(app)
        .post('/api/admin/crm/leads')
        .send({ company: 'Gagné SA', contactName: 'Gaëlle', contactEmail: 'gaelle@example.com', status: 'WON' })
        .expect(201)
      expect(res.body.lead.status).toBe('WON')
      const inDb = await Lead.findById(res.body.lead._id).lean()
      expect(inDb?.clientAccountId).toBeTruthy()
      const client = await User.findById(inDb!.clientAccountId).lean()
      expect(client?.role).toBe('CLIENT')
      expect(client?.email).toBe('gaelle@example.com')
    })
  })

  describe('Idempotency-Key', () => {
    it("400 INVALID_IDEMPOTENCY_KEY si la clé n'est pas un UUID", async () => {
      const res = await request(app)
        .post('/api/admin/crm/leads')
        .set('Idempotency-Key', 'pas-un-uuid')
        .send({ company: 'X' })
        .expect(400)
      expect(res.body.code).toBe('INVALID_IDEMPOTENCY_KEY')
      expect(await Lead.countDocuments()).toBe(0)
    })

    it('rejoue la même réponse sans créer de second lead', async () => {
      const key = newIdempotencyKey()
      const first = await request(app)
        .post('/api/admin/crm/leads')
        .set('Idempotency-Key', key)
        .send({ company: 'Une fois' })
        .expect(201)
      const second = await request(app)
        .post('/api/admin/crm/leads')
        .set('Idempotency-Key', key)
        .send({ company: 'Une fois' })
      expect(second.status).toBe(201)
      expect(second.body.lead._id).toBe(first.body.lead._id)
      expect(await Lead.countDocuments()).toBe(1)
    })

    it('409 IDEMPOTENCY_CONFLICT si la même clé sert pour un autre corps', async () => {
      const key = newIdempotencyKey()
      await request(app).post('/api/admin/crm/leads').set('Idempotency-Key', key).send({ company: 'A' }).expect(201)
      const res = await request(app).post('/api/admin/crm/leads').set('Idempotency-Key', key).send({ company: 'B' })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('IDEMPOTENCY_CONFLICT')
      expect(await Lead.countDocuments()).toBe(1)
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
// PATCH /leads/:id
// ───────────────────────────────────────────────────────────────────────────

describe('admin CRM leads / PATCH', () => {
  it('404 { error: "Lead not found" } pour un lead inexistant', async () => {
    const res = await request(app)
      .patch(`/api/admin/crm/leads/${new mongoose.Types.ObjectId()}`)
      .send({ company: 'X' })
      .expect(404)
    expect(res.body.error).toBe('Lead not found')
  })

  it('met à jour les champs simples et renvoie { lead } ; ignore les champs hors liste', async () => {
    const lead = await makeLead()
    const res = await request(app)
      .patch(`/api/admin/crm/leads/${lead._id}`)
      .send({
        company: ' Renommé ',
        contactPhone: '0102030405',
        priority: 'URGENTE',
        leadTemperature: 'CHAUD',
        createdBy: team.commercialA.id,
        status: 'NOPE',
      })
      .expect(200)
    expect(Object.keys(res.body)).toEqual(['lead'])
    expect(res.body.lead).toMatchObject({
      company: 'Renommé',
      contactPhone: '0102030405',
      priority: 'URGENTE',
      leadTemperature: 'CHAUD',
      status: 'LEAD',
    })
    const inDb = await Lead.findById(lead._id).lean()
    expect(String(inDb?.createdBy)).toBe(team.superAdmin.id)
  })

  it("400 pour un projet hors liste, rien n'est modifié", async () => {
    const lead = await makeLead({ project: 'VIGNO' })
    const res = await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ project: 'INCONNU' }).expect(400)
    expect(res.body.error).toBe('Projet invalide')
    expect((await Lead.findById(lead._id).lean())?.project).toBe('VIGNO')
  })

  describe('changement de statut', () => {
    it('met à jour statut et statusChangedAt, et journalise STATUS_CHANGE { from, to }', async () => {
      const lead = await makeLead({ statusChangedAt: new Date('2020-01-01T00:00:00Z') })
      const res = await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ status: 'DEMO' }).expect(200)
      expect(res.body.lead.status).toBe('DEMO')
      expect(new Date(res.body.lead.statusChangedAt).getFullYear()).toBeGreaterThan(2020)
      const activity = await LeadActivity.findOne({ leadId: lead._id, type: 'STATUS_CHANGE' }).lean()
      expect(activity?.payload).toMatchObject({ from: 'LEAD', to: 'DEMO' })
      expect(String(activity?.actorId)).toBe(team.superAdmin.id)
    })

    it('un PATCH avec le même statut ne journalise rien et laisse statusChangedAt', async () => {
      const when = new Date('2020-01-01T00:00:00Z')
      const lead = await makeLead({ statusChangedAt: when })
      await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ status: 'LEAD', notes: 'RAS' }).expect(200)
      expect(await activityTypes(lead._id)).toEqual([])
      expect((await Lead.findById(lead._id).lean())?.statusChangedAt?.toISOString()).toBe(when.toISOString())
    })

    it("journalise toujours STATUS_CHANGE (pilotage) même si activityLogging est désactivé, et rien d'autre", async () => {
      await resetCrmSettings({ activityLogging: false })
      const lead = await makeLead()
      await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ status: 'DEMO' }).expect(200)
      expect(await activityTypes(lead._id)).toEqual(['STATUS_CHANGE'])
    })

    it("CONTACTED renseigne lastContactAt s'il est vide et le conserve sinon", async () => {
      const a = await makeLead()
      const resA = await request(app).patch(`/api/admin/crm/leads/${a._id}`).send({ status: 'CONTACTED' }).expect(200)
      expect(resA.body.lead.lastContactAt).toBeTruthy()
      const previous = new Date('2024-05-05T10:00:00Z')
      const b = await makeLead({ lastContactAt: previous })
      const resB = await request(app).patch(`/api/admin/crm/leads/${b._id}`).send({ status: 'CONTACTED' }).expect(200)
      expect(new Date(resB.body.lead.lastContactAt).toISOString()).toBe(previous.toISOString())
    })

    it('PROPOSAL programme la prochaine action si elle est vide', async () => {
      const lead = await makeLead()
      const res = await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ status: 'PROPOSAL' }).expect(200)
      expect(res.body.lead.nextActionAt).toBeTruthy()
    })

    it('WON et LOST vident la prochaine action', async () => {
      const a = await makeLead({ nextActionAt: new Date('2030-01-01T00:00:00Z') })
      const resA = await request(app).patch(`/api/admin/crm/leads/${a._id}`).send({ status: 'LOST' }).expect(200)
      expect(resA.body.lead.nextActionAt ?? null).toBeNull()
    })
  })

  describe('motif de perte', () => {
    it('enregistre un motif de la liste fermée avec son commentaire', async () => {
      const lead = await makeLead()
      const res = await request(app)
        .patch(`/api/admin/crm/leads/${lead._id}`)
        .send({ status: 'LOST', lostReason: 'Prix', lostComment: 'Trop cher' })
        .expect(200)
      expect(res.body.lead).toMatchObject({ status: 'LOST', lostReason: 'Prix', lostComment: 'Trop cher' })
    })

    it('400 { error: "Motif de perte inconnu", allowed } hors liste ; rien n\'est modifié', async () => {
      const lead = await makeLead()
      const res = await request(app)
        .patch(`/api/admin/crm/leads/${lead._id}`)
        .send({ status: 'LOST', lostReason: 'Parce que' })
        .expect(400)
      expect(res.body.error).toBe('Motif de perte inconnu')
      expect(res.body.allowed).toEqual(['Prix', 'Délai', 'Concurrent', 'Sans réponse', 'Hors cible', 'Projet annulé'])
      expect((await Lead.findById(lead._id).lean())?.status).toBe('LEAD')
    })

    it("accepte un statut LOST sans motif (le motif n'est pas obligatoire)", async () => {
      const lead = await makeLead()
      const res = await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ status: 'LOST' }).expect(200)
      expect(res.body.lead.status).toBe('LOST')
    })

    it('une liste de motifs personnalisée remplace celle par défaut', async () => {
      await resetCrmSettings({ lostReasons: ['Budget gelé'] })
      const lead = await makeLead()
      await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ lostReason: 'Prix' }).expect(400)
      await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ lostReason: 'Budget gelé' }).expect(200)
    })
  })

  describe('assignation', () => {
    it('le super-admin réassigne : ASSIGNED { from, to } journalisé', async () => {
      const lead = await makeLead({ assignedTo: team.commercialA.id })
      const res = await request(app)
        .patch(`/api/admin/crm/leads/${lead._id}`)
        .send({ assignedTo: team.commercialB.id })
        .expect(200)
      expect(res.body.lead.assignedTo).toBe(team.commercialB.id)
      const activity = await LeadActivity.findOne({ leadId: lead._id, type: 'ASSIGNED' }).lean()
      expect(activity?.payload).toMatchObject({ from: team.commercialA.id, to: team.commercialB.id })
    })

    it('le super-admin peut désassigner (assignedTo: null)', async () => {
      const lead = await makeLead({ assignedTo: team.commercialA.id })
      const res = await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ assignedTo: null }).expect(200)
      expect(res.body.lead.assignedTo ?? null).toBeNull()
    })

    it('réassigner au même titulaire ne journalise pas ASSIGNED', async () => {
      const lead = await makeLead({ assignedTo: team.commercialA.id })
      await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ assignedTo: team.commercialA.id }).expect(200)
      expect(await activityTypes(lead._id)).not.toContain('ASSIGNED')
    })

    it('le titulaire peut céder son lead', async () => {
      const lead = await makeLead({ assignedTo: team.commercialA.id, createdBy: team.admin.id })
      as(team.commercialA)
      const res = await request(app)
        .patch(`/api/admin/crm/leads/${lead._id}`)
        .send({ assignedTo: team.commercialB.id })
        .expect(200)
      expect(res.body.lead.assignedTo).toBe(team.commercialB.id)
    })

    it('403 LEAD_ASSIGNMENT_FORBIDDEN : le créateur non titulaire ne peut pas réassigner', async () => {
      const lead = await makeLead({ assignedTo: team.commercialB.id, createdBy: team.commercialA.id })
      as(team.commercialA)
      const res = await request(app)
        .patch(`/api/admin/crm/leads/${lead._id}`)
        .send({ assignedTo: team.commercialA.id })
        .expect(403)
      expect(res.body.code).toBe('LEAD_ASSIGNMENT_FORBIDDEN')
      expect(String((await Lead.findById(lead._id).lean())?.assignedTo)).toBe(team.commercialB.id)
    })

    it("le créateur non titulaire peut modifier le reste du lead sans toucher à l'assignation", async () => {
      const lead = await makeLead({ assignedTo: team.commercialB.id, createdBy: team.commercialA.id })
      as(team.commercialA)
      await request(app)
        .patch(`/api/admin/crm/leads/${lead._id}`)
        .send({ notes: 'Mise à jour', assignedTo: team.commercialB.id })
        .expect(200)
    })
  })

  describe('auto-qualification', () => {
    it('un PATCH qui complète budget + source qualifie un lead LEAD et journalise un STATUS_CHANGE marqué auto', async () => {
      const lead = await makeLead()
      const res = await request(app)
        .patch(`/api/admin/crm/leads/${lead._id}`)
        .send({ budget: 4000, source: 'Salon' })
        .expect(200)
      expect(res.body.lead.status).toBe('QUALIFIED')
      const change = await LeadActivity.findOne({ leadId: lead._id, type: 'STATUS_CHANGE' }).lean()
      expect(change).toBeTruthy()
      expect((change as { payload?: { auto?: string } }).payload?.auto).toBe('AUTO_QUALIFIED')
    })

    it("ne qualifie pas si le réglage est désactivé ou si le statut n'est plus LEAD", async () => {
      await resetCrmSettings({ autoQualifyEnabled: false })
      const a = await makeLead()
      const resA = await request(app)
        .patch(`/api/admin/crm/leads/${a._id}`)
        .send({ budget: 4000, source: 'Salon' })
        .expect(200)
      expect(resA.body.lead.status).toBe('LEAD')

      await resetCrmSettings()
      const b = await makeLead({ status: 'DEMO' })
      const resB = await request(app)
        .patch(`/api/admin/crm/leads/${b._id}`)
        .send({ budget: 4000, source: 'Salon' })
        .expect(200)
      expect(resB.body.lead.status).toBe('DEMO')
    })

    it("met à jour statusChangedAt lors de l'auto-qualification", async () => {
      const lead = await makeLead({ statusChangedAt: new Date('2020-01-01T00:00:00Z') })
      const res = await request(app)
        .patch(`/api/admin/crm/leads/${lead._id}`)
        .send({ budget: 4000, source: 'Salon' })
        .expect(200)
      expect(new Date(res.body.lead.statusChangedAt).getFullYear()).toBeGreaterThan(2020)
    })

    it.todo(
      "BUG audit : l'auto-qualification (LEAD -> QUALIFIED) devrait aussi journaliser STATUS_CHANGE { from: LEAD, to: QUALIFIED } — aujourd'hui seul AUTO_QUALIFIED est écrit, ce qui trouble l'entonnoir de pilotage",
    )
    it.todo(
      'BUG audit : un PATCH qui passe à QUALIFIED explicitement et celui qui qualifie automatiquement devraient laisser la même trace de transition',
    )
  })

  describe('passage à WON', () => {
    it('crée le compte client, relie le lead et journalise CONVERTED', async () => {
      const lead = await makeLead({
        contactName: 'Gaëlle',
        contactEmail: 'gaelle@example.com',
        nextActionAt: new Date('2030-01-01T00:00:00Z'),
      })
      const res = await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ status: 'WON' }).expect(200)
      expect(res.body.lead.status).toBe('WON')
      expect(res.body.lead.nextActionAt ?? null).toBeNull()
      const inDb = await Lead.findById(lead._id).lean()
      expect(inDb?.clientAccountId).toBeTruthy()
      const clients = await User.find({ role: 'CLIENT', email: 'gaelle@example.com' }).lean()
      expect(clients).toHaveLength(1)
      expect(String(clients[0]!._id)).toBe(String(inDb!.clientAccountId))
      const types = await activityTypes(lead._id)
      expect(types).toContain('STATUS_CHANGE')
      expect(types).toContain('CONVERTED')
    })

    it("réutilise le compte client existant de même e-mail au lieu d'en créer un second", async () => {
      const existing = await User.create({ email: 'deja@example.com', name: 'Déjà', role: 'CLIENT', passwordHash: 'x' })
      const lead = await makeLead({ contactEmail: 'deja@example.com' })
      await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ status: 'WON' }).expect(200)
      expect(String((await Lead.findById(lead._id).lean())?.clientAccountId)).toBe(String(existing._id))
      expect(await User.countDocuments({ role: 'CLIENT', email: 'deja@example.com' })).toBe(1)
    })

    it('un second PATCH WON sur un lead déjà WON ne crée pas de second client', async () => {
      const lead = await makeLead({ contactEmail: 'once@example.com' })
      await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ status: 'WON' }).expect(200)
      await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ status: 'WON', notes: 'encore' }).expect(200)
      expect(await User.countDocuments({ role: 'CLIENT', email: 'once@example.com' })).toBe(1)
    })

    it.todo(
      "BUG audit : la conversion WON ne devrait s'exécuter qu'une fois — la route admin appelle ensureClientForWonLead ET déclenche l'automatisation crm.auto_convert_won_lead (double conversion / double projet possible)",
    )
    it.todo(
      "BUG audit : un lead passé à WON par l'API agent ou le traitement groupé devrait suivre la même conversion que la route admin (aujourd'hui seul l'admin crée client et projet)",
    )
  })

  describe('Idempotency-Key', () => {
    it('rejoue la même réponse pour un PATCH répété', async () => {
      const lead = await makeLead()
      const key = newIdempotencyKey()
      const first = await request(app)
        .patch(`/api/admin/crm/leads/${lead._id}`)
        .set('Idempotency-Key', key)
        .send({ status: 'DEMO' })
        .expect(200)
      const second = await request(app)
        .patch(`/api/admin/crm/leads/${lead._id}`)
        .set('Idempotency-Key', key)
        .send({ status: 'DEMO' })
      expect(second.status).toBe(200)
      expect(second.body.lead._id).toBe(first.body.lead._id)
      expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'STATUS_CHANGE' })).toBe(1)
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
// DELETE /leads/:id
// ───────────────────────────────────────────────────────────────────────────

describe('admin CRM leads / DELETE', () => {
  it('supprime le lead et ses activités : 200 { success: true }', async () => {
    const created = await request(app).post('/api/admin/crm/leads').send({ company: 'À supprimer' }).expect(201)
    const id = created.body.lead._id
    expect(await LeadActivity.countDocuments({ leadId: id })).toBeGreaterThan(0)
    const res = await request(app).delete(`/api/admin/crm/leads/${id}`).expect(200)
    expect(res.body).toEqual({ success: true })
    expect(await Lead.countDocuments()).toBe(0)
    expect(await LeadActivity.countDocuments({ leadId: id })).toBe(0)
  })

  it('404 { error: "Lead not found" } pour un lead inexistant', async () => {
    const res = await request(app).delete(`/api/admin/crm/leads/${new mongoose.Types.ObjectId()}`).expect(404)
    expect(res.body.error).toBe('Lead not found')
  })

  it('ne supprime pas les autres leads ni leurs activités', async () => {
    const keep = await makeLead({ company: 'Garder' })
    const drop = await makeLead({ company: 'Jeter' })
    await LeadActivity.create({ leadId: keep._id, type: 'CREATED', label: 'x' })
    await request(app).delete(`/api/admin/crm/leads/${drop._id}`).expect(200)
    expect(await Lead.countDocuments()).toBe(1)
    expect(await LeadActivity.countDocuments({ leadId: keep._id })).toBe(1)
  })
})
