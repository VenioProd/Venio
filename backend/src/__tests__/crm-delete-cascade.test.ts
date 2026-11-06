import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { asReqUser, resetCrmSettings, seedTeam, type Team, type TeamMember } from './crm-routes-helpers.js'

/**
 * Chantier 2D : suppression groupée = suppression unitaire (même cascade),
 * statut du commercial externe via le service de lead, identifiant mal formé
 * (400), recalcul de lastInteractionAt à la suppression d'un échange.
 */

const authState = vi.hoisted(() => ({ user: null as Request['user'] | null }))

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'Unauthorized' })
    req.user = authState.user
    next()
  },
}))
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
let Interaction: typeof import('../models/Interaction.js').default
let PersonalTask: typeof import('../models/PersonalTask.js').default
let CrmRuleRun: typeof import('../models/CrmRuleRun.js').default
let QuoteProposal: typeof import('../models/QuoteProposal.js').default
let logInteraction: typeof import('../lib/interactions.js').logInteraction

function as(member: TeamMember | null): void {
  authState.user = member ? asReqUser(member) : null
}

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  LeadActivity = (await import('../models/LeadActivity.js')).default
  Interaction = (await import('../models/Interaction.js')).default
  PersonalTask = (await import('../models/PersonalTask.js')).default
  CrmRuleRun = (await import('../models/CrmRuleRun.js')).default
  QuoteProposal = (await import('../models/QuoteProposal.js')).default
  ;({ logInteraction } = await import('../lib/interactions.js'))
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  const { default: crmExtrasRoutes } = await import('../routes/admin/crmExtras.js')
  const { default: interactionRoutes } = await import('../routes/admin/interactions.js')
  const { default: commercialRoutes } = await import('../routes/commercial/index.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', crmExtrasRoutes)
  app.use('/api/admin/crm', crmRoutes)
  app.use('/api/admin/interactions', interactionRoutes)
  app.use('/api/commercial', commercialRoutes)
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

const makeLead = (fields: Record<string, unknown> = {}) =>
  Lead.create({ company: 'Domaine Test', createdBy: team.superAdmin.id, ...fields })

/** Un lead avec tout ce que la cascade doit retirer, plus un devis brouillon rattaché. */
async function seedFullLead() {
  const lead = await makeLead()
  const leadId = lead._id
  await LeadActivity.create({ leadId, type: 'NOTE', label: 'x' })
  await Interaction.create({ subjectType: 'LEAD', subjectId: leadId, kind: 'NOTE', body: 'n', occurredAt: new Date() })
  await PersonalTask.create({ userId: team.superAdmin.id, leadId, title: 't' })
  await CrmRuleRun.create({ lead: leadId, rule: new mongoose.Types.ObjectId(), status: 'DONE', trigger: 'LEAD_CREATED' } as never).catch(() => undefined)
  return lead
}

async function footprint(leadId: unknown) {
  return {
    lead: await Lead.countDocuments({ _id: leadId }),
    activities: await LeadActivity.countDocuments({ leadId }),
    interactions: await Interaction.countDocuments({ subjectType: 'LEAD', subjectId: leadId }),
    tasks: await PersonalTask.countDocuments({ leadId }),
    runs: await CrmRuleRun.countDocuments({ lead: leadId }),
  }
}

describe('suppression groupée = suppression unitaire', () => {
  it('laisse la même empreinte en base (cascade complète)', async () => {
    const unit = await seedFullLead()
    const bulk = await seedFullLead()
    expect(await footprint(unit._id)).toEqual(await footprint(bulk._id))
    expect((await footprint(bulk._id)).activities).toBeGreaterThan(0)

    await request(app).delete('/api/admin/crm/leads/' + unit._id).expect(200)
    const res = await request(app)
      .post('/api/admin/crm/leads/bulk')
      .send({ ids: [String(bulk._id)], action: 'delete', confirm: true })
      .expect(200)
    expect(res.body.ok).toBe(1)

    expect(await footprint(bulk._id)).toEqual(await footprint(unit._id))
    expect(await footprint(bulk._id)).toEqual({ lead: 0, activities: 0, interactions: 0, tasks: 0, runs: 0 })
  })

  it('traite les devis rattachés comme la suppression unitaire (conservés)', async () => {
    const unit = await makeLead()
    const bulk = await makeLead()
    const make = (leadId: unknown) =>
      QuoteProposal.collection.insertOne({ leadId, status: 'DRAFT', title: 'Brouillon', createdAt: new Date(), updatedAt: new Date() })
    await make(unit._id)
    await make(bulk._id)
    await request(app).delete('/api/admin/crm/leads/' + unit._id).expect(200)
    await request(app).post('/api/admin/crm/leads/bulk').send({ ids: [String(bulk._id)], action: 'delete', confirm: true }).expect(200)
    // Aujourd'hui deleteLeadCascade ne touche pas aux devis : les deux chemins sont alignés.
    expect(await QuoteProposal.countDocuments({ leadId: unit._id })).toBe(1)
    expect(await QuoteProposal.countDocuments({ leadId: bulk._id })).toBe(1)
  })

  it('exige toujours confirm: true', async () => {
    const lead = await makeLead()
    await request(app).post('/api/admin/crm/leads/bulk').send({ ids: [String(lead._id)], action: 'delete' }).expect(400)
    expect(await Lead.countDocuments()).toBe(1)
  })
})

