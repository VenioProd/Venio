import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminCrmRoutes from '../routes/admin/crm.js'
import Interaction from '../models/Interaction.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'

/**
 * `GET /api/admin/crm/pilotage/call-activity` : appels par jour de Paris sur
 * 14 jours et part de décrochés, sur le périmètre du pilotage ; jamais les
 * appels d'un externe sur une fiche non transmise.
 */
const app = express()
app.use(express.json())
app.use('/api/admin/crm', adminCrmRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

type Who = { id: string; cookie: string }
let rep: Who
let admin: Who // lit tout le CRM
let com: Who // stagiaire : lit ses fiches seulement
let restricted: Who // lit tout le CRM, entité Arrow seulement

const activity = async (who: Who, query = '') => {
  const res = await request(app).get(`/api/admin/crm/pilotage/call-activity${query}`).set('Cookie', who.cookie)
  expect(res.status).toBe(200)
  return res.body as {
    days: Array<{ day: string; calls: number; reached: number }>
    calls: number
    reached: number
    reachedRate: number | null
  }
}
const dayOf = (body: Awaited<ReturnType<typeof activity>>, day: string) => body.days.find((row) => row.day === day)

const lead = (owner: Who, company: string, extra: object = {}) =>
  Lead.create({ company, assignedTo: owner.id, createdBy: owner.id, ...extra })
const logged = (author: Who, target: { _id: unknown }, outcome: string, occurredAt: string) =>
  Interaction.create({
    subjectType: 'LEAD',
    subjectId: target._id,
    kind: 'CALL',
    direction: 'OUT',
    occurredAt: new Date(occurredAt),
    outcome,
    author: author.id,
  })

beforeAll(async () => {
  await setupMongo()
})
afterAll(teardownMongo)
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-14T10:30:00+01:00') })
  await clearDb()
  const roles = [
    ['Rita', 'COMMERCIAL_EXTERNE', []],
    ['Alice', 'ADMIN', []],
    ['Sam', 'STAGIAIRE', []],
    ['Rose', 'ADMIN', ['ARROW']],
  ] as const
  const who: Who[] = []
  for (const [name, role, crmEntities] of roles) {
    const user = await User.create({
      name,
      email: `${name.toLowerCase()}@equipe.test`,
      passwordHash: 'unused',
      role,
      crmEntities,
    })
    who.push({ id: String(user._id), cookie: `venio_session=${(await createSession(String(user._id))).token}` })
  }
  ;[rep, admin, com, restricted] = who as [Who, Who, Who, Who]
})
afterEach(() => {
  vi.useRealTimers()
})

it('compte l’équipe et les fiches transmises, jamais un externe sur une fiche non transmise', async () => {
  const alices = await lead(admin, 'Menuiserie Dubreuil', { entity: 'VENIO' })
  const carls = await lead(com, 'Garage Lambert', { entity: 'VENIO' })
  const arrow = await lead(admin, 'Lycée Arrow', { project: 'ARROW', entity: 'ARROW' })
  const listed = await lead(rep, 'Auto-école Horizon', { externalRep: rep.id, callList: 'Liste Rita' })
  // Fiche d'un externe hors liste : visible de l'équipe, mais ses appels à lui restent les siens.
  const unlisted = await lead(rep, 'Boulangerie Petit', { externalRep: rep.id })
  const handed = await lead(rep, 'Cabinet Durand', {
    externalRep: rep.id,
    callList: 'Liste Rita',
    closingHandoff: { at: new Date(), to: admin.id, by: rep.id },
  })

  await logged(admin, alices, 'MEETING_BOOKED', '2026-11-14T09:00:00+01:00')
  await logged(admin, alices, 'NO_ANSWER', '2026-11-14T00:10:00+01:00') // la veille en UTC
  await logged(com, carls, 'CALLBACK', '2026-11-13T15:00:00+01:00')
  await logged(admin, arrow, 'VOICEMAIL', '2026-11-01T11:00:00+01:00') // premier des 14 jours
  await logged(admin, arrow, 'CALLBACK', '2026-10-31T23:30:00+01:00') // hors fenêtre
  await logged(rep, listed, 'MEETING_BOOKED', '2026-11-14T08:00:00+01:00')
  await logged(rep, unlisted, 'MEETING_BOOKED', '2026-11-14T08:05:00+01:00')
  await logged(admin, unlisted, 'NOT_INTERESTED', '2026-11-14T08:10:00+01:00')
  await logged(rep, handed, 'CALLBACK', '2026-11-12T10:00:00+01:00')

  const whole = await activity(admin)
  expect(whole.days).toHaveLength(14)
  expect(whole.days[0]).toEqual({ day: '2026-11-01', calls: 1, reached: 0 })
  expect(whole.days[13]).toEqual({ day: '2026-11-14', calls: 3, reached: 2 })
  expect(dayOf(whole, '2026-11-13')).toEqual({ day: '2026-11-13', calls: 1, reached: 1 })
  expect(dayOf(whole, '2026-11-12')).toEqual({ day: '2026-11-12', calls: 1, reached: 1 })
  expect(whole).toMatchObject({ calls: 6, reached: 4, reachedRate: 67 })
  expect(Object.keys(whole).sort()).toEqual(['calls', 'days', 'reached', 'reachedRate'])

  // Entité : seulement ses fiches.
  expect(await activity(admin, '?entity=ARROW')).toMatchObject({ calls: 1, reached: 0 })
  // Lecteur restreint à une entité : la même réponse, quoi qu'il demande.
  expect(await activity(restricted)).toMatchObject({ calls: 1, reached: 0 })
  expect(await activity(restricted, '?entity=VENIO')).toMatchObject({ calls: 0, reachedRate: null })
  // Lecteur limité à ses fiches : leurs appels seulement.
  expect(await activity(com)).toMatchObject({ calls: 1, reached: 1 })
  // L'externe n'a pas accès au pilotage de l'équipe.
  expect((await request(app).get('/api/admin/crm/pilotage/call-activity').set('Cookie', rep.cookie)).status).toBe(403)
})
