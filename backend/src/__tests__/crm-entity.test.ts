import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { asReqUser, resetCrmSettings, seedTeam, type Team, type TeamMember } from './crm-routes-helpers.js'
import {
  applyEntityQuery,
  canReadLead,
  crmEntityRestriction,
  isLeadOutOfScope,
  leadScopeFilter,
  leadWriteScopeFilter,
  readsUnrestrictedCrm,
  resolveWriteEntity,
} from '../lib/crmScope.js'
import { entityCondition, entityFromProject, leadEntityOf, normalizeEntityList } from '../lib/groupEntities.js'
import { normalizeLeadPatch } from '../lib/crmLeadService.js'

/**
 * Chantier 3A — entité du groupe sur les leads :
 *   - fonctions pures (déduction depuis le projet, périmètre par entité) ;
 *   - migration 007 (rattrapage idempotent, jamais d'écrasement) ;
 *   - routes admin : périmètre de lecture et d'écriture par entité, filtres
 *     ?entity= (liste, pipeline, worklist, pilotage, export) ;
 *   - session : le périmètre est relu à chaque requête.
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

function as(member: TeamMember | null, crmEntities?: string[]): void {
  authState.user = member ? { ...asReqUser(member), ...(crmEntities ? { crmEntities } : {}) } : null
}

const fakeReq = (id: string, role: string, crmEntities?: string[]) =>
  ({ user: { id, role, crmEntities } }) as unknown as Pick<Request, 'user'>

const ME = '64b000000000000000000001'

// ───────────────────────────────────────────────────────────────────────────
// Fonctions pures
// ───────────────────────────────────────────────────────────────────────────

describe('groupEntities / fonctions pures', () => {
  it.each([
    ['ARROW', 'ARROW'],
    ['VENIO', 'VENIO'],
    ['ARTOSERA', 'VENIO'],
    ['VIGNO', 'VENIO'],
    ['AUTRE', 'VENIO'],
    ['', 'VENIO'],
    [undefined, 'VENIO'],
  ])('projet %s → entité %s', (project, entity) => {
    expect(entityFromProject(project)).toBe(entity)
  })

  it('normalizeEntityList garde les valeurs connues, sans doublon, dans l’ordre du groupe', () => {
    expect(normalizeEntityList(['ARROW', 'X', 'VENIO', 'ARROW'])).toEqual(['VENIO', 'ARROW'])
    expect(normalizeEntityList('ARROW')).toEqual([])
  })

  it('entityCondition : VENIO couvre aussi les leads sans entité', () => {
    expect(entityCondition(['VENIO'])).toEqual({ $in: ['VENIO', null] })
    expect(entityCondition(['ARROW'])).toEqual({ $in: ['ARROW'] })
    expect(leadEntityOf({})).toBe('VENIO')
    expect(leadEntityOf({ entity: 'DECISIO' })).toBe('DECISIO')
  })

  it('normalizeLeadPatch accepte une entité connue et ignore une valeur inconnue', () => {
    expect(normalizeLeadPatch({ entity: 'CREATIO' }).entity).toBe('CREATIO')
    expect('entity' in normalizeLeadPatch({ entity: 'NOPE' })).toBe(false)
    expect('entity' in normalizeLeadPatch({})).toBe(false)
  })
})

describe('crmScope / périmètre par entité', () => {
  it('liste vide ou absente : comportement inchangé', () => {
    expect(leadScopeFilter(fakeReq(ME, 'COMMERCIAL', []))).toEqual({})
    expect(leadScopeFilter(fakeReq(ME, 'ADMIN'))).toEqual({ $or: [{ assignedTo: ME }, { createdBy: ME }] })
    expect(crmEntityRestriction(fakeReq(ME, 'COMMERCIAL', []))).toBeNull()
    expect(readsUnrestrictedCrm(fakeReq(ME, 'COMMERCIAL'))).toBe(true)
  })

  it('SUPER_ADMIN n’est jamais restreint', () => {
    const req = fakeReq(ME, 'SUPER_ADMIN', ['ARROW'])
    expect(crmEntityRestriction(req)).toBeNull()
    expect(leadScopeFilter(req)).toEqual({})
    expect(leadWriteScopeFilter(req)).toEqual({})
    expect(isLeadOutOfScope(req, { entity: 'VENIO' })).toBe(false)
  })

  it('liste non vide : lecture et écriture restreintes, en plus des règles de rôle', () => {
    const commercial = fakeReq(ME, 'COMMERCIAL', ['ARROW'])
    expect(leadScopeFilter(commercial)).toEqual({ entity: { $in: ['ARROW'] } })
    expect(readsUnrestrictedCrm(commercial)).toBe(false)
    expect(leadWriteScopeFilter(commercial)).toEqual({
      $or: [{ assignedTo: ME }, { createdBy: ME }],
      entity: { $in: ['ARROW'] },
    })
    const manager = fakeReq(ME, 'MANAGER', ['VENIO'])
    expect(leadScopeFilter(manager)).toEqual({
      $or: [{ assignedTo: ME }, { createdBy: ME }],
      entity: { $in: ['VENIO', null] },
    })
    expect(canReadLead(commercial, { entity: 'ARROW' })).toBe(true)
    expect(canReadLead(commercial, { entity: 'VENIO' })).toBe(false)
    expect(canReadLead(commercial, {})).toBe(false)
    // Même son propre lead, hors entité, n'est plus modifiable.
    expect(isLeadOutOfScope(commercial, { assignedTo: ME, entity: 'VENIO' })).toBe(true)
    expect(isLeadOutOfScope(commercial, { assignedTo: ME, entity: 'ARROW' })).toBe(false)
  })

  it('applyEntityQuery croise ?entity= avec le périmètre', () => {
    const free: Record<string, unknown> = {}
    applyEntityQuery(fakeReq(ME, 'SUPER_ADMIN'), free, 'DECISIO')
    expect(free.entity).toEqual({ $in: ['DECISIO'] })
    const ignored: Record<string, unknown> = {}
    applyEntityQuery(fakeReq(ME, 'SUPER_ADMIN'), ignored, 'NOPE')
    expect(ignored).toEqual({})
    const outside = leadScopeFilter(fakeReq(ME, 'COMMERCIAL', ['ARROW']))
    applyEntityQuery(fakeReq(ME, 'COMMERCIAL', ['ARROW']), outside, 'VENIO')
    expect(outside.entity).toEqual({ $in: [] })
  })

  it('resolveWriteEntity : entité déduite, à défaut la première du périmètre ; refus hors périmètre', () => {
    const req = fakeReq(ME, 'COMMERCIAL', ['CREATIO', 'ARROW'])
    const arrow: Record<string, unknown> = { project: 'ARROW' }
    expect(resolveWriteEntity(req, arrow)).toBe(true)
    expect(arrow.entity).toBe('ARROW')
    const plain: Record<string, unknown> = {}
    expect(resolveWriteEntity(req, plain)).toBe(true)
    expect(plain.entity).toBe('CREATIO')
    expect(resolveWriteEntity(req, { entity: 'VENIO' })).toBe(false)
    const untouched: Record<string, unknown> = {}
    expect(resolveWriteEntity(req, untouched, { entity: 'ARROW' })).toBe(true)
    expect(untouched.entity).toBeUndefined()
    expect(resolveWriteEntity(fakeReq(ME, 'COMMERCIAL'), { entity: 'VENIO' })).toBe(true)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Base de données
// ───────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  const { default: crmExtras } = await import('../routes/admin/crmExtras.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', crmExtras)
  app.use('/api/admin/crm', crmRoutes)
})

afterAll(async () => {
  await teardownMongo()
})

beforeEach(async () => {
  await clearDb()
  await resetCrmSettings()
  team = await seedTeam()
  authState.user = null
})

describe('migration 007 / entité déduite du projet', () => {
  it('pose l’entité des leads qui n’en ont pas, sans écraser ni toucher updatedAt ; idempotente', async () => {
    const { backfillLeadEntities } = await import('../lib/crmEntityBackfill.js')
    const old = new Date('2026-01-01T00:00:00Z')
    const raw = (company: string, extra: Record<string, unknown>) => ({
      company,
      status: 'LEAD',
      createdAt: old,
      updatedAt: old,
      ...extra,
    })
    await Lead.collection.insertMany([
      raw('Arrow', { project: 'ARROW' }),
      raw('Artosera', { project: 'ARTOSERA' }),
      raw('Vigno', { project: 'VIGNO' }),
      raw('Autre', { project: 'AUTRE' }),
      raw('Venio', { project: 'VENIO' }),
      raw('Vide', { project: '' }),
      raw('Sans projet', {}),
      raw('Null', { project: 'ARROW', entity: null }),
      raw('Déjà posée', { project: 'ARROW', entity: 'CREATIO' }),
    ])

    expect(await backfillLeadEntities(true)).toEqual({ arrow: 2, venio: 6, dryRun: true })
    expect(await Lead.countDocuments({ entity: { $exists: true, $ne: null } })).toBe(1)

    expect(await backfillLeadEntities()).toEqual({ arrow: 2, venio: 6, dryRun: false })
    const byCompany = Object.fromEntries((await Lead.find().lean()).map((lead) => [lead.company, lead]))
    expect(byCompany['Arrow']!.entity).toBe('ARROW')
    expect(byCompany['Null']!.entity).toBe('ARROW')
    for (const company of ['Artosera', 'Vigno', 'Autre', 'Venio', 'Vide', 'Sans projet']) {
      expect(byCompany[company]!.entity).toBe('VENIO')
    }
    expect(byCompany['Déjà posée']!.entity).toBe('CREATIO')
    expect(new Date(byCompany['Arrow']!.updatedAt).toISOString()).toBe(old.toISOString())

    expect(await backfillLeadEntities()).toEqual({ arrow: 0, venio: 0, dryRun: false })
    const indexes = await Lead.collection.indexes()
    expect(indexes.some((index) => JSON.stringify(index.key) === JSON.stringify({ entity: 1, status: 1 }))).toBe(true)
  })
})

describe('création de lead / entité par défaut', () => {
  it('sans entité : VENIO, ou ARROW pour un lead du projet Arrow ; une entité explicite est gardée', async () => {
    as(team.superAdmin)
    const plain = await request(app).post('/api/admin/crm/leads').send({ company: 'Simple' }).expect(201)
    expect(plain.body.lead.entity).toBe('VENIO')
    const artosera = await request(app).post('/api/admin/crm/leads').send({ company: 'Musée', project: 'ARTOSERA' }).expect(201)
    expect(artosera.body.lead.entity).toBe('VENIO')
    const arrow = await request(app).post('/api/admin/crm/leads').send({ company: 'École', project: 'ARROW' }).expect(201)
    expect(arrow.body.lead.entity).toBe('ARROW')
    const explicit = await request(app)
      .post('/api/admin/crm/leads')
      .send({ company: 'Cabinet', project: 'ARROW', entity: 'DECISIO' })
      .expect(201)
    expect(explicit.body.lead.entity).toBe('DECISIO')
  })

  it('entité inconnue : 400', async () => {
    as(team.superAdmin)
    const res = await request(app).post('/api/admin/crm/leads').send({ company: 'X', entity: 'NOPE' }).expect(400)
    expect(res.body.error).toBe('Entité invalide')
    await request(app).post('/api/admin/crm/leads').send({ company: 'X', entity: '' }).expect(201)
  })

  it('PATCH change l’entité ; une modification sans entité ne la touche pas', async () => {
    as(team.superAdmin)
    const lead = await Lead.create({ company: 'Mobile', project: 'ARROW', entity: 'ARROW', createdBy: team.superAdmin.id })
    const moved = await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ entity: 'FORMATIO' }).expect(200)
    expect(moved.body.lead.entity).toBe('FORMATIO')
    const other = await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ notes: 'n', project: 'VIGNO' }).expect(200)
    expect(other.body.lead.entity).toBe('FORMATIO')
    await request(app).patch(`/api/admin/crm/leads/${lead._id}`).send({ entity: 'NOPE' }).expect(400)
  })
})

describe('routes admin / périmètre par entité', () => {
  async function seedLeads() {
    const mk = (company: string, entity: string, owner: TeamMember) =>
      Lead.create({ company, entity, createdBy: owner.id, assignedTo: owner.id, budget: 1000 })
    const arrowA = await mk('Arrow A', 'ARROW', team.commercialA)
    const venioA = await mk('Venio A', 'VENIO', team.commercialA)
    const arrowB = await mk('Arrow B', 'ARROW', team.commercialB)
    const decisioB = await mk('Decisio B', 'DECISIO', team.commercialB)
    // Lead antérieur à la migration : sans entité, il compte comme VENIO.
    const legacy = await Lead.collection.insertOne({
      company: 'Ancien',
      status: 'LEAD',
      createdBy: null,
      assignedTo: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    return { arrowA, venioA, arrowB, decisioB, legacyId: String(legacy.insertedId) }
  }

  const companies = (leads: Array<{ company: string }>) => leads.map((lead) => lead.company).sort()
  const pipelineCompanies = (body: { columns: Array<{ leads: Array<{ company: string }> }> }) =>
    companies(body.columns.flatMap((column) => column.leads))

  it('sans restriction : le commercial lit tout (inchangé)', async () => {
    await seedLeads()
    as(team.commercialA, [])
    const res = await request(app).get('/api/admin/crm/leads').expect(200)
    expect(res.body.leads).toHaveLength(5)
  })

  it('commercial restreint à ARROW : liste, pipeline, worklist et pilotage limités à Arrow', async () => {
    await seedLeads()
    await Lead.updateMany({}, { $set: { nextActionAt: new Date(Date.now() - 86_400_000) } })
    as(team.commercialA, ['ARROW'])
    const list = await request(app).get('/api/admin/crm/leads').expect(200)
    expect(companies(list.body.leads)).toEqual(['Arrow A', 'Arrow B'])
    const pipeline = await request(app).get('/api/admin/crm/pipeline').expect(200)
    expect(pipelineCompanies(pipeline.body)).toEqual(['Arrow A', 'Arrow B'])
    const worklist = await request(app).get('/api/admin/crm/worklist').expect(200)
    expect(companies(worklist.body.groups.overdue)).toEqual(['Arrow A', 'Arrow B'])
    const pilotage = await request(app).get('/api/admin/crm/pilotage').expect(200)
    expect(pilotage.body.funnel.total).toBe(2)
    expect(pilotage.body.entity).toBeNull()
    // Une entité hors périmètre ne renvoie rien, même demandée explicitement.
    expect((await request(app).get('/api/admin/crm/leads?entity=VENIO').expect(200)).body.leads).toEqual([])
    expect((await request(app).get('/api/admin/crm/pilotage?entity=VENIO').expect(200)).body.funnel.total).toBe(0)
  })

  it('commercial restreint : détail et modification d’un lead hors entité → 404 ; déplacer hors périmètre → 403', async () => {
    const { venioA, arrowA } = await seedLeads()
    as(team.commercialA, ['ARROW'])
    await request(app).get(`/api/admin/crm/leads/${venioA._id}`).expect(404)
    await request(app).get(`/api/admin/crm/leads/${venioA._id}/activities`).expect(404)
    await request(app).patch(`/api/admin/crm/leads/${venioA._id}`).send({ notes: 'x' }).expect(404)
    await request(app).delete(`/api/admin/crm/leads/${venioA._id}`).expect(404)
    await request(app).get(`/api/admin/crm/leads/${arrowA._id}`).expect(200)
    const moved = await request(app).patch(`/api/admin/crm/leads/${arrowA._id}`).send({ entity: 'VENIO' }).expect(403)
    expect(moved.body.code).toBe('LEAD_ENTITY_FORBIDDEN')
    expect((await Lead.findById(arrowA._id).lean())!.entity).toBe('ARROW')
    expect((await Lead.findById(venioA._id).lean())!.notes).toBe('')
  })

  it('commercial restreint : création dans son périmètre uniquement', async () => {
    as(team.commercialA, ['ARROW'])
    const created = await request(app).post('/api/admin/crm/leads').send({ company: 'Nouveau' }).expect(201)
    expect(created.body.lead.entity).toBe('ARROW')
    const refused = await request(app).post('/api/admin/crm/leads').send({ company: 'Ailleurs', entity: 'DECISIO' }).expect(403)
    expect(refused.body.code).toBe('LEAD_ENTITY_FORBIDDEN')
    expect(await Lead.countDocuments({ company: 'Ailleurs' })).toBe(0)
  })

  it('restriction VENIO : couvre les leads sans entité', async () => {
    const { legacyId } = await seedLeads()
    as(team.commercialA, ['VENIO'])
    const list = await request(app).get('/api/admin/crm/leads').expect(200)
    expect(companies(list.body.leads)).toEqual(['Ancien', 'Venio A'])
    await request(app).get(`/api/admin/crm/leads/${legacyId}`).expect(200)
  })

  it('SUPER_ADMIN : jamais restreint, et ?entity= filtre liste, pipeline, worklist et pilotage', async () => {
    await seedLeads()
    await Lead.updateMany({}, { $set: { nextActionAt: new Date(Date.now() - 86_400_000) } })
    as(team.superAdmin, ['ARROW'])
    expect((await request(app).get('/api/admin/crm/leads').expect(200)).body.leads).toHaveLength(5)
    const decisio = await request(app).get('/api/admin/crm/leads?entity=DECISIO').expect(200)
    expect(companies(decisio.body.leads)).toEqual(['Decisio B'])
    const venio = await request(app).get('/api/admin/crm/leads?entity=VENIO').expect(200)
    expect(companies(venio.body.leads)).toEqual(['Ancien', 'Venio A'])
    const unknown = await request(app).get('/api/admin/crm/leads?entity=NOPE').expect(200)
    expect(unknown.body.leads).toHaveLength(5)

    const pipeline = await request(app).get('/api/admin/crm/pipeline?entity=ARROW').expect(200)
    expect(pipelineCompanies(pipeline.body)).toEqual(['Arrow A', 'Arrow B'])

    const worklist = await request(app).get('/api/admin/crm/worklist?entity=DECISIO').expect(200)
    expect(companies(worklist.body.groups.overdue)).toEqual(['Decisio B'])

    expect((await request(app).get('/api/admin/crm/pilotage').expect(200)).body.funnel.total).toBe(5)
    const arrow = await request(app).get('/api/admin/crm/pilotage?entity=ARROW').expect(200)
    expect(arrow.body.entity).toBe('ARROW')
    expect(arrow.body.funnel.total).toBe(2)
    expect(arrow.body.revenue.declaredBudget).toBe(2000)
    expect((await request(app).get('/api/admin/crm/pilotage?entity=VENIO').expect(200)).body.funnel.total).toBe(2)
    expect((await request(app).get('/api/admin/crm/pilotage?entity=CREATIO').expect(200)).body.funnel.total).toBe(0)
  })

  it('actions groupées : un lead hors entité est introuvable pour le commercial restreint', async () => {
    const { arrowA, venioA } = await seedLeads()
    as(team.commercialA, ['ARROW'])
    const res = await request(app)
      .post('/api/admin/crm/leads/bulk')
      .send({ ids: [String(arrowA._id), String(venioA._id)], action: 'tag', payload: { tag: 'vu' } })
      .expect(200)
    expect(res.body.ok).toBe(1)
    expect((await Lead.findById(venioA._id).lean())!.tags).toEqual([])
    expect((await Lead.findById(arrowA._id).lean())!.tags).toEqual(['vu'])
  })

  it('export CSV : colonne Entité par défaut, filtre ?entity= borné au périmètre', async () => {
    await seedLeads()
    as(team.superAdmin)
    const all = await request(app).get('/api/admin/crm/leads/export').expect(200)
    const header = all.text.split('\r\n')[0]!.split(';')
    expect(header).toContain('Entité')
    expect(header.indexOf('Entité')).toBe(header.indexOf('Plateforme') + 1)
    expect(all.text).toContain('DECISIO')
    const arrow = await request(app).get('/api/admin/crm/leads/export?entity=ARROW&columns=company,entity').expect(200)
    expect(arrow.text.split('\r\n').slice(1).sort()).toEqual(['Arrow A;ARROW', 'Arrow B;ARROW'])
    const legacy = await request(app).get('/api/admin/crm/leads/export?entity=VENIO&columns=company,entity').expect(200)
    expect(legacy.text.split('\r\n').slice(1).sort()).toEqual(['Ancien;VENIO', 'Venio A;VENIO'])

    as(team.commercialA, ['ARROW'])
    const outside = await request(app).get('/api/admin/crm/leads/export?entity=DECISIO&columns=company').expect(200)
    expect(outside.text.split('\r\n')).toHaveLength(1)
    const mine = await request(app).get('/api/admin/crm/leads/export?columns=company').expect(200)
    expect(mine.text.split('\r\n').slice(1).sort()).toEqual(['Arrow A', 'Arrow B'])
  })
})

describe('session / périmètre relu à chaque requête', () => {
  it('authenticateSession expose crmEntities, absent quand la liste est vide', async () => {
    const { createSession, authenticateSession } = await import('../lib/session.js')
    const { default: User } = await import('../models/User.js')
    await User.updateOne({ _id: team.commercialA.id }, { $set: { crmEntities: ['ARROW'] } })
    const restricted = await createSession(team.commercialA.id)
    expect((await authenticateSession(restricted.token))!.crmEntities).toEqual(['ARROW'])
    const free = await createSession(team.commercialB.id)
    expect((await authenticateSession(free.token))!.crmEntities).toBeUndefined()
  })

  it('le modèle User refuse une entité inconnue', async () => {
    const { default: User } = await import('../models/User.js')
    const user = new User({ email: 'x@y.z', passwordHash: 'x', name: 'x', role: 'COMMERCIAL', crmEntities: ['NOPE'] })
    expect(user.validateSync()?.errors['crmEntities.0']).toBeDefined()
  })
})
