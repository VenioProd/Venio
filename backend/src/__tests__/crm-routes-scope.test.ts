import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import { asReqUser, resetCrmSettings, seedTeam, type Team, type TeamMember } from './crm-routes-helpers.js'
import { canReadLead, isLeadOutOfScope, leadScopeFilter, readsWholeCrm } from '../lib/crmScope.js'

/**
 * Non-régression du périmètre des leads CRM :
 *   - fonctions pures de lib/crmScope (leadScopeFilter, isLeadOutOfScope, canReadLead, readsWholeCrm) ;
 *   - application du filtre sur une vraie base ;
 *   - effets HTTP sur les routes admin (liste, détail, modification, suppression).
 *
 * Règle figée : en lecture, SUPER_ADMIN et COMMERCIAL voient tout le CRM, les
 * autres rôles les leads qu'ils ont créés ou qui leur sont assignés. En
 * écriture, seul SUPER_ADMIN sort de ce périmètre (le COMMERCIAL n'écrit donc
 * que sur ses leads).
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

function as(member: TeamMember | null): void {
  authState.user = member ? asReqUser(member) : null
}

const fakeReq = (id: string, role: string) => ({ user: { id, role } }) as unknown as Pick<Request, 'user'>

// ───────────────────────────────────────────────────────────────────────────
// Fonctions pures
// ───────────────────────────────────────────────────────────────────────────

describe('crmScope / fonctions pures', () => {
  const ME = '64b000000000000000000001'
  const OTHER = '64b000000000000000000002'

  describe('readsWholeCrm', () => {
    it.each([
      ['SUPER_ADMIN', true],
      ['COMMERCIAL', true],
      ['ADMIN', false],
      ['MANAGER', false],
      ['STAGIAIRE', false],
      ['VIEWER', false],
      ['COMPTABLE', false],
      ['RH', false],
    ])('%s => %s', (role, expected) => {
      expect(readsWholeCrm(fakeReq(ME, role))).toBe(expected)
    })
  })

  describe('leadScopeFilter', () => {
    it.each(['SUPER_ADMIN', 'COMMERCIAL'])('%s : filtre vide (tout le CRM)', (role) => {
      expect(leadScopeFilter(fakeReq(ME, role))).toEqual({})
    })

    it.each(['ADMIN', 'MANAGER', 'STAGIAIRE', 'VIEWER'])('%s : leads assignés ou créés par soi', (role) => {
      expect(leadScopeFilter(fakeReq(ME, role))).toEqual({ $or: [{ assignedTo: ME }, { createdBy: ME }] })
    })
  })

  describe('isLeadOutOfScope (écriture)', () => {
    it('SUPER_ADMIN n\'est jamais hors périmètre', () => {
      expect(isLeadOutOfScope(fakeReq(ME, 'SUPER_ADMIN'), { assignedTo: OTHER, createdBy: OTHER })).toBe(false)
      expect(isLeadOutOfScope(fakeReq(ME, 'SUPER_ADMIN'), {})).toBe(false)
    })

    it.each(['ADMIN', 'MANAGER', 'COMMERCIAL', 'STAGIAIRE'])('%s : dans le périmètre si assigné', (role) => {
      expect(isLeadOutOfScope(fakeReq(ME, role), { assignedTo: ME, createdBy: OTHER })).toBe(false)
    })

    it.each(['ADMIN', 'MANAGER', 'COMMERCIAL', 'STAGIAIRE'])('%s : dans le périmètre si créateur', (role) => {
      expect(isLeadOutOfScope(fakeReq(ME, role), { assignedTo: OTHER, createdBy: ME })).toBe(false)
    })

    it.each(['ADMIN', 'MANAGER', 'COMMERCIAL', 'STAGIAIRE'])('%s : hors périmètre sur le lead d\'un autre', (role) => {
      expect(isLeadOutOfScope(fakeReq(ME, role), { assignedTo: OTHER, createdBy: OTHER })).toBe(true)
    })

    it('un lead sans assigné ni créateur est hors périmètre pour tout sauf SUPER_ADMIN', () => {
      expect(isLeadOutOfScope(fakeReq(ME, 'ADMIN'), {})).toBe(true)
      expect(isLeadOutOfScope(fakeReq(ME, 'COMMERCIAL'), { assignedTo: null, createdBy: null })).toBe(true)
    })

    it('compare les ObjectId par leur forme texte', () => {
      const asObjectIdLike = { toString: () => ME }
      expect(isLeadOutOfScope(fakeReq(ME, 'ADMIN'), { assignedTo: asObjectIdLike })).toBe(false)
    })
  })

  describe('canReadLead', () => {
    it('SUPER_ADMIN et COMMERCIAL lisent tout lead', () => {
      expect(canReadLead(fakeReq(ME, 'SUPER_ADMIN'), { assignedTo: OTHER, createdBy: OTHER })).toBe(true)
      expect(canReadLead(fakeReq(ME, 'COMMERCIAL'), { assignedTo: OTHER, createdBy: OTHER })).toBe(true)
    })

    it('les autres rôles ne lisent que leurs leads', () => {
      expect(canReadLead(fakeReq(ME, 'ADMIN'), { assignedTo: ME })).toBe(true)
      expect(canReadLead(fakeReq(ME, 'ADMIN'), { createdBy: ME })).toBe(true)
      expect(canReadLead(fakeReq(ME, 'ADMIN'), { assignedTo: OTHER, createdBy: OTHER })).toBe(false)
      expect(canReadLead(fakeReq(ME, 'STAGIAIRE'), { assignedTo: OTHER, createdBy: OTHER })).toBe(false)
    })
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Filtre appliqué en base et effets HTTP
// ───────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await setupMongo()
  Lead = (await import('../models/Lead.js')).default
  const { default: crmRoutes } = await import('../routes/admin/crm.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/crm', crmRoutes)
})

afterAll(async () => {
  authState.user = null
  await teardownMongo()
})

/** Quatre leads : un par cas de figure du périmètre de l'administrateur. */
let ids: { mine: string; created: string; assigned: string; foreign: string }

