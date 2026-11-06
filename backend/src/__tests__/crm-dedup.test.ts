import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { asReqUser, resetCrmSettings, seedTeam, type Team, type TeamMember } from './crm-routes-helpers.js'
import { normalizeCompanyName, normalizeEmail, normalizePhone } from '../lib/crmDedup.js'
import { normalizeLeadPatch } from '../lib/crmLeadService.js'

/**
 * Chantier 3B — dédoublonnage du CRM :
 *   - normalisation (e-mail, téléphone, entreprise) et champs maintenus par le service ;
 *   - migration 008 (rattrapage idempotent) ;
 *   - detection (checkDuplicateLead : champs normalisés, périmètre dans la requête, limite après filtre) ;
 *   - création admin (duplicates, blocage) et formulaire public ;
 *   - fusion (POST /leads/:id/merge) : complète, réattache, journalise, supprime, refus.
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
vi.mock('../lib/email.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sendContactReceiptEmail: vi.fn().mockResolvedValue({ sent: false }),
}))

let app: Express
let contactApp: Express
let team: Team
let Lead: typeof import('../models/Lead.js').default
let LeadActivity: typeof import('../models/LeadActivity.js').default
let Interaction: typeof import('../models/Interaction.js').default
let PersonalTask: typeof import('../models/PersonalTask.js').default
let CrmRuleRun: typeof import('../models/CrmRuleRun.js').default
let QuoteProposal: typeof import('../models/QuoteProposal.js').default
let Project: typeof import('../models/Project.js').default

const as = (member: TeamMember | null): void => {
  authState.user = member ? asReqUser(member) : null
}
const oid = () => new mongoose.Types.ObjectId()

let ipCounter = 0

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  LeadActivity = (await import('../models/LeadActivity.js')).default
  Interaction = (await import('../models/Interaction.js')).default
  PersonalTask = (await import('../models/PersonalTask.js')).default
  CrmRuleRun = (await import('../models/CrmRuleRun.js')).default
  QuoteProposal = (await import('../models/QuoteProposal.js')).default
  Project = (await import('../models/Project.js')).default
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', crmRoutes)
  const { default: contactRoutes } = await import('../routes/public/contact.js')
  contactApp = express()
  contactApp.set('trust proxy', 1)
  contactApp.use(express.json())
  contactApp.use('/api/contact', contactRoutes)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  team = await seedTeam()
  await resetCrmSettings({ duplicateDetectionEnabled: true, duplicateCheckEmail: true, duplicateCheckCompany: true, duplicateCheckPhone: true })
  as(team.superAdmin)
})

const makeLead = (fields: Record<string, unknown> = {}) =>
  Lead.create({ company: 'Domaine Test', createdBy: team.superAdmin.id, ...fields })

// ───────────────────────────────────────────────────────────────────────────
describe('normalisation', () => {
  it('e-mail : espaces et casse', () => {
    expect(normalizeEmail('  Ana.Dupont@Example.COM ')).toBe('ana.dupont@example.com')
    expect(normalizeEmail(null)).toBe('')
  })

  it('téléphone : chiffres seuls, préfixe français ramené à 0', () => {
    expect(normalizePhone('06 12 34 56 78')).toBe('0612345678')
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('0612345678')
    expect(normalizePhone('+33 (0)6.12.34.56.78')).toBe('0612345678')
    expect(normalizePhone('0033612345678')).toBe('0612345678')
    expect(normalizePhone('06-12-34-56-78')).toBe('0612345678')
    expect(normalizePhone('+32 475 12 34 56')).toBe('32475123456')
    expect(normalizePhone('abc')).toBe('')
    expect(normalizePhone('')).toBe('')
  })

  it('entreprise : minuscules, sans accents ni ponctuation', () => {
    expect(normalizeCompanyName('  Société Générale, S.A. ')).toBe('societe generale s a')
    expect(normalizeCompanyName("L'Oréal")).toBe('loreal')
    expect(normalizeCompanyName('ACME   Corp.')).toBe('acme corp')
    expect(normalizeCompanyName('Café & Co')).toBe('cafe co')
  })

  it('normalizeLeadPatch pose les champs normalisés présents, et eux seuls', () => {
    const patch = normalizeLeadPatch({ contactEmail: ' A@B.Fr ', contactPhone: '+33 1 02 03 04 05', company: 'Éclair' })
    expect(patch.contactEmailNormalized).toBe('a@b.fr')
    expect(patch.contactPhoneNormalized).toBe('0102030405')
    expect(patch.companyNormalized).toBe('eclair')
    const partial = normalizeLeadPatch({ notes: 'x' })
    expect(partial).not.toHaveProperty('contactEmailNormalized')
  })

  it('le modèle tient les champs normalisés à jour (création, modification)', async () => {
    const lead = await makeLead({ company: 'Éclair', contactEmail: ' Ana@Test.FR ', contactPhone: '06 11 22 33 44' })
    expect(lead.contactEmailNormalized).toBe('ana@test.fr')
    expect(lead.contactPhoneNormalized).toBe('0611223344')
    expect(lead.companyNormalized).toBe('eclair')
    lead.contactPhone = '+33 7 99 88 77 66'
    await lead.save()
    expect((await Lead.findById(lead._id).lean())?.contactPhoneNormalized).toBe('0799887766')
  })

  it('PATCH admin recalcule les champs normalisés', async () => {
    const lead = await makeLead({ contactEmail: 'old@test.fr' })
    await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ contactEmail: 'NEW@Test.fr' }).expect(200)
    expect((await Lead.findById(lead._id).lean())?.contactEmailNormalized).toBe('new@test.fr')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('migration 008', () => {
  it('remplit les champs absents ou périmés, laisse updatedAt, est idempotente', async () => {
    const a = await makeLead({ company: 'Société A', contactEmail: ' X@Y.fr ', contactPhone: '+33 6 00 00 00 01' })
    const b = await makeLead({ company: 'B' })
    // Simule des leads antérieurs à la migration : champs absents, écriture sans hook.
    await Lead.collection.updateMany({}, { $unset: { contactEmailNormalized: '', contactPhoneNormalized: '', companyNormalized: '' } })
    const before = await Lead.findById(a._id).lean()
    const { backfillLeadDedupFields } = await import('../lib/crmDedupBackfill.js')

    const dry = await backfillLeadDedupFields(true)
    expect(dry).toEqual({ scanned: 2, updated: 2, dryRun: true })
    expect((await Lead.findById(a._id).lean())?.contactEmailNormalized).toBeUndefined()

    const run = await backfillLeadDedupFields(false)
    expect(run).toEqual({ scanned: 2, updated: 2, dryRun: false })
    const after = await Lead.findById(a._id).lean()
    expect(after?.contactEmailNormalized).toBe('x@y.fr')
    expect(after?.contactPhoneNormalized).toBe('0600000001')
    expect(after?.companyNormalized).toBe('societe a')
    expect(after?.updatedAt).toEqual(before?.updatedAt)
    expect((await Lead.findById(b._id).lean())?.companyNormalized).toBe('b')

    const again = await backfillLeadDedupFields(false)
    expect(again.updated).toBe(0)
    const indexes = (await Lead.collection.indexes()).map((i) => Object.keys(i.key).join(','))
    expect(indexes).toEqual(expect.arrayContaining(['contactEmailNormalized', 'contactPhoneNormalized', 'companyNormalized']))
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('POST /check-duplicate', () => {
  const check = (body: Record<string, unknown>) => request(app).post('/api/admin/crm/check-duplicate').send(body)

  it('trouve par e-mail normalisé, sans tenir compte de la casse ni des espaces', async () => {
    await makeLead({ company: 'Autre', contactEmail: ' Ana@Test.FR ' })
    const res = await check({ contactEmail: 'ana@test.fr  ' }).expect(200)
    expect(res.body.duplicates).toHaveLength(1)
  })

  it('trouve par téléphone saisi avec espaces, points ou +33 (comparaison auparavant cassée)', async () => {
    await makeLead({ company: 'Tel', contactPhone: '06 12 34 56 78' })
    for (const phone of ['0612345678', '06.12.34.56.78', '+33 6 12 34 56 78', '0033612345678']) {
      const res = await check({ contactPhone: phone }).expect(200)
      expect(res.body.duplicates, phone).toHaveLength(1)
    }
  })

  it('un téléphone trop court ne sert pas de critère', async () => {
    await makeLead({ contactPhone: '1234567' })
    const res = await check({ contactPhone: '1234567' }).expect(200)
    expect(res.body.duplicates).toHaveLength(0)
  })

  it("trouve par nom d'entreprise normalisé exact (accents, ponctuation) mais pas par préfixe", async () => {
    await makeLead({ company: 'Société Générale' })
    expect((await check({ company: 'SOCIETE GENERALE.' }).expect(200)).body.duplicates).toHaveLength(1)
    expect((await check({ company: 'Société' }).expect(200)).body.duplicates).toHaveLength(0)
  })

  it('respecte les réglages par critère', async () => {
    await resetCrmSettings({ duplicateDetectionEnabled: true, duplicateCheckEmail: false, duplicateCheckCompany: false, duplicateCheckPhone: false })
    await makeLead({ company: 'Acme', contactEmail: 'a@a.fr', contactPhone: '0612345678' })
    const res = await check({ company: 'Acme', contactEmail: 'a@a.fr', contactPhone: '0612345678' }).expect(200)
    expect(res.body.duplicates).toHaveLength(0)
  })

  it('détection désactivée : enabled=false', async () => {
    await resetCrmSettings({ duplicateDetectionEnabled: false })
    const res = await check({ company: 'Domaine Test' }).expect(200)
    expect(res.body).toEqual({ duplicates: [], enabled: false })
  })

  it('exclut excludeId', async () => {
    const lead = await makeLead({ company: 'Acme' })
    expect((await check({ company: 'Acme', excludeId: String(lead._id) }).expect(200)).body.duplicates).toHaveLength(0)
    expect((await check({ company: 'Acme', excludeId: 'pas-un-id' }).expect(200)).body.duplicates).toHaveLength(1)
  })

  it("applique le périmètre dans la requête : la limite ne se perd pas sur des leads invisibles", async () => {
    // 12 doublons d'un collègue, plus récents, puis 1 doublon du manager.
    await makeLead({ company: 'Acme', assignedTo: team.manager.id, createdBy: team.manager.id })
    await Lead.create(
      Array.from({ length: 12 }, () => ({ company: 'Acme', assignedTo: team.admin.id, createdBy: team.admin.id })),
    )
    as(team.manager)
    const res = await check({ company: 'acme' }).expect(200)
    expect(res.body.duplicates).toHaveLength(1)
    as(team.superAdmin)
    expect((await check({ company: 'acme' }).expect(200)).body.duplicates).toHaveLength(10)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('création admin', () => {
  const create = (body: Record<string, unknown>) => request(app).post('/api/admin/crm/leads').send(body)

  it('renvoie la liste des doublons probables sans bloquer', async () => {
    const existing = await makeLead({ company: 'Acme', contactEmail: 'a@acme.fr' })
    const res = await create({ company: 'ACME', contactEmail: 'A@acme.fr' }).expect(201)
    expect(res.body.lead._id).toBeTruthy()
    expect(res.body.duplicates.map((d: { _id: string }) => d._id)).toEqual([String(existing._id)])
    expect(await Lead.countDocuments()).toBe(2)
  })

  it('forme historique { lead } sans doublon : pas de champ duplicates', async () => {
    const res = await create({ company: 'Unique' }).expect(201)
    expect(Object.keys(res.body)).toEqual(['lead'])
  })

  it('duplicateBlockOnCreate : 409 DUPLICATE_LEAD, rien n’est créé', async () => {
    await resetCrmSettings({ duplicateDetectionEnabled: true, duplicateCheckCompany: true, duplicateBlockOnCreate: true })
    await makeLead({ company: 'Acme' })
    const res = await create({ company: 'acme' }).expect(409)
    expect(res.body.code).toBe('DUPLICATE_LEAD')
    expect(res.body.duplicates).toHaveLength(1)
    expect(await Lead.countDocuments()).toBe(1)
    await create({ company: 'Autre société' }).expect(201)
  })

  it('détection désactivée : pas de doublons signalés, même en mode blocage', async () => {
    await resetCrmSettings({ duplicateDetectionEnabled: false, duplicateBlockOnCreate: true })
    await makeLead({ company: 'Acme' })
    const res = await create({ company: 'Acme' }).expect(201)
    expect(res.body).not.toHaveProperty('duplicates')
  })

  it('ne révèle pas les doublons hors périmètre', async () => {
    await makeLead({ company: 'Acme', assignedTo: team.admin.id, createdBy: team.admin.id })
    as(team.manager)
    const res = await create({ company: 'Acme' }).expect(201)
    expect(res.body).not.toHaveProperty('duplicates')
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('formulaire public', () => {
  const post = (payload: Record<string, unknown>) =>
    request(contactApp)
      .post('/api/contact')
      .set('X-Forwarded-For', `203.0.113.${++ipCounter}`)
      .send({
        firstName: 'Ana',
        lastName: 'Dupont',
        email: 'ana@example.test',
        company: 'Nouvelle Société',
        subject: 'Site web',
        message: 'Bonjour',
        consent: true,
        website: '',
        startedAt: Date.now() - 2_000,
        ...payload,
      })

  it('retrouve le lead par e-mail normalisé (casse, espaces) et ne crée rien', async () => {
    await makeLead({ company: 'Historique', contactEmail: ' ANA@Example.TEST ' })
    await post({ email: 'ana@example.test' }).expect(202)
    expect(await Lead.countDocuments()).toBe(1)
  })

  it('retrouve aussi un lead pas encore migré (champ normalisé absent)', async () => {
    const old = await makeLead({ company: 'Historique', contactEmail: ' ANA@Example.TEST ' })
    await Lead.collection.updateOne({ _id: old._id }, { $unset: { contactEmailNormalized: '' } })
    await post({ email: 'ana@example.test' }).expect(202)
    expect(await Lead.countDocuments()).toBe(1)
  })

  it('crée le lead avec ses champs normalisés et consigne un doublon probable (même entreprise) sans refuser', async () => {
    const existing = await makeLead({ company: 'Nouvelle Société', contactEmail: 'autre@example.test' })
    await post({}).expect(202)
    const created = await Lead.findOne({ contactEmail: 'ana@example.test' })
    expect(created?.contactEmailNormalized).toBe('ana@example.test')
    const dup = await LeadActivity.findOne({ leadId: created!._id, type: 'POSSIBLE_DUPLICATE' }).lean()
    expect((dup?.payload as { duplicateIds: string[] }).duplicateIds).toEqual([String(existing._id)])
  })

  it('pas de doublon : pas d’activité POSSIBLE_DUPLICATE', async () => {
    await post({}).expect(202)
    expect(await LeadActivity.countDocuments({ type: 'POSSIBLE_DUPLICATE' })).toBe(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
describe('fusion POST /leads/:id/merge', () => {
  const merge = (targetId: unknown, sourceId: unknown) =>
    request(app).post(`/api/admin/crm/leads/${targetId}/merge`).send({ sourceId: String(sourceId) })

  it('complète la cible, unit les tags, réattache tout, journalise MERGED et supprime la source', async () => {
    const clientId = oid()
    const target = await makeLead({
      company: 'Acme',
      contactEmail: 'a@acme.fr',
      notes: 'note cible',
      tags: ['vip', 'paris'],
      budget: 5000,
      interactionsCount: 1,
    })
    const source = await makeLead({
      company: 'ACME SAS',
      contactEmail: 'autre@acme.fr',
      contactName: 'Jean',
      contactPhone: '06 12 34 56 78',
      budget: 9000,
      notes: 'note source',
      tags: ['paris', 'lyon'],
      sourceDetail: 'salon',
      lastInteractionAt: new Date('2026-05-01'),
    })
    await LeadActivity.create({ leadId: source._id, type: 'NOTE', label: 'Appel', payload: {} })
    await Interaction.create({ subjectType: 'LEAD', subjectId: source._id, kind: 'CALL', occurredAt: new Date(), author: team.superAdmin.id })
    await PersonalTask.create({ title: 'Rappeler', userId: team.superAdmin.id, leadId: source._id } as never)
    await CrmRuleRun.create({ rule: oid(), lead: source._id, eventKey: 'k1', trigger: 'LEAD_CREATED', status: 'OK' } as never)
    const quote = await new QuoteProposal({ leadId: source._id, createdBy: team.superAdmin.id, title: 'Devis', reference: 'D-1' }).save()
    const project = await new Project({ name: 'Projet', client: clientId, sourceLead: source._id } as never).save()

    const res = await merge(target._id, source._id).expect(200)
    expect(String(res.body.lead._id)).toBe(String(target._id))
    expect(res.body.merged.moved).toMatchObject({ activities: 1, interactions: 1, tasks: 1, ruleRuns: 1, quotes: 1, projects: 1 })

    // Source disparue, cible conservée.
    expect(await Lead.findById(source._id)).toBeNull()
    const merged = (await Lead.findById(target._id).lean())!
    // La cible garde ses valeurs...
    expect(merged.company).toBe('Acme')
    expect(merged.contactEmail).toBe('a@acme.fr')
    expect(merged.budget).toBe(5000)
    // ... et se complète.
    expect(merged.contactName).toBe('Jean')
    expect(merged.contactPhone).toBe('06 12 34 56 78')
    expect(merged.contactPhoneNormalized).toBe('0612345678')
    expect(merged.sourceDetail).toBe('salon')
    expect([...merged.tags].sort()).toEqual(['lyon', 'paris', 'vip'])
    expect(merged.notes).toContain('note cible')
    expect(merged.notes).toContain('note source')
    expect(merged.interactionsCount).toBe(2)
    expect(merged.lastInteractionAt).toEqual(new Date('2026-05-01'))

    // Réattachement.
    expect(await Interaction.countDocuments({ subjectType: 'LEAD', subjectId: target._id })).toBe(1)
    expect(await PersonalTask.countDocuments({ leadId: target._id })).toBe(1)
    expect(await CrmRuleRun.countDocuments({ lead: target._id })).toBe(1)
    expect((await QuoteProposal.findById(quote._id).lean())?.leadId).toEqual(target._id)
    expect((await Project.findById(project._id).lean())?.sourceLead).toEqual(target._id)
    expect(await LeadActivity.countDocuments({ leadId: source._id })).toBe(0)

    // Trace.
    const log = await LeadActivity.findOne({ leadId: target._id, type: 'MERGED' }).lean()
    expect(log).toBeTruthy()
    expect((log!.payload as { sourceId: string }).sourceId).toBe(String(source._id))
    expect(String(log!.actorId)).toBe(team.superAdmin.id)
    expect(await LeadActivity.countDocuments({ leadId: target._id, type: 'NOTE' })).toBe(1)
  })

  it('ne change ni le statut de la cible ni ne l’auto-qualifie', async () => {
    const target = await makeLead({ status: 'LEAD' })
    const source = await makeLead({ budget: 9000, source: 'REFERRAL' })
    await merge(target._id, source._id).expect(200)
    expect((await Lead.findById(target._id).lean())?.status).toBe('LEAD')
  })

  it('refuse deux leads gagnés avec des clients différents', async () => {
    const target = await makeLead({ status: 'WON', clientAccountId: oid(), wonProcessedAt: new Date() })
    const source = await makeLead({ status: 'WON', clientAccountId: oid(), wonProcessedAt: new Date() })
    const res = await merge(target._id, source._id).expect(409)
    expect(res.body.code).toBe('MERGE_WON_DIFFERENT_CLIENTS')
    expect(await Lead.countDocuments()).toBe(2)
  })

  it('accepte deux leads gagnés du même client', async () => {
    const client = oid()
    const target = await makeLead({ status: 'WON', clientAccountId: client, wonProcessedAt: new Date() })
    const source = await makeLead({ status: 'WON', clientAccountId: client, wonProcessedAt: new Date() })
    await merge(target._id, source._id).expect(200)
    expect(await Lead.countDocuments()).toBe(1)
  })

  it('refuse d’absorber un lead gagné dans un lead non gagné', async () => {
    const target = await makeLead({ status: 'QUALIFIED' })
    const source = await makeLead({ status: 'WON', clientAccountId: oid(), wonProcessedAt: new Date() })
    const res = await merge(target._id, source._id).expect(409)
    expect(res.body.code).toBe('MERGE_WON_SOURCE')
    expect(await Lead.countDocuments()).toBe(2)
  })

  it('absorbe un lead non gagné dans un lead gagné', async () => {
    const client = oid()
    const target = await makeLead({ status: 'WON', clientAccountId: client, wonProcessedAt: new Date() })
    const source = await makeLead({ status: 'LEAD' })
    await merge(target._id, source._id).expect(200)
    const t = await Lead.findById(target._id).lean()
    expect(t?.status).toBe('WON')
    expect(String(t?.clientAccountId)).toBe(String(client))
  })

  it('refuse un lead fusionné avec lui-même, un sourceId invalide ou inconnu', async () => {
    const lead = await makeLead()
    expect((await merge(lead._id, lead._id).expect(400)).body.code).toBe('MERGE_SAME_LEAD')
    await request(app).post(`/api/admin/crm/leads/${lead._id}/merge`).send({ sourceId: 'x' }).expect(400)
    await request(app).post(`/api/admin/crm/leads/${lead._id}/merge`).send({}).expect(400)
    await merge(lead._id, oid()).expect(404)
    await merge(oid(), lead._id).expect(404)
    expect(await Lead.countDocuments()).toBe(1)
  })

  it('exige manage_crm', async () => {
    const target = await makeLead()
    const source = await makeLead()
    as(team.viewer)
    await merge(target._id, source._id).expect(403)
    expect(await Lead.countDocuments()).toBe(2)
  })

  it('exige le périmètre d’écriture sur les DEUX leads', async () => {
    const mine = await makeLead({ assignedTo: team.manager.id, createdBy: team.manager.id })
    const theirs = await makeLead({ assignedTo: team.admin.id, createdBy: team.admin.id })
    as(team.manager)
    await merge(mine._id, theirs._id).expect(404)
    await merge(theirs._id, mine._id).expect(404)
    expect(await Lead.countDocuments()).toBe(2)
    expect(await LeadActivity.countDocuments({ type: 'MERGED' })).toBe(0)
    // Deux leads dans son périmètre : accepté.
    const mine2 = await makeLead({ assignedTo: team.manager.id, createdBy: team.manager.id })
    await merge(mine._id, mine2._id).expect(200)
  })

  it('un commercial (lecture totale, écriture limitée) ne peut pas fusionner le lead d’un autre', async () => {
    const mine = await makeLead({ assignedTo: team.commercialA.id, createdBy: team.commercialA.id })
    const other = await makeLead({ assignedTo: team.commercialB.id, createdBy: team.commercialB.id })
    as(team.commercialA)
    await merge(mine._id, other._id).expect(404)
    expect(await Lead.countDocuments()).toBe(2)
  })

  it('relancer une fusion interrompue (source encore présente) est sans danger', async () => {
    const target = await makeLead({ tags: ['a'] })
    const source = await makeLead({ tags: ['a', 'b'] })
    await LeadActivity.create({ leadId: source._id, type: 'NOTE', label: 'x', payload: {} })
    const { mergeLeads } = await import('../lib/crmLeadMerge.js')
    await mergeLeads((await Lead.findById(target._id))!, (await Lead.findById(source._id))!, team.superAdmin.id)
    // Source recréée comme si la suppression avait échoué : la seconde passe ne duplique rien.
    const ghost = await Lead.create({ _id: source._id, company: 'Domaine Test', tags: ['b'], createdBy: team.superAdmin.id })
    await mergeLeads((await Lead.findById(target._id))!, ghost, team.superAdmin.id)
    expect([...(await Lead.findById(target._id).lean())!.tags].sort()).toEqual(['a', 'b'])
    expect(await LeadActivity.countDocuments({ leadId: target._id, type: 'NOTE' })).toBe(1)
  })
})