describe('commercial externe : changement de statut via le service de lead', () => {
  it('journalise STATUS_CHANGE avec l\'acteur, sans auto-qualification', async () => {
    const lead = await makeLead({ externalRep: team.externe.id, createdBy: team.externe.id })
    as(team.externe)
    const res = await request(app).patch('/api/commercial/leads/' + lead._id).send({ status: 'CONTACTED', budget: 4000, source: 'Salon' }).expect(200)
    expect(res.body.lead.status).toBe('CONTACTED')
    const rows = await LeadActivity.find({ leadId: lead._id, type: 'STATUS_CHANGE' }).lean()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.payload).toMatchObject({ from: 'LEAD', to: 'CONTACTED', source: 'commercial' })
    expect(String(rows[0]!.actorId)).toBe(team.externe.id)
    expect((await Lead.findById(lead._id).lean())?.statusChangedAt).toBeTruthy()
  })

  it('ne journalise rien sans changement de statut', async () => {
    const lead = await makeLead({ externalRep: team.externe.id, createdBy: team.externe.id })
    as(team.externe)
    await request(app).patch('/api/commercial/leads/' + lead._id).send({ notes: 'ok' }).expect(200)
    expect(await LeadActivity.countDocuments({ leadId: lead._id, type: 'STATUS_CHANGE' })).toBe(0)
  })

  it('refuse un motif de perte hors liste fermée (400) sans rien écrire', async () => {
    const lead = await makeLead({ externalRep: team.externe.id, createdBy: team.externe.id })
    as(team.externe)
    const res = await request(app).patch('/api/commercial/leads/' + lead._id).send({ status: 'LOST', lostReason: 'inconnu-xyz' })
    expect(res.status).toBe(400)
    expect((await Lead.findById(lead._id).lean())?.status).toBe('LEAD')
  })
})

describe('admin leads : identifiant mal formé', () => {
  it.each([
    ['get', '/api/admin/crm/leads/pas-un-id'],
    ['patch', '/api/admin/crm/leads/pas-un-id'],
    ['delete', '/api/admin/crm/leads/pas-un-id'],
    ['get', '/api/admin/crm/leads/pas-un-id/activities'],
    ['post', '/api/admin/crm/leads/pas-un-id/convert-to-client'],
  ] as const)('400 sur %s %s', async (method, url) => {
    const res = await request(app)[method](url).send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Identifiant invalide')
  })

  it('404 sur un identifiant bien formé mais inconnu', async () => {
    await request(app).get('/api/admin/crm/leads/' + new mongoose.Types.ObjectId()).expect(404)
  })
})

describe('lastInteractionAt', () => {
  const day = (d: number) => new Date(Date.UTC(2026, 0, d))
  const last = async (id: unknown) => (await Lead.findById(id).lean())!.lastInteractionAt

  async function log(leadId: unknown, occurredAt: Date) {
    const before = (await Lead.findById(leadId).lean())!.interactionsCount
    const interaction = await logInteraction({ subjectType: 'LEAD', subjectId: leadId as never, kind: 'NOTE', occurredAt })
    // L'écriture sur le lead est asynchrone : on attend le compteur, puis la date recalculée.
    await vi.waitFor(async () => expect((await Lead.findById(leadId).lean())!.interactionsCount).toBe(before + 1))
    return interaction
  }

  it('un échange antérieur ne fait pas reculer la date', async () => {
    const lead = await makeLead()
    await log(lead._id, day(10))
    await log(lead._id, day(3))
    await vi.waitFor(async () => expect((await last(lead._id))?.toISOString()).toBe(day(10).toISOString()))
  })

  it('la suppression recalcule la date sur l\'échange restant le plus récent', async () => {
    const lead = await makeLead()
    const a = await log(lead._id, day(5))
    const b = await log(lead._id, day(9))
    await vi.waitFor(async () => expect((await last(lead._id))?.toISOString()).toBe(day(9).toISOString()))
    await request(app).delete('/api/admin/interactions/' + b._id).expect(200)
    expect((await last(lead._id))?.toISOString()).toBe(day(5).toISOString())
    expect((await Lead.findById(lead._id).lean())!.interactionsCount).toBe(1)
    await request(app).delete('/api/admin/interactions/' + a._id).expect(200)
    expect(await last(lead._id)).toBeNull()
    expect((await Lead.findById(lead._id).lean())!.interactionsCount).toBe(0)
  })

  it('supprimer un échange ancien laisse la date inchangée', async () => {
    const lead = await makeLead()
    const old = await log(lead._id, day(2))
    await log(lead._id, day(8))
    await vi.waitFor(async () => expect((await last(lead._id))?.toISOString()).toBe(day(8).toISOString()))
    await request(app).delete('/api/admin/interactions/' + old._id).expect(200)
    expect((await last(lead._id))?.toISOString()).toBe(day(8).toISOString())
  })
})

describe('wonProcessedAt', () => {
  it('est déclaré dans le schéma (null par défaut) et absent de l\'export CSV', async () => {
    const lead = await makeLead()
    expect(Lead.schema.path('wonProcessedAt')).toBeTruthy()
    expect((await Lead.findById(lead._id).lean())!.wonProcessedAt ?? null).toBeNull()
    const res = await request(app).get('/api/admin/crm/leads/export?columns=wonProcessedAt,company').expect(200)
    expect(res.text).not.toMatch(/wonProcessedAt/)
    expect(res.text).toMatch(/Domaine Test/)
  })
})
