import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import adminCallDeskRoutes from '../routes/admin/callDesk.js'
import CallScript from '../models/CallScript.js'
import CrmSettings from '../models/CrmSettings.js'
import User from '../models/User.js'

/** Textes des scripts d'appel : l'équipe écrit (MANAGE_CRM), tout lecteur du poste d'appel lit. */
const app = express()
app.use(express.json())
app.use('/api/commercial', commercialRoutes)
app.use('/api/admin/call-desk', adminCallDeskRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

type Who = { id: string; cookie: string }
let rep: Who // commercial externe
let otherRep: Who // un autre commercial externe
let admin: Who // MANAGE_CRM
let stagiaire: Who // VIEW_CRM sans MANAGE_CRM
let compta: Who // ni l'un ni l'autre

const at = (space: 'team' | 'rep', who: Who) => {
  const base = space === 'team' ? '/api/admin/call-desk' : '/api/commercial'
  return {
    get: (path: string) => request(app).get(`${base}${path}`).set('Cookie', who.cookie),
    put: (path: string, body: object) => request(app).put(`${base}${path}`).set('Cookie', who.cookie).send(body),
    post: (path: string, body: object) => request(app).post(`${base}${path}`).set('Cookie', who.cookie).send(body),
  }
}
const write = (who: Who, tag: string, title = 'Ouverture', body = 'Bonjour, c’est Venio.') =>
  at('team', who).put('/calls/scripts', { tag, title, body })

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all([CallScript, CrmSettings].map((model) => (model as typeof CallScript).init()))
})
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  const roles = [
    ['Rita', 'COMMERCIAL_EXTERNE'],
    ['Rémi', 'COMMERCIAL_EXTERNE'],
    ['Alice', 'ADMIN'],
    ['Sam', 'STAGIAIRE'],
    ['Cécile', 'COMPTABLE'],
  ] as const
  const who: Who[] = []
  for (const [name, role] of roles) {
    const user = await User.create({ name, email: `${name.toLowerCase()}@equipe.test`, passwordHash: 'unused', role })
    who.push({ id: String(user._id), cookie: `venio_session=${(await createSession(String(user._id))).token}` })
  }
  ;[rep, otherRep, admin, stagiaire, compta] = who as [Who, Who, Who, Who, Who]
  await CrmSettings.updateSettings({ callScriptTags: ['DEFAULT', 'RELANCE'] } as never)
})

it('lecture : tout lecteur du poste d’appel voit tous les scripts, sous la même forme ; sans VIEW_CRM rien', async () => {
  const saved = await write(
    admin,
    'DEFAULT',
    'Ouverture',
    'Bonjour, c’est Venio.\nJe vous appelle au sujet de votre site.',
  )
  expect(saved.status).toBe(200)

  const expected = [
    {
      tag: 'DEFAULT',
      title: 'Ouverture',
      body: 'Bonjour, c’est Venio.\nJe vous appelle au sujet de votre site.',
      updatedAt: saved.body.script.updatedAt,
    },
    { tag: 'RELANCE', title: null, body: null, updatedAt: null },
  ]
  for (const [space, who] of [
    ['team', admin],
    ['team', stagiaire],
    ['rep', rep],
    ['rep', otherRep],
  ] as const) {
    const res = await at(space, who).get('/calls/scripts')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ scripts: expected })
  }
  expect((await at('team', compta).get('/calls/scripts')).status).toBe(403)
  expect((await at('team', compta).get('/calls/scripts')).body).not.toHaveProperty('scripts')
  expect((await request(app).get('/api/admin/call-desk/calls/scripts')).status).toBe(401)
  expect((await request(app).get('/api/commercial/calls/scripts')).status).toBe(401)
})

it('écriture : l’équipe avec MANAGE_CRM remplace le texte ; ni l’externe, ni VIEW_CRM seul, ni un autre rôle', async () => {
  expect((await write(admin, 'DEFAULT', 'Version 1', 'Premier texte')).status).toBe(200)
  const second = await write(admin, 'DEFAULT', 'Version 2', 'Second texte')
  expect(second.body.script).toMatchObject({ tag: 'DEFAULT', title: 'Version 2', body: 'Second texte' })
  expect(await CallScript.countDocuments()).toBe(1)
  expect(String((await CallScript.findOne({ tag: 'DEFAULT' }))!.updatedBy)).toBe(admin.id)

  // L'externe lit mais ne modifie pas, ni par l'espace commercial ni par celui de l'équipe.
  const body = { tag: 'DEFAULT', title: 'Détourné', body: 'Texte de l’externe' }
  expect((await at('rep', rep).put('/calls/scripts', body)).status).toBe(403)
  expect((await at('team', rep).put('/calls/scripts', body)).status).toBe(403)
  expect((await write(stagiaire, 'DEFAULT', 'Détourné')).status).toBe(403)
  expect((await write(compta, 'DEFAULT', 'Détourné')).status).toBe(403)
  expect((await CallScript.findOne({ tag: 'DEFAULT' }))!.title).toBe('Version 2')
})

it('une étiquette ajoutée par un externe est dans la liste de tous, sans texte ; seule l’équipe l’écrit', async () => {
  const added = await at('rep', rep).post('/calls/script-tags', { tag: 'SALON' })
  expect(added.status).toBe(201)

  const seen = await at('team', admin).get('/calls/scripts')
  expect(seen.body.scripts.map((s: { tag: string }) => s.tag)).toEqual(['DEFAULT', 'RELANCE', 'SALON'])
  expect(seen.body.scripts[2]).toEqual({ tag: 'SALON', title: null, body: null, updatedAt: null })
  expect((await at('rep', otherRep).get('/calls/scripts')).body.scripts).toHaveLength(3)

  expect((await at('rep', rep).put('/calls/scripts', { tag: 'SALON', title: 'x', body: 'y' })).status).toBe(403)
  expect((await write(admin, 'SALON', 'Salon', 'Texte du salon')).status).toBe(200)
  expect((await at('rep', rep).get('/calls/scripts')).body.scripts[2]).toMatchObject({
    tag: 'SALON',
    body: 'Texte du salon',
  })
})

it('validation : étiquette inconnue, titre ou texte vides ou trop longs, texte jamais interprété', async () => {
  expect((await write(admin, 'INCONNU')).status).toBe(404)
  expect((await write(admin, 'default')).status).toBe(404)
  expect((await at('team', admin).put('/calls/scripts', { tag: ['DEFAULT'], title: 'x', body: 'y' })).status).toBe(400)
  expect((await write(admin, 'DEFAULT', '   ')).status).toBe(400)
  expect((await write(admin, 'DEFAULT', 'x'.repeat(121))).status).toBe(400)
  expect((await write(admin, 'DEFAULT', 'Titre', '  \n ')).status).toBe(400)
  expect((await write(admin, 'DEFAULT', 'Titre', 'x'.repeat(5001))).status).toBe(400)
  expect(
    (await at('team', admin).put('/calls/scripts', { tag: 'DEFAULT', title: 'Titre', body: { $ne: 1 } })).status,
  ).toBe(400)
  expect(await CallScript.countDocuments()).toBe(0)

  expect((await write(admin, 'DEFAULT', 'x'.repeat(120), 'y'.repeat(5000))).status).toBe(200)
  const html = await write(admin, 'RELANCE', 'Titre', '<img src=x onerror=alert(1)>\r\nSuite')
  expect(html.body.script.body).toBe('<img src=x onerror=alert(1)>\nSuite')
})
