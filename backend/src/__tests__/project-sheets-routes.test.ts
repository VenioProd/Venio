import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'

const state = vi.hoisted(() => ({ user: null as Request['user'] | null }))
vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, res: Response, next: NextFunction) => {
    if (!state.user) return res.sendStatus(401)
    req.user = state.user
    next()
  },
}))
import ProjectSheet from '../models/ProjectSheet.js'
import User from '../models/User.js'
import Lead from '../models/Lead.js'
import AuditLog from '../models/AuditLog.js'
import Subsidiary from '../models/Subsidiary.js'
import router from '../routes/admin/projectSheets.js'
import { decryptSecret } from '../lib/secretBox.js'

const app = express()
app.use(express.json())
app.use('/api/admin/project-sheets', router)
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => res.status(500).json({ error: err.message }))
const base = '/api/admin/project-sheets'

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'RH', 'COMMERCIAL', 'COMPTABLE', 'VIEWER', 'STAGIAIRE'] as const
const users: Record<string, { id: string; email: string; name: string }> = {}

async function as(role: string) {
  if (!users[role]) {
    const u = await User.create({
      email: `${role.toLowerCase()}@test.local`,
      name: `User ${role}`,
      role,
      passwordHash: 'x',
      twoFactorEnabled: true,
    })
    users[role] = { id: String(u._id), email: u.email, name: u.name }
  }
  state.user = { id: users[role].id, role, email: users[role].email, name: users[role].name } as Request['user']
}

async function seedSheet(extra: Record<string, unknown> = {}) {
  return ProjectSheet.create({ slug: 'arrow', name: 'Arrow', oneLiner: 'SaaS pédagogique', ...extra })
}

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  for (const key of Object.keys(users)) delete users[key]
  await as('SUPER_ADMIN')
})

describe('Fiches projets — droits', () => {
  it('ouvre la lecture à tous les rôles admin et la ferme aux autres', async () => {
    await seedSheet()
    for (const role of ROLES) {
      await as(role)
      const list = await request(app).get(base).expect(200)
      expect(list.body.sheets).toHaveLength(1)
      await request(app).get(`${base}/arrow`).expect(200)
    }
    for (const role of ['CLIENT', 'COMMERCIAL_EXTERNE', 'AGENT']) {
      state.user = { id: new mongoose.Types.ObjectId().toString(), role, email: 'x@test.local', name: 'X' } as Request['user']
      await request(app).get(base).expect(403)
      await request(app).get(`${base}/arrow`).expect(403)
    }
    state.user = null
    await request(app).get(base).expect(401)
  })

  it('réserve l’écriture à SUPER_ADMIN et ADMIN', async () => {
    const sheet = await seedSheet()
    for (const role of ['MANAGER', 'RH', 'COMMERCIAL', 'COMPTABLE', 'VIEWER', 'STAGIAIRE']) {
      await as(role)
      await request(app).post(base).send({ name: 'Nouveau' }).expect(403)
      await request(app).patch(`${base}/${sheet._id}`).send({ whatWeDo: 'x' }).expect(403)
      await request(app).post(`${base}/${sheet._id}/demo-accesses`).send({ role: 'Prof', password: 'p' }).expect(403)
      const detail = await request(app).get(`${base}/arrow`).expect(200)
      expect(detail.body.sheet.canEdit).toBe(false)
      expect(detail.body.sheet.canReveal).toBe(true)
    }
    for (const role of ['SUPER_ADMIN', 'ADMIN']) {
      await as(role)
      await request(app).patch(`${base}/${sheet._id}`).send({ whatWeDo: `par ${role}` }).expect(200)
    }
    const meta = await request(app).get(`${base}/meta`).expect(200)
    expect(meta.body.canEdit).toBe(true)
    expect(meta.body.members.length).toBeGreaterThan(0)
    await as('VIEWER')
    const readerMeta = await request(app).get(`${base}/meta`).expect(200)
    expect(readerMeta.body.canEdit).toBe(false)
    expect(readerMeta.body.members).toBeUndefined()
  })

  it('ne montre le lien vers le dossier filiale qu’au SUPER_ADMIN', async () => {
    const subsidiary = await Subsidiary.create({ name: 'Arrow', slug: 'arrow', createdBy: new mongoose.Types.ObjectId() })
    await seedSheet({ subsidiary: subsidiary._id })
    const sa = await request(app).get(`${base}/arrow`).expect(200)
    expect(sa.body.sheet.subsidiaryHref).toBe(`/admin/filiales/${subsidiary._id}`)
    await as('ADMIN')
    const admin = await request(app).get(`${base}/arrow`).expect(200)
    expect(admin.body.sheet.subsidiaryHref).toBeNull()
    await request(app).patch(`${base}/arrow`).send({ subsidiary: null }).expect(400)
  })
})

