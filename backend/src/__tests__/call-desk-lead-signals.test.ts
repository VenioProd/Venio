import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminCallDeskRoutes from '../routes/admin/callDesk.js'
import Call from '../models/Call.js'
import CallAnalysis, { type CallAnalysisStatus } from '../models/CallAnalysis.js'
import Interaction from '../models/Interaction.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'

/**
 * Signaux d'appel du pipeline de l'équipe (`GET /lead-signals`) et contrôle
 * d'appel de la fiche (`GET /leads/:id/call-check`) : périmètre de la liste,
 * règle exacte de `GET /pending` pour les analyses, et jamais l'appel d'un
 * externe sur une fiche qu'il n'a pas transmise.
 */
const app = express()
app.use(express.json())
app.use('/api/admin/call-desk', adminCallDeskRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

type Who = { id: string; cookie: string }
let rep: Who // commercial externe
let admin: Who // lit et écrit tout le CRM
let com: Who // commercial interne : lit tout, écrit ses fiches
let stagiaire: Who // VIEW_CRM sans MANAGE_CRM, ne lit que ses fiches

const get = (who: Who, path: string) => request(app).get(`/api/admin/call-desk${path}`).set('Cookie', who.cookie)
const signals = async (who: Who, leads: { _id: unknown }[]) => {
  const res = await get(who, `/lead-signals?ids=${leads.map((lead) => String(lead._id)).join(',')}`)
  expect(res.status).toBe(200)
  return res.body as { analysisReady: string[]; voicemail: string[] }
}

const teamLead = (owner: Who, company: string, extra: object = {}) =>
  Lead.create({
    company,
    businessContact: true,
    contactPhone: '+33611111111',
    assignedTo: owner.id,
    createdBy: owner.id,
    ...extra,
  })
const repListLead = (company: string) =>
  Lead.create({
    company,
    businessContact: true,
    contactPhone: '+33633333333',
    externalRep: rep.id,
    callList: 'Liste Rita',
    assignedTo: rep.id,
    createdBy: rep.id,
  })
const handOff = (lead: { _id: unknown }) =>
  Lead.updateOne({ _id: lead._id }, { $set: { closingHandoff: { at: new Date(), to: admin.id, by: rep.id } } })

let attemptNo = 0
async function analysis(author: Who, lead: { _id: unknown }, status: CallAnalysisStatus = 'READY') {
  const call = await Call.create({
    lead: lead._id,
    author: author.id,
    to: '+33611111111',
    from: '+33180000000',
    clientRequestId: crypto.randomUUID(),
    attemptDay: '2026-11-13',
    attemptNo: ++attemptNo,
    status: 'COMPLETED',
  })
  await CallAnalysis.create({
    call: call._id,
    lead: lead._id,
    author: author.id,
    status,
    output: {
      summary: 'Résumé',
      suggestedOutcome: null,
      optOut: { detected: false, quote: '', quoteVerified: false },
      fields: [],
      heat: { score: 40, level: 'TIEDE', criteria: [] },
      actions: [],
    },
    callDate: new Date('2026-11-13T09:07:00+01:00'),
    purgeAt: new Date(Date.now() + 365 * 86400_000),
  })
}

/** Résultat d'appel consigné, comme `POST /leads/:id/quick-call`. */
const outcome = (author: Who, lead: { _id: unknown }, value: string, occurredAt: string) =>
  Interaction.create({
    subjectType: 'LEAD',
    subjectId: lead._id,
    kind: 'CALL',
    direction: 'OUT',
    outcome: value,
    occurredAt: new Date(occurredAt),
    author: author.id,
  })

beforeAll(async () => {
  await setupMongo()
  await Promise.all([Lead, Call, CallAnalysis, Interaction].map((model) => (model as typeof Lead).init()))
})
afterAll(teardownMongo)
beforeEach(async () => {
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

it('analyse à valider : la règle de /pending, limitée aux fiches demandées', async () => {
  const mine = await teamLead(admin, 'Menuiserie Dubreuil')
  await analysis(admin, mine)
  const applied = await teamLead(admin, 'Déjà relue')
  await analysis(admin, applied, 'APPLIED')
  const carls = await teamLead(com, 'Garage Lambert')
  await analysis(com, carls)
  const listed = await repListLead('Auto-école Horizon')
  await analysis(rep, listed)
  const handed = await repListLead('Cabinet Durand')
  await analysis(rep, handed)
  await handOff(handed)
  const all = [mine, applied, carls, listed, handed]

  expect((await signals(admin, all)).analysisReady.sort()).toEqual([String(mine._id), String(handed._id)].sort())
  expect((await signals(com, all)).analysisReady).toEqual([String(carls._id)])
  // Seulement les fiches demandées.
  expect((await signals(admin, [carls, handed])).analysisReady).toEqual([String(handed._id)])
  // Sans MANAGE_CRM, rien à valider.
  expect((await signals(stagiaire, all)).analysisReady).toEqual([])
})

it('répondeur : dernier résultat d’appel lisible ; l’appel d’un externe ne compte que sur une fiche transmise', async () => {
  const voicemail = await teamLead(admin, 'Répondeur')
  await outcome(admin, voicemail, 'NO_ANSWER', '2026-11-12T10:00:00+01:00')
  await outcome(admin, voicemail, 'VOICEMAIL', '2026-11-13T10:00:00+01:00')
  // Rappelé ensuite : le répondeur n'est plus le dernier résultat.
  const reached = await teamLead(admin, 'Joint ensuite')
  await outcome(admin, reached, 'VOICEMAIL', '2026-11-12T10:00:00+01:00')
  await outcome(com, reached, 'CALLBACK', '2026-11-13T10:00:00+01:00')
  // Le résultat d'un autre membre compte, comme dans l'historique de la fiche.
  const carls = await teamLead(com, 'Garage Lambert')
  await outcome(com, carls, 'VOICEMAIL', '2026-11-13T10:00:00+01:00')
  // Fiche de l'équipe créditée à l'externe : son appel n'apparaît pas tant qu'elle n'est pas transmise.
  const credited = await teamLead(admin, 'Cabinet Durand', { externalRep: rep.id })
  await outcome(admin, credited, 'NO_ANSWER', '2026-11-12T10:00:00+01:00')
  await outcome(rep, credited, 'VOICEMAIL', '2026-11-13T10:00:00+01:00')
  // Liste d'un externe non transmise : hors de la liste de l'équipe.
  const listed = await repListLead('Auto-école Horizon')
  await outcome(rep, listed, 'VOICEMAIL', '2026-11-13T10:00:00+01:00')
  const all = [voicemail, reached, carls, credited, listed]

  expect((await signals(admin, all)).voicemail.sort()).toEqual([String(voicemail._id), String(carls._id)].sort())
  await handOff(credited)
  await handOff(listed)
  expect((await signals(admin, all)).voicemail.sort()).toEqual(
    [String(voicemail._id), String(carls._id), String(credited._id), String(listed._id)].sort(),
  )
  // Le stagiaire ne lit que ses fiches.
  expect((await signals(stagiaire, all)).voicemail).toEqual([])
})

it('forme et gardes : identifiants seuls, 100 au plus, l’externe n’entre pas', async () => {
  const mine = await teamLead(admin, 'Menuiserie Dubreuil')
  await analysis(admin, mine)
  await outcome(admin, mine, 'VOICEMAIL', '2026-11-13T10:00:00+01:00')
  expect(await signals(admin, [mine])).toEqual({ analysisReady: [String(mine._id)], voicemail: [String(mine._id)] })
  expect((await get(admin, '/lead-signals')).body).toEqual({ analysisReady: [], voicemail: [] })
  expect((await get(admin, '/lead-signals?ids=pas-un-id')).status).toBe(400)
  const many = Array.from({ length: 101 }, (_, index) => index.toString(16).padStart(24, '0')).join(',')
  expect((await get(admin, `/lead-signals?ids=${many}`)).status).toBe(400)
  expect((await get(rep, `/lead-signals?ids=${mine._id}`)).status).toBe(403)
  expect((await request(app).get(`/api/admin/call-desk/lead-signals?ids=${mine._id}`)).status).toBe(401)
})

it('call-check : pays, fuseaux et blocage d’une fiche de la liste, 404 au-delà', async () => {
  const mine = await teamLead(admin, 'Menuiserie Dubreuil', { businessContact: false })
  const listed = await repListLead('Auto-école Horizon')

  const res = await get(com, `/leads/${mine._id}/call-check`)
  expect(res.status).toBe(200)
  expect(res.body).toEqual({ callCheck: { country: 'FR', timeZones: ['Europe/Paris'], block: 'NOT_BUSINESS_CONTACT' } })
  // Hors de la liste : liste d'un externe non transmise, fiche d'un autre pour qui ne lit que les siennes.
  expect((await get(admin, `/leads/${listed._id}/call-check`)).status).toBe(404)
  expect((await get(stagiaire, `/leads/${mine._id}/call-check`)).status).toBe(404)
  await handOff(listed)
  expect((await get(admin, `/leads/${listed._id}/call-check`)).status).toBe(200)
  expect((await get(rep, `/leads/${listed._id}/call-check`)).status).toBe(403)
})