beforeEach(async () => {
  await clearDb()
  team = await seedTeam()
  await resetCrmSettings()
  const mk = async (company: string, createdBy: TeamMember, assignedTo: TeamMember | null) =>
    String((await Lead.create({ company, createdBy: createdBy.id, assignedTo: assignedTo?.id ?? null }))._id)
  ids = {
    mine: await mk('Les deux', team.admin, team.admin), // créé et assigné à l'admin
    created: await mk('Créé seulement', team.admin, team.commercialB), // créé par l'admin, assigné à B
    assigned: await mk('Assigné seulement', team.commercialB, team.admin), // créé par B, assigné à l'admin
    foreign: await mk('Étranger', team.commercialB, team.commercialB), // ni l'un ni l'autre
  }
  as(team.admin)
})

const companies = (body: { leads: { company: string }[] }) => body.leads.map((l) => l.company).sort()

describe('périmètre / filtre appliqué à la base', () => {
  it('leadScopeFilter ne ramène que les leads créés ou assignés', async () => {
    const found = await Lead.find(leadScopeFilter(fakeReq(team.admin.id, 'ADMIN'))).lean()
    expect(found.map((l) => String(l._id)).sort()).toEqual([ids.mine, ids.created, ids.assigned].sort())
  })

  it('le filtre vide ramène tout', async () => {
    expect(await Lead.countDocuments(leadScopeFilter(fakeReq(team.commercialA.id, 'COMMERCIAL')))).toBe(4)
  })
})

describe('périmètre / GET /leads', () => {
  it('SUPER_ADMIN voit les 4 leads', async () => {
    as(team.superAdmin)
    const res = await request(app).get('/api/admin/crm/leads').expect(200)
    expect(res.body.leads).toHaveLength(4)
  })

  it('COMMERCIAL voit les 4 leads, même sans en posséder', async () => {
    as(team.commercialA)
    const res = await request(app).get('/api/admin/crm/leads').expect(200)
    expect(res.body.leads).toHaveLength(4)
  })

  it.each(['admin', 'manager'])('%s ne voit que ses leads (créés ou assignés)', async (who) => {
    // Le manager ne possède aucun lead ; l'admin en possède trois.
    as(team[who]!)
    const res = await request(app).get('/api/admin/crm/leads').expect(200)
    if (who === 'admin') expect(companies(res.body)).toEqual(['Assigné seulement', 'Créé seulement', 'Les deux'])
    else expect(res.body.leads).toEqual([])
  })

  it('STAGIAIRE (lecture seule) accède à la liste, limitée à son périmètre', async () => {
    await Lead.create({ company: 'Du stagiaire', createdBy: team.admin.id, assignedTo: team.stagiaire.id })
    as(team.stagiaire)
    const res = await request(app).get('/api/admin/crm/leads').expect(200)
    expect(companies(res.body)).toEqual(['Du stagiaire'])
  })

  it.each(['viewer', 'comptable', 'externe', 'client'])('403 pour %s', async (who) => {
    as(team[who]!)
    await request(app).get('/api/admin/crm/leads').expect(403)
  })

  it('le filtre ?assignedTo n\'est honoré que pour SUPER_ADMIN', async () => {
    as(team.superAdmin)
    const asSuper = await request(app).get(`/api/admin/crm/leads?assignedTo=${team.commercialB.id}`).expect(200)
    expect(companies(asSuper.body)).toEqual(['Créé seulement', 'Étranger'])

    as(team.commercialA)
    const asCommercial = await request(app).get(`/api/admin/crm/leads?assignedTo=${team.commercialB.id}`).expect(200)
    expect(asCommercial.body.leads).toHaveLength(4)
  })

  it('la recherche reste bornée au périmètre', async () => {
    as(team.admin)
    const res = await request(app).get('/api/admin/crm/leads?search=seulement').expect(200)
    expect(companies(res.body)).toEqual(['Assigné seulement', 'Créé seulement'])
    const outside = await request(app).get('/api/admin/crm/leads?search=Étranger').expect(200)
    expect(outside.body.leads).toEqual([])
  })
})