describe('Fiches projets — écriture, historique, audit', () => {
  it('crée une fiche, génère un slug unique et l’audite', async () => {
    await seedSheet()
    const res = await request(app).post(base).send({ name: 'Arrow', oneLiner: 'Doublon de nom' }).expect(201)
    expect(res.body.sheet.slug).toBe('arrow-2')
    expect(res.body.sheet.reviewStatus).toBe('TO_COMPLETE')
    expect(res.body.sheet.history[0]).toMatchObject({ summary: 'Création de la fiche', by: { name: 'User SUPER_ADMIN' } })
    const audit = await AuditLog.findOne({ action: 'PROJECT_SHEET_CREATE' }).lean()
    expect(audit?.metadata).toMatchObject({ entityType: 'ProjectSheet', entityRef: 'arrow-2' })
    await request(app).post(base).send({}).expect(400)
  })

  it('n’enregistre que les champs réellement modifiés, avec auteur et date', async () => {
    const sheet = await seedSheet()
    await as('ADMIN')
    const res = await request(app)
      .patch(`${base}/${sheet._id}`)
      .send({ oneLiner: 'SaaS pédagogique', offers: '| Offre | Prix |', slug: 'pirate', demoAccesses: [{ role: 'x' }] })
      .expect(200)
    expect(res.body.sheet.slug).toBe('arrow')
    expect(res.body.sheet.demoAccesses).toEqual([])
    expect(res.body.sheet.history[0]).toMatchObject({ fields: ['offers'], by: { name: 'User ADMIN' } })
    const audit = await AuditLog.findOne({ action: 'PROJECT_SHEET_UPDATE' }).lean()
    expect(audit?.metadata).toMatchObject({ fields: ['offers'], entityRef: 'arrow' })
    expect(String(audit?.userId)).toBe(users.ADMIN.id)
    // Aucune modification : ni historique ni audit supplémentaires.
    await request(app).patch(`${base}/${sheet._id}`).send({ offers: '| Offre | Prix |' }).expect(200)
    expect(await AuditLog.countDocuments({ action: 'PROJECT_SHEET_UPDATE' })).toBe(1)
  })

  it('refuse une édition concurrente (baseUpdatedAt périmé)', async () => {
    const sheet = await seedSheet()
    const first = await request(app).get(`${base}/arrow`).expect(200)
    const baseUpdatedAt = first.body.sheet.updatedAt
    await request(app).patch(`${base}/${sheet._id}`).send({ roadmap: 'A', baseUpdatedAt }).expect(200)
    const conflict = await request(app).patch(`${base}/${sheet._id}`).send({ roadmap: 'B', baseUpdatedAt }).expect(409)
    expect(conflict.body.code).toBe('SHEET_CONFLICT')
    expect((await ProjectSheet.findById(sheet._id).lean())?.roadmap).toBe('A')
  })

  it.each([
    { status: 'INVALIDE' },
    { legalEntity: 'YUMI' },
    { websites: [{ label: 'x', url: 'javascript:alert(1)' }] },
    { links: [{ label: 'x', url: 'ftp://x.fr' }] },
    { logoUrl: 'data:image/png;base64,AAAA' },
    { accentColor: 'red' },
    { oneLiner: 'x'.repeat(301) },
    { whatWeDo: 'x'.repeat(20_001) },
    { whatWeDo: 42 },
    { referent: 'pas-un-id' },
    { name: '   ' },
  ])('rejette une valeur invalide %o', async (body) => {
    const sheet = await seedSheet()
    await request(app).patch(`${base}/${sheet._id}`).send(body).expect(400)
  })

  it('n’accepte que des membres internes dans l’équipe', async () => {
    const sheet = await seedSheet()
    const client = await User.create({ email: 'client@test.local', name: 'Client', role: 'CLIENT', passwordHash: 'x' })
    await request(app)
      .patch(`${base}/${sheet._id}`)
      .send({ team: [{ user: String(client._id), role: 'Testeur' }] })
      .expect(400)
    await as('VIEWER')
    await as('SUPER_ADMIN')
    const res = await request(app)
      .patch(`${base}/${sheet._id}`)
      .send({ referent: users.SUPER_ADMIN.id, team: [{ user: users.VIEWER.id, role: 'Lecture' }] })
      .expect(200)
    expect(res.body.sheet.referent).toMatchObject({ name: 'User SUPER_ADMIN' })
    expect(res.body.sheet.team[0]).toMatchObject({ role: 'Lecture', user: { name: 'User VIEWER', role: 'VIEWER' } })
  })

  it('relie la fiche aux leads du CRM de son entité, pour qui lit le CRM', async () => {
    await seedSheet({ legalEntity: 'VENIO', leadProject: 'ARTOSERA' })
    const lead = { contactName: 'Galerie', contactEmail: 'g@test.local', company: 'Galerie' }
    await Lead.create([
      { ...lead, project: 'ARTOSERA', entity: 'VENIO', status: 'LEAD' },
      { ...lead, project: 'ARTOSERA', entity: 'VENIO', status: 'WON' },
      { ...lead, project: 'ARROW', entity: 'ARROW', status: 'LEAD' },
      { ...lead, project: 'ARTOSERA', entity: 'VENIO', status: 'LEAD', archivedAt: new Date() },
    ])
    const res = await request(app).get(`${base}/arrow`).expect(200)
    expect(res.body.sheet.crm).toEqual({
      entity: 'VENIO',
      leadProject: 'ARTOSERA',
      openLeads: 1,
      wonLeads: 1,
      href: '/admin/crm?entity=VENIO&project=ARTOSERA',
    })
    await as('COMPTABLE')
    const noCrm = await request(app).get(`${base}/arrow`).expect(200)
    expect(noCrm.body.sheet.crm).toBeNull()
  })
})

