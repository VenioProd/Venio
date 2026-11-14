import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminCallDeskRoutes from '../routes/admin/callDesk.js'
import commercialRoutes from '../routes/commercial/index.js'
import Interaction from '../models/Interaction.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'

/**
 * Séance du jour (`GET /api/admin/call-desk/session`, `GET /api/commercial/session`) et catégories de la file
 * (`GET /calls/queue?category=`, `counts`) du poste d'appel de l'équipe.
 */
const app = express()
app.use(express.json())
app.use('/api/admin/call-desk', adminCallDeskRoutes)
app.use('/api/commercial', commercialRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

type Who = { id: string; cookie: string }
let rep: Who // commercial externe
let admin: Who // écrit sur tout le CRM
let com: Who // commercial interne : écrit sur ses fiches seulement
let stagiaire: Who // VIEW_CRM sans MANAGE_CRM

const get = (who: Who, path: string) => request(app).get(`/api/admin/call-desk${path}`).set('Cookie', who.cookie)

let phone = 0
const teamLead = (owner: Who, company: string, extra: object = {}) =>
  Lead.create({
    company,
    businessContact: true,
    contactPhone: `+336111111${String(++phone).padStart(2, '0')}`,
    assignedTo: owner.id,
    createdBy: owner.id,
    ...extra,
  })
const repListLead = (company: string, extra: object = {}) =>
  Lead.create({
    company,
    businessContact: true,
    contactPhone: `+336333333${String(++phone).padStart(2, '0')}`,
    externalRep: rep.id,
    callList: 'Liste Rita',
    assignedTo: rep.id,
    createdBy: rep.id,
    ...extra,
  })
const handOff = (lead: { _id: unknown }) =>
  Lead.updateOne({ _id: lead._id }, { $set: { closingHandoff: { at: new Date(), to: admin.id, by: rep.id } } })

/** Appel consigné (comme `quick-call`) par `author`. */
const logged = (author: Who, lead: { _id: unknown }, outcome: string, occurredAt: string) =>
  Interaction.create({
    subjectType: 'LEAD',
    subjectId: lead._id,
    kind: 'CALL',
    direction: 'OUT',
    occurredAt: new Date(occurredAt),
    outcome,
    author: author.id,
  })

beforeAll(async () => {
  await setupMongo()
  await Lead.init()
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-14T10:30:00+01:00') })
  await clearDb()
  const roles = [
    ['Rita', 'COMMERCIAL_EXTERNE'],
    ['Alice', 'ADMIN'],
    ['Carl', 'COMMERCIAL'],
    ['Sam', 'STAGIAIRE'],
  ] as const
  const who: Who[] = []
  for (const [name, role] of roles) {
    const user = await User.create({ name, email: `${name.toLowerCase()}@equipe.test`, passwordHash: 'unused', role })
    who.push({ id: String(user._id), cookie: `venio_session=${(await createSession(String(user._id))).token}` })
  }
  ;[rep, admin, com, stagiaire] = who as [Who, Who, Who, Who]
})
afterEach(() => {
  vi.useRealTimers()
})

it('séance : ses appels du jour de Paris, sur son périmètre, et rien d’autre', async () => {
  const mine = await teamLead(admin, 'Menuiserie Dubreuil')
  // Jour de Paris : 00 h 10 compte (23 h 10 UTC la veille), 23 h 30 la veille non.
  await logged(admin, mine, 'NO_ANSWER', '2026-11-14T00:10:00+01:00')
  await logged(admin, mine, 'CALLBACK', '2026-11-14T09:00:00+01:00')
  await logged(admin, mine, 'MEETING_BOOKED', '2026-11-14T09:30:00+01:00')
  await logged(admin, mine, 'VOICEMAIL', '2026-11-14T10:00:00+01:00')
  await logged(admin, mine, 'MEETING_BOOKED', '2026-11-13T23:30:00+01:00')
  // Un autre membre, sur la fiche d'Alice comme sur la sienne.
  const carls = await teamLead(com, 'Garage Lambert')
  await logged(com, carls, 'MEETING_BOOKED', '2026-11-14T09:15:00+01:00')
  await logged(com, mine, 'CALLBACK', '2026-11-14T09:20:00+01:00')
  // L'externe, sur une liste non transmise puis sur une fiche transmise.
  const listed = await repListLead('Auto-école Horizon')
  await logged(rep, listed, 'MEETING_BOOKED', '2026-11-14T08:00:00+01:00')
  const handed = await repListLead('Cabinet Durand')
  await handOff(handed)
  await logged(rep, handed, 'MEETING_BOOKED', '2026-11-14T08:30:00+01:00')
  // Une note n'est pas un appel.
  await Interaction.create({ subjectType: 'LEAD', subjectId: mine._id, kind: 'NOTE', author: admin.id })

  const forAdmin = await get(admin, '/session')
  expect(forAdmin.status).toBe(200)
  expect(forAdmin.body).toEqual({
    day: '2026-11-14',
    calls: 4,
    reached: 2,
    meetings: 1,
    conversionRate: 50,
    targetConversionRate: 40,
  })

  // Carl : son appel sur sa fiche ; celui passé sur la fiche d'Alice sort avec le périmètre.
  const forCarl = (await get(com, '/session')).body
  expect(forCarl).toMatchObject({ calls: 1, reached: 1, meetings: 1, conversionRate: 100 })

  // Sans appel : zéros, conversion inconnue.
  expect((await get(stagiaire, '/session')).body).toMatchObject({ calls: 0, reached: 0, conversionRate: null })
  // Le routeur de l'équipe reste fermé à l'externe.
  expect((await get(rep, '/session')).status).toBe(403)
})

it('séance du commercial externe : ses appels du jour sur ses fiches, transmises comprises', async () => {
  const listed = await repListLead('Auto-école Horizon')
  const handed = await repListLead('Cabinet Durand')
  await handOff(handed)
  await logged(rep, listed, 'NO_ANSWER', '2026-11-14T08:00:00+01:00')
  await logged(rep, listed, 'CALLBACK', '2026-11-14T08:10:00+01:00')
  await logged(rep, handed, 'MEETING_BOOKED', '2026-11-14T08:30:00+01:00')
  // Hors séance : la veille, l'appel du closer sur la fiche transmise, un appel à lui sur une fiche de l'équipe.
  await logged(rep, listed, 'MEETING_BOOKED', '2026-11-13T18:00:00+01:00')
  await logged(admin, handed, 'MEETING_BOOKED', '2026-11-14T09:00:00+01:00')
  await logged(rep, await teamLead(admin, 'Menuiserie Dubreuil'), 'MEETING_BOOKED', '2026-11-14T09:10:00+01:00')

  const res = await request(app).get('/api/commercial/session').set('Cookie', rep.cookie)
  expect(res.status).toBe(200)
  expect(res.body).toEqual({
    day: '2026-11-14',
    calls: 3,
    reached: 2,
    meetings: 1,
    conversionRate: 50,
    targetConversionRate: 40,
  })
  // L'espace du commercial reste fermé à l'équipe.
  expect((await request(app).get('/api/commercial/session').set('Cookie', admin.cookie)).status).toBe(403)
})

it('file : catégories et compteurs sur le même périmètre et les mêmes filtres, ordre inchangé', async () => {
  const past = new Date('2026-11-13T09:00:00+01:00')
  const callback = await teamLead(admin, 'A rappeler', { nextActionAt: past, project: 'ARROW' })
  const never = await teamLead(admin, 'Jamais appelée', { project: 'ARROW' })
  const voicemail = await teamLead(admin, 'Répondeur', { lastCallAt: past, lastCallOutcome: 'VOICEMAIL' })
  const other = await teamLead(admin, 'Pas de réponse', { lastCallAt: past, lastCallOutcome: 'NO_ANSWER' })
  // Hors de la file : relance future, fiche de Carl (« mes fiches »), liste d'un externe non transmise.
  await teamLead(admin, 'Plus tard', { nextActionAt: new Date('2026-11-20T09:00:00+01:00') })
  const carls = await teamLead(com, 'Garage Lambert')
  await repListLead('Auto-école Horizon', { assignedTo: admin.id })
  // Transmise au closer : appelable par l'équipe.
  const handed = await repListLead('Cabinet Durand', { assignedTo: admin.id })
  await handOff(handed)

  const queue = async (who: Who, query = '') => {
    const res = await get(who, `/calls/queue${query}`)
    expect(res.status).toBe(200)
    return {
      ids: (res.body.leads as Array<{ _id: string }>).map((lead) => String(lead._id)),
      counts: res.body.counts as Record<string, number> | undefined,
    }
  }

  const all = await queue(admin)
  const ordered = [callback, never, handed, voicemail, other].map((lead) => String(lead._id))
  expect(all.ids).toEqual(ordered)
  expect(all.counts).toEqual({ all: 5, callback: 1, never: 2, other: 2 })

  // Chaque catégorie : le sous-ensemble de la file, dans son ordre ; les compteurs ne bougent pas.
  for (const [category, expected] of [
    ['callback', [callback]],
    ['never', [never, handed]],
    ['other', [voicemail, other]],
  ] as const) {
    const res = await queue(admin, `?category=${category}`)
    expect(res.ids).toEqual(expected.map((lead) => String(lead._id)))
    expect(res.counts).toEqual(all.counts)
  }
  expect((await get(admin, '/calls/queue?category=tout')).status).toBe(400)

  // Mêmes filtres que la file : projet, puis tout le périmètre.
  expect((await queue(admin, '?project=ARROW')).counts).toEqual({ all: 2, callback: 1, never: 1, other: 0 })
  const wide = await queue(admin, '?mine=0')
  expect(wide.ids).toContain(String(carls._id))
  expect(wide.counts).toEqual({ all: 6, callback: 1, never: 3, other: 2 })
  // Carl : sa seule fiche, aucune de celles d'Alice ni de l'externe.
  expect((await queue(com, '?mine=0')).counts).toEqual({ all: 1, callback: 0, never: 1, other: 0 })

  // Pages suivantes : pas de compteurs, la catégorie suit le curseur.
  const first = await get(admin, '/calls/queue?limit=1&category=never')
  const second = await get(admin, `/calls/queue?limit=1&category=never&cursor=${first.body.nextCursor}`)
  expect(second.body.leads.map((lead: { _id: string }) => String(lead._id))).toEqual([String(handed._id)])
  expect(second.body.counts).toBeUndefined()
})
