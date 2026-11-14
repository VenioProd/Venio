import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import adminCallDeskRoutes from '../routes/admin/callDesk.js'
import Call from '../models/Call.js'
import CallAnalysis, { type CallAnalysisStatus } from '../models/CallAnalysis.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'

/**
 * `GET /api/admin/call-desk/pending` (écran « Aujourd'hui » du CRM) : ce qui
 * attend une décision, sur le périmètre exact des routes voisines — analyses
 * `READY` validables (`teamCallScope`), retenues décidables (`callHold.ts`) —
 * et sans aucun contenu d'appel.
 */
const app = express()
app.use(express.json())
app.use('/api/admin/call-desk', adminCallDeskRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

type Who = { id: string; cookie: string }
let rep: Who // commercial externe
let admin: Who // écrit sur tout le CRM
let com: Who // commercial interne : écrit sur ses fiches seulement
let stagiaire: Who // VIEW_CRM sans MANAGE_CRM

const get = (who: Who, path: string) => request(app).get(`/api/admin/call-desk${path}`).set('Cookie', who.cookie)
const pending = async (who: Who) => {
  const res = await get(who, '/pending')
  expect(res.status).toBe(200)
  return res.body as {
    analyses: Array<{ callId: string; leadId: string; company: string }>
    analysesTotal: number
    holds: Array<{ leadId: string; company: string }>
    holdsTotal: number
  }
}

const SECRETS = {
  summary: 'Le prospect veut une boutique en ligne.',
  quote: 'Ne me rappelez plus jamais',
  field: 'Nous sommes un restaurant',
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
const repListLead = (company: string, extra: object = {}) =>
  Lead.create({
    company,
    businessContact: true,
    contactPhone: '+33633333333',
    externalRep: rep.id,
    callList: 'Liste Rita',
    assignedTo: rep.id,
    createdBy: rep.id,
    ...extra,
  })

/** Appel terminé et son analyse, au nom de `author` (une tentative distincte par appel). */
let attemptNo = 0
async function analysedCall(
  author: Who,
  lead: { _id: unknown },
  status: CallAnalysisStatus = 'READY',
  callDate = new Date('2026-11-13T09:07:00Z'),
) {
  const call = await Call.create({
    lead: lead._id,
    author: author.id,
    to: '+33611111111',
    from: '+33180000000',
    clientRequestId: crypto.randomUUID(),
    attemptDay: '2026-11-13',
    attemptNo: ++attemptNo,
    status: 'COMPLETED',
    durationSec: 262,
  })
  const analysis = await CallAnalysis.create({
    call: call._id,
    lead: lead._id,
    author: author.id,
    status,
    output: {
      summary: SECRETS.summary,
      suggestedOutcome: null,
      optOut: { detected: true, quote: SECRETS.quote, quoteVerified: true },
      fields: [{ key: 'sector', value: 'Restauration', confidence: 'HIGH', quote: SECRETS.field, quoteVerified: true }],
      heat: { score: 40, level: 'TIEDE', criteria: [] },
      actions: [],
    },
    callDate,
    durationSec: 262,
    purgeAt: new Date(Date.now() + 365 * 86400_000),
  })
  return { call, analysis }
}

/** Fiche retenue pour opposition, sur un appel de `author`. */
async function hold(author: Who, lead: { _id: unknown }) {
  const { call, analysis } = await analysedCall(author, lead, 'APPLIED')
  const at = new Date('2026-11-12T16:48:00Z')
  await Lead.updateOne(
    { _id: lead._id },
    { $set: { callHold: { at, reason: 'OPT_OUT_DETECTED', analysis: analysis._id, call: call._id } } },
  )
  return { call, at }
}

const handOff = (lead: { _id: unknown }) =>
  Lead.updateOne({ _id: lead._id }, { $set: { closingHandoff: { at: new Date(), to: admin.id, by: rep.id } } })

beforeAll(async () => {
  await setupMongo()
  await Promise.all([Lead, Call, CallAnalysis].map((model) => (model as typeof Lead).init()))
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

it('analyses : les siennes, pas celles d’un autre membre ni d’un externe non transmis ; celles d’un externe transmis', async () => {
  const mine = await teamLead(admin, 'Menuiserie Dubreuil')
  const { call: myCall } = await analysedCall(admin, mine)
  // Déjà relue, en cours ou en échec : rien à valider.
  for (const status of ['APPLIED', 'PENDING', 'FAILED'] as const) await analysedCall(admin, mine, status)
  // Un autre membre sur sa propre fiche : Alice écrit sur tout le CRM, mais ne valide pas l'analyse de Carl.
  const carls = await teamLead(com, 'Garage Lambert')
  const { call: carlCall } = await analysedCall(com, carls)
  // Externe, liste non transmise : invisible de l'équipe.
  const listed = await repListLead('Auto-école Horizon')
  const { call: listedCall } = await analysedCall(rep, listed)
  // Externe, fiche transmise au closer : c'est l'équipe qui valide.
  const handed = await repListLead('Cabinet Durand')
  const { call: handedCall } = await analysedCall(rep, handed, 'READY', new Date('2026-11-12T10:00:00Z'))
  await handOff(handed)

  const forAdmin = await pending(admin)
  expect(forAdmin.analyses.map((row) => row.callId)).toEqual([String(myCall._id), String(handedCall._id)])
  expect(forAdmin.analysesTotal).toBe(2)
  const forCarl = await pending(com)
  expect(forCarl.analyses.map((row) => row.callId)).toEqual([String(carlCall._id)])

  // Même périmètre que la route voisine : chaque analyse listée s'ouvre, les autres répondent 404.
  for (const row of forAdmin.analyses) expect((await get(admin, `/calls/${row.callId}/analysis`)).status).toBe(200)
  for (const callId of [carlCall._id, listedCall._id])
    expect((await get(admin, `/calls/${callId}/analysis`)).status).toBe(404)
  // Hors du périmètre d'écriture de Carl : ni la fiche d'Alice, ni la fiche transmise.
  for (const callId of [myCall._id, handedCall._id])
    expect((await get(com, `/calls/${callId}/analysis`)).status).toBe(404)
})

it('retenues : toute fiche où l’on écrit, y compris celle d’un externe non transmise ; rien hors périmètre', async () => {
  const listed = await repListLead('Auto-école Horizon')
  await hold(rep, listed)
  const carls = await teamLead(com, 'Garage Lambert')
  await hold(com, carls)
  await teamLead(com, 'Sans retenue')

  const forAdmin = await pending(admin)
  expect(forAdmin.holds.map((row) => row.company).sort()).toEqual(['Auto-école Horizon', 'Garage Lambert'])
  expect(forAdmin.holdsTotal).toBe(2)
  // Carl n'écrit que sur ses fiches : la sienne, pas celle de l'externe.
  const forCarl = await pending(com)
  expect(forCarl.holds.map((row) => row.leadId)).toEqual([String(carls._id)])

  // Même périmètre que la décision : chaque retenue listée s'ouvre, l'autre répond 404.
  for (const row of forAdmin.holds) expect((await get(admin, `/leads/${row.leadId}/call-hold`)).status).toBe(200)
  expect((await get(com, `/leads/${listed._id}/call-hold`)).status).toBe(404)
})

it('forme : identifiants, société, date, durée et auteur, sans rien du contenu de l’appel', async () => {
  const mine = await teamLead(admin, 'Menuiserie Dubreuil')
  const { call } = await analysedCall(admin, mine)
  const listed = await repListLead('Auto-école Horizon')
  const { call: holdCall, at } = await hold(rep, listed)

  const body = await pending(admin)
  expect(body).toEqual({
    analyses: [
      {
        callId: String(call._id),
        leadId: String(mine._id),
        company: 'Menuiserie Dubreuil',
        callDate: '2026-11-13T09:07:00.000Z',
        durationSec: 262,
        author: { _id: admin.id, name: 'Alice' },
      },
    ],
    analysesTotal: 1,
    holds: [
      {
        leadId: String(listed._id),
        company: 'Auto-école Horizon',
        at: at.toISOString(),
        author: { _id: rep.id, name: 'Rita' },
      },
    ],
    holdsTotal: 1,
  })
  // Ni transcript, ni analyse, ni citation, ni numéro ; pour la retenue d'un externe, pas même l'appel.
  const raw = JSON.stringify(body)
  for (const secret of [
    ...Object.values(SECRETS),
    'Restauration',
    '+33633333333',
    '+33611111111',
    String(holdCall._id),
  ])
    expect(raw).not.toContain(secret)
})

it('gardes : MANAGE_CRM exigé ; l’externe n’entre pas ici', async () => {
  expect((await get(stagiaire, '/pending')).status).toBe(403)
  expect((await get(rep, '/pending')).status).toBe(403)
  expect((await request(app).get('/api/admin/call-desk/pending')).status).toBe(401)
})