describe('Fiches projets — recherche plein texte', () => {
  it('trouve dans les sections, sans accent ni casse, et renvoie des extraits', async () => {
    await seedSheet({ glossary: '**Cohorte** : groupe d’apprenants suivant un même parcours.' })
    await ProjectSheet.create({ slug: 'decisio', name: 'Decisio', whatWeDo: 'Formations pour avocats indépendants' })
    const res = await request(app).get(base).query({ q: 'COHORTE apprenants' }).expect(200)
    expect(res.body.sheets.map((s: { slug: string }) => s.slug)).toEqual(['arrow'])
    expect(res.body.sheets[0].matches[0]).toMatchObject({ field: 'glossary' })
    expect(res.body.sheets[0].matches[0].excerpt).toContain('Cohorte')
    const accents = await request(app).get(base).query({ q: 'independants' }).expect(200)
    expect(accents.body.sheets.map((s: { slug: string }) => s.slug)).toEqual(['decisio'])
    const none = await request(app).get(base).query({ q: 'introuvable' }).expect(200)
    expect(none.body.sheets).toEqual([])
  })

  it('n’indexe jamais les accès démo', async () => {
    const sheet = await seedSheet()
    await request(app)
      .post(`${base}/${sheet._id}/demo-accesses`)
      .send({ url: 'https://demo.arrow.test', role: 'Formateur', username: 'demo-formateur@arrow.test', password: 'Secret-Demo-42' })
      .expect(201)
    for (const q of ['demo-formateur', 'Secret-Demo-42', 'demo.arrow.test', 'Formateur']) {
      const res = await request(app).get(base).query({ q }).expect(200)
      expect(res.body.sheets, q).toEqual([])
    }
  })

  it('exclut les fiches archivées sauf demande', async () => {
    await seedSheet({ archived: true })
    expect((await request(app).get(base).expect(200)).body.sheets).toEqual([])
    expect((await request(app).get(base).query({ archived: 'true' }).expect(200)).body.sheets).toHaveLength(1)
  })
})