describe('périmètre / GET /leads/:id', () => {
  it('l\'admin lit un lead dans son périmètre, 404 hors périmètre', async () => {
    const ok = await request(app).get(`/api/admin/crm/leads/${ids.assigned}`).expect(200)
    expect(ok.body.lead.company).toBe('Assigné seulement')
    const ko = await request(app).get(`/api/admin/crm/leads/${ids.foreign}`).expect(404)
    expect(ko.body.error).toBe('Lead not found')
  })

  it('COMMERCIAL et SUPER_ADMIN lisent un lead qui n\'est pas à eux', async () => {
    as(team.commercialA)
    await request(app).get(`/api/admin/crm/leads/${ids.foreign}`).expect(200)
    as(team.superAdmin)
    await request(app).get(`/api/admin/crm/leads/${ids.foreign}`).expect(200)
  })
})

describe('périmètre / PATCH et DELETE', () => {
  it.each([
    ['mine', 200],
    ['created', 200],
    ['assigned', 200],
    ['foreign', 404],
  ] as const)('admin : PATCH lead « %s » => %i', async (key, status) => {
    const res = await request(app).patch(`/api/admin/crm/leads/${ids[key]}`).send({ notes: 'modifié' })
    expect(res.status).toBe(status)
    const inDb = await Lead.findById(ids[key]).lean()
    expect(inDb?.notes === 'modifié').toBe(status === 200)
    if (status === 404) expect(res.body.error).toBe('Lead not found')
  })

  it('COMMERCIAL : lit tout mais n\'écrit que sur ses leads (404 sinon, lead intact)', async () => {
    as(team.commercialA)
    const own = String((await Lead.create({ company: 'À A', createdBy: team.commercialA.id, assignedTo: team.commercialA.id }))._id)
    await request(app).patch(`/api/admin/crm/leads/${own}`).send({ notes: 'ok' }).expect(200)
    await request(app).patch(`/api/admin/crm/leads/${ids.foreign}`).send({ notes: 'intrusion' }).expect(404)
    await request(app).delete(`/api/admin/crm/leads/${ids.foreign}`).expect(404)
    const foreign = await Lead.findById(ids.foreign).lean()
    expect(foreign?.notes ?? '').toBe('')
    await request(app).delete(`/api/admin/crm/leads/${own}`).expect(200)
  })

  it('SUPER_ADMIN écrit sur tout lead', async () => {
    as(team.superAdmin)
    await request(app).patch(`/api/admin/crm/leads/${ids.foreign}`).send({ notes: 'ok' }).expect(200)
    await request(app).delete(`/api/admin/crm/leads/${ids.foreign}`).expect(200)
    expect(await Lead.findById(ids.foreign)).toBeNull()
  })

  it('admin : DELETE d\'un lead hors périmètre => 404, lead conservé ; dans le périmètre => 200', async () => {
    await request(app).delete(`/api/admin/crm/leads/${ids.foreign}`).expect(404)
    expect(await Lead.findById(ids.foreign)).not.toBeNull()
    await request(app).delete(`/api/admin/crm/leads/${ids.created}`).expect(200)
    expect(await Lead.findById(ids.created)).toBeNull()
  })

  it('le stagiaire ne peut rien écrire, même sur son propre lead (manage_crm retiré)', async () => {
    const own = String((await Lead.create({ company: 'Du stagiaire', createdBy: team.stagiaire.id, assignedTo: team.stagiaire.id }))._id)
    as(team.stagiaire)
    await request(app).patch(`/api/admin/crm/leads/${own}`).send({ notes: 'x' }).expect(403)
    await request(app).delete(`/api/admin/crm/leads/${own}`).expect(403)
    expect(await Lead.findById(own)).not.toBeNull()
  })
})