describe('Fiches projets — accès démo', () => {
  async function addAccess(sheetId: unknown, password = 'Demo-Pass-123') {
    const res = await request(app)
      .post(`${base}/${sheetId}/demo-accesses`)
      .send({ url: 'https://demo.arrow.test', role: 'Directeur', username: 'directeur@demo.test', password, notes: 'Jeu fictif' })
      .expect(201)
    return res.body.demoAccesses.at(-1)._id as string
  }

  it('chiffre le mot de passe au repos', async () => {
    const sheet = await seedSheet()
    await addAccess(sheet._id)
    const raw = await mongoose.connection.collection('projectsheets').findOne({ _id: sheet._id })
    const stored = raw?.demoAccesses[0].passwordEnc as string
    expect(stored.startsWith('v1:')).toBe(true)
    expect(stored).not.toContain('Demo-Pass-123')
    expect(JSON.stringify(raw)).not.toContain('Demo-Pass-123')
    expect(decryptSecret(stored)).toBe('Demo-Pass-123')
    // Exclu des lectures par défaut du modèle.
    const plain = await ProjectSheet.findById(sheet._id).lean()
    expect(plain?.demoAccesses[0]).not.toHaveProperty('passwordEnc')
  })

  it('n’expose jamais le mot de passe dans la liste, la fiche ni les réponses d’écriture', async () => {
    const sheet = await seedSheet()
    const create = await request(app)
      .post(`${base}/${sheet._id}/demo-accesses`)
      .send({ role: 'Élève', username: 'eleve@demo.test', password: 'Demo-Pass-123' })
      .expect(201)
    const accessId = create.body.demoAccesses[0]._id
    const patch = await request(app)
      .patch(`${base}/${sheet._id}/demo-accesses/${accessId}`)
      .send({ notes: 'Modifié' })
      .expect(200)
    const responses = [
      create.body,
      patch.body,
      (await request(app).get(base).expect(200)).body,
      (await request(app).get(`${base}/arrow`).expect(200)).body,
      (await request(app).patch(`${base}/${sheet._id}`).send({ roadmap: 'Phase 2' }).expect(200)).body,
    ]
    for (const body of responses) {
      const json = JSON.stringify(body)
      expect(json).not.toContain('Demo-Pass-123')
      expect(json).not.toContain('passwordEnc')
      expect(json).not.toContain('v1:')
    }
    expect(create.body.demoAccesses[0]).toMatchObject({ hasPassword: true, username: 'eleve@demo.test' })
    expect((await request(app).get(base).expect(200)).body.sheets[0]).not.toHaveProperty('demoAccesses')
  })

  it('conserve le mot de passe quand on modifie un autre accès ou un champ vide', async () => {
    const sheet = await seedSheet()
    const first = await addAccess(sheet._id, 'Premier-1')
    const second = await addAccess(sheet._id, 'Second-2')
    await request(app).patch(`${base}/${sheet._id}/demo-accesses/${second}`).send({ password: '', notes: 'x' }).expect(200)
    await request(app).delete(`${base}/${sheet._id}/demo-accesses/${second}`).expect(200)
    await request(app).patch(`${base}/${sheet._id}`).send({ whatWeDo: 'Texte' }).expect(200)
    const reveal = await request(app).post(`${base}/${sheet._id}/demo-accesses/${first}/reveal`).expect(200)
    expect(reveal.body.password).toBe('Premier-1')
  })

  it('révèle aux membres internes, jamais aux clients ni commerciaux externes, et journalise', async () => {
    const sheet = await seedSheet()
    const accessId = await addAccess(sheet._id)
    for (const role of ROLES) {
      await as(role)
      const res = await request(app).post(`${base}/${sheet._id}/demo-accesses/${accessId}/reveal`).expect(200)
      expect(res.body.password).toBe('Demo-Pass-123')
      expect(res.headers['cache-control']).toBe('no-store')
    }
    for (const role of ['CLIENT', 'COMMERCIAL_EXTERNE', 'AGENT']) {
      state.user = { id: new mongoose.Types.ObjectId().toString(), role, email: 'x@test.local', name: 'X' } as Request['user']
      await request(app).post(`${base}/${sheet._id}/demo-accesses/${accessId}/reveal`).expect(403)
    }
    const reveals = await AuditLog.find({ action: 'PROJECT_SHEET_DEMO_ACCESS_REVEAL' }).lean()
    expect(reveals).toHaveLength(ROLES.length)
    expect(reveals.map((a) => String(a.userId)).sort()).toEqual(ROLES.map((r) => users[r].id).sort())
    expect(reveals[0].metadata).toMatchObject({ accessId, accessRole: 'Directeur', entityRef: 'arrow' })
    expect(JSON.stringify(reveals)).not.toContain('Demo-Pass-123')
    await as('ADMIN')
    await request(app).post(`${base}/${sheet._id}/demo-accesses/${new mongoose.Types.ObjectId()}/reveal`).expect(404)
  })

  it('audite ajout, modification et suppression ; l’historique ne note que « accès démo modifié »', async () => {
    const sheet = await seedSheet()
    await as('ADMIN')
    const accessId = await addAccess(sheet._id)
    await request(app).patch(`${base}/${sheet._id}/demo-accesses/${accessId}`).send({ password: 'Nouveau-9' }).expect(200)
    await request(app).delete(`${base}/${sheet._id}/demo-accesses/${accessId}`).expect(200)
    const actions = (await AuditLog.find({ action: /DEMO_ACCESS/ }).sort({ createdAt: 1 }).lean()).map((a) => a.action)
    expect(actions).toEqual([
      'PROJECT_SHEET_DEMO_ACCESS_CREATE',
      'PROJECT_SHEET_DEMO_ACCESS_UPDATE',
      'PROJECT_SHEET_DEMO_ACCESS_DELETE',
    ])
    const update = await AuditLog.findOne({ action: 'PROJECT_SHEET_DEMO_ACCESS_UPDATE' }).lean()
    expect(update?.metadata.fields).toEqual(['password'])
    const all = JSON.stringify(await AuditLog.find({}).lean())
    expect(all).not.toContain('Demo-Pass-123')
    expect(all).not.toContain('Nouveau-9')
    const detail = await request(app).get(`${base}/arrow`).expect(200)
    const demoEntries = detail.body.sheet.history.filter((h: { fields: string[] }) => h.fields.includes('demoAccesses'))
    expect(demoEntries).toHaveLength(3)
    for (const entry of demoEntries) expect(entry.summary).toBe('accès démo modifié')
    expect(JSON.stringify(detail.body.sheet.history)).not.toContain('directeur@demo.test')
  })

  it('refuse un accès vide et un mot de passe non textuel', async () => {
    const sheet = await seedSheet()
    await request(app).post(`${base}/${sheet._id}/demo-accesses`).send({ notes: 'rien' }).expect(400)
    await request(app).post(`${base}/${sheet._id}/demo-accesses`).send({ role: 'x', password: 123 }).expect(400)
    await request(app).post(`${base}/${sheet._id}/demo-accesses`).send({ role: 'x', url: 'javascript:alert(1)' }).expect(400)
  })
})
