import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { setupMongoReplSet, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'
import { createSession } from '../lib/session.js'
import commercialRoutes from '../routes/commercial/index.js'
import adminScriptReportRoutes from '../routes/admin/callScriptReports.js'
import adminCrmRoutes from '../routes/admin/crm.js'
import Lead from '../models/Lead.js'
import User from '../models/User.js'
import Call from '../models/Call.js'
import CallTranscript from '../models/CallTranscript.js'
import CallScriptReport from '../models/CallScriptReport.js'
import CrmSettings from '../models/CrmSettings.js'
import Interaction from '../models/Interaction.js'
import SchedulerLock from '../models/SchedulerLock.js'
import { runCallScriptReports } from '../lib/callScriptReport/index.js'
import { DEFAULT_CALL_SCRIPT_REPORT_SETTINGS } from '../lib/callScriptReport/settings.js'

const sendMail = vi.fn().mockResolvedValue({})
vi.mock('../lib/email/transport.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/email/transport.js')>()),
  getTransporter: () => ({ sendMail }),
}))

// Mercredi 11 nov. 2026 (semaine 46), puis lundi 16 nov. 2026 à 08:00 heure de Paris.
const LAST_WEEK = new Date('2026-11-11T10:00:00Z')
const MONDAY = new Date('2026-11-16T07:00:00Z')

// ── Faux service Messages : le vrai SDK et son parseur Zod sont exercés ──
const prompts: string[] = []
const replies: Array<{ status?: number; output?: unknown }> = []
let fake: http.Server

const modelOutput = {
  summary: 'Semaine courte, le prix revient souvent. Mme Durand de Boulangerie Durand a accepté un rendez-vous.',
  conversionReading: 'Un rendez-vous sur deux prospects joints, au-dessus de l’objectif.',
  objections: [
    {
      label: 'Le prix',
      occurrences: 2,
      quotes: [
        { call: 'C1', text: 'votre offre est trop chère pour nous' },
        { call: 'C1', text: 'Phrase inventée qui ne figure nulle part.' },
      ],
      response: 'Rappeler au 06 12 34 56 78 et chiffrer le retour sur investissement.',
    },
  ],
  advancing: [{ label: 'Proposer un créneau précis', call: 'C2', quote: 'jeudi à dix heures ça vous irait' }],
  losing: [{ label: 'Prix annoncé trop tôt', call: 'C9', quote: 'votre offre est trop chère pour nous' }],
  scriptChanges: [{ current: null, proposed: 'Ouvrir sur le résultat attendu avant le prix.', why: 'Objection prix.' }],
}

const app = express()
app.use(express.json())
app.use('/api/commercial', commercialRoutes)
app.use('/api/admin/crm/script-reports', adminScriptReportRoutes)
app.use('/api/admin/crm', adminCrmRoutes)
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  res.status(err.status || 500).json({ error: err.message })
})

type Who = { id: string; cookie: string }
let rita: Who
let remi: Who
let alice: Who
let carl: Who

beforeAll(async () => {
  await setupMongoReplSet()
  await Promise.all(
    [Lead, Call, CallTranscript, CallScriptReport, CrmSettings, Interaction].map((m) => (m as typeof Lead).init()),
  )
  fake = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      prompts.push(JSON.parse(raw).messages[0].content)
      const next = replies.shift() ?? {}
      res.writeHead(next.status ?? 200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify(
          next.status
            ? { type: 'error', error: { type: 'api_error', message: 'panne simulée' } }
            : {
                id: `msg_${prompts.length}`,
                type: 'message',
                role: 'assistant',
                model: 'claude-opus-5-5',
                content: [{ type: 'text', text: JSON.stringify(next.output ?? modelOutput) }],
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: { input_tokens: 3000, output_tokens: 900 },
              },
        ),
      )
    })
  })
  await new Promise<void>((resolve) => fake.listen(0, '127.0.0.1', resolve))
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise((resolve) => fake.close(resolve))
  await teardownMongo()
})
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: LAST_WEEK })
  await clearDb()
  prompts.length = 0
  replies.length = 0
  sendMail.mockClear()
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-simule'
  process.env.SMTP_USER = 'smtp'
  process.env.SMTP_PASS = 'smtp'
  const who: Who[] = []
  for (const [name, role] of [
    ['Rita', 'COMMERCIAL_EXTERNE'],
    ['Remi', 'COMMERCIAL_EXTERNE'],
    ['Alice', 'ADMIN'],
    ['Carl', 'COMMERCIAL'],
  ] as const) {
    const user = await User.create({ name, email: `${name.toLowerCase()}@venio.paris`, passwordHash: 'x', role })
    who.push({ id: String(user._id), cookie: `venio_session=${(await createSession(String(user._id))).token}` })
  }
  ;[rita, remi, alice, carl] = who as [Who, Who, Who, Who]
  await CrmSettings.updateSettings({
    callScriptReport: { ...DEFAULT_CALL_SCRIPT_REPORT_SETTINGS, enabled: true, recipients: ['direction@venio.paris'] },
  } as never)
})
afterEach(() => {
  vi.useRealTimers()
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
})

let attempt = 0
/** Un appel transcrit et consigné par `author` sur `lead`. */
async function transcribedCall(author: Who, lead: { _id: unknown }, lines: string[], outcome = 'NO_ANSWER') {
  attempt++
  const interaction = await Interaction.create({
    subjectType: 'LEAD',
    subjectId: lead._id,
    kind: 'CALL',
    outcome,
    scriptTag: 'DEFAULT',
    author: author.id,
    occurredAt: new Date(),
  })
  const call = await Call.create({
    lead: lead._id,
    author: author.id,
    to: `+3361000${String(attempt).padStart(4, '0')}`,
    from: '+33100000000',
    status: 'COMPLETED',
    clientRequestId: crypto.randomUUID(),
    attemptDay: '2026-11-11',
    attemptNo: 1,
    interaction: interaction._id,
  })
  await CallTranscript.create({
    call: call._id,
    lead: lead._id,
    author: author.id,
    language: 'fr',
    status: 'DONE',
    channels: 2,
    purgeAt: new Date('2027-11-11'),
    segments: lines.map((text, i) => ({
      speaker: i % 2 ? 'PROSPECT' : 'REP',
      startMs: i * 1000,
      endMs: i * 1000 + 900,
      text,
    })),
  })
}

async function seedWeek() {
  const ritaLead = await Lead.create({
    company: 'Boulangerie Durand',
    contactName: 'Mme Durand',
    contactPhone: '+33612345678',
    externalRep: rita.id,
    callList: 'Liste Rita',
    assignedTo: rita.id,
    createdBy: rita.id,
  })
  const remiLead = await Lead.create({
    company: 'Garage Martin',
    contactPhone: '+33698765432',
    externalRep: remi.id,
    callList: 'Liste Rémi',
    assignedTo: remi.id,
    createdBy: remi.id,
  })
  const aliceLead = await Lead.create({
    company: 'Cabinet Nord',
    contactPhone: '+33655555555',
    assignedTo: alice.id,
    createdBy: alice.id,
  })
  await transcribedCall(rita, ritaLead, ['Bonjour, Rita de Venio.', 'Votre offre est trop chère pour nous.'])
  await transcribedCall(rita, ritaLead, ['Jeudi à dix heures ça vous irait ?', 'Oui, parfait.'], 'MEETING_BOOKED')
  await transcribedCall(remi, remiLead, ['Bonjour, Rémi de Venio.', 'Secret de Rémi : rappelez en janvier.'])
  await transcribedCall(alice, aliceLead, ['Bonjour, Alice de Venio.', 'Nous avons déjà un prestataire.'])
}

it('cloisonnement : chacun son rapport, rien d’un externe chez l’équipe, aucun nom ni numéro de prospect', async () => {
  await seedWeek()
  vi.setSystemTime(MONDAY)
  await runCallScriptReports(MONDAY)

  const reports = await CallScriptReport.find().populate<{ author: { name: string } }>('author', 'name').lean()
  expect(reports.map((r) => `${r.author.name}:${r.authorKind}:${r.status}`).sort()).toEqual([
    'Alice:team:READY',
    'Remi:rep:READY',
    'Rita:rep:READY',
  ])
  // Chaque appel au modèle ne contient que les transcripts de son auteur, sans fiche ni numéro.
  const ritaPrompt = prompts.find((p) => p.includes('Rita de Venio'))!
  expect(ritaPrompt).not.toMatch(/Rémi|Alice|Durand|Boulangerie|\+336/)
  expect(prompts.find((p) => p.includes('Rémi de Venio'))).not.toMatch(/Rita|Alice/)

  const rita1 = reports.find((r) => r.author.name === 'Rita')!
  expect(rita1.stats).toMatchObject({ calls: 2, reached: 1, conversions: 1, conversionRate: 100, transcripts: 2 })
  // Citation inventée ou attribuée au mauvais appel : écartée. Nom, entreprise et numéro : masqués.
  expect(rita1.output!.objections[0]!.quotes).toEqual(['votre offre est trop chère pour nous'])
  expect(rita1.output!.losing[0]!.quote).toBeNull()
  expect(rita1.output!.advancing[0]!.quote).toBe('jeudi à dix heures ça vous irait')
  expect(rita1.output!.droppedQuotes).toBe(2)
  expect(JSON.stringify(rita1.output)).not.toMatch(/Durand|Boulangerie|06 12 34/)

  // E-mails : l'externe reçoit le sien, seul ; la copie ne reçoit que les rapports de l'équipe.
  const mails = sendMail.mock.calls.map(([mail]) => mail as { to: string; text: string; html: string })
  expect(mails.map((m) => m.to).sort()).toEqual([
    'alice@venio.paris, direction@venio.paris',
    'remi@venio.paris',
    'rita@venio.paris',
  ])
  for (const mail of mails)
    expect(`${mail.text}${mail.html}`).not.toMatch(/Durand|Boulangerie|Martin|\+33\d|06 12 34|trop chère/)

  // Lecture : l'externe, les siens ; l'équipe, jamais ceux d'un externe ; un membre, les siens.
  const ritaList = await request(app).get('/api/commercial/script-reports').set('Cookie', rita.cookie)
  expect(ritaList.body.reports).toHaveLength(1)
  const remiId = String(reports.find((r) => r.author.name === 'Remi')!._id)
  expect((await request(app).get(`/api/commercial/script-reports/${remiId}`).set('Cookie', rita.cookie)).status).toBe(
    404,
  )
  expect((await request(app).get(`/api/admin/crm/script-reports/${remiId}`).set('Cookie', alice.cookie)).status).toBe(
    404,
  )
  const aliceList = await request(app).get('/api/admin/crm/script-reports').set('Cookie', alice.cookie)
  expect(aliceList.body.reports.map((r: { author: { name: string } }) => r.author.name)).toEqual(['Alice'])
  const aliceId = String(reports.find((r) => r.author.name === 'Alice')!._id)
  expect((await request(app).get(`/api/admin/crm/script-reports/${aliceId}`).set('Cookie', carl.cookie)).status).toBe(
    404,
  )
  expect((await request(app).get(`/api/admin/crm/script-reports`).set('Cookie', rita.cookie)).status).toBe(403)
})

it('idempotent par auteur et par semaine ; reprise après une panne du fournisseur', async () => {
  await seedWeek()
  vi.setSystemTime(MONDAY)
  replies.push({ status: 500 }, { status: 500 }, { status: 500 }) // le SDK relance deux fois : un rapport en échec
  await runCallScriptReports(MONDAY)
  expect(await CallScriptReport.countDocuments({ status: 'FAILED', retryable: true })).toBe(1)
  expect(sendMail).toHaveBeenCalledTimes(2)

  // Passages suivants : ni nouveau rapport, ni nouvel e-mail, et la reprise attend son heure.
  await runCallScriptReports(new Date(MONDAY.getTime() + 60_000))
  expect(await CallScriptReport.countDocuments()).toBe(3)
  expect(prompts).toHaveLength(5)

  // Verrou de planification perdu (autre instance, purge) : la semaine ne se recrée pas.
  await SchedulerLock.deleteMany({})
  const later = new Date(MONDAY.getTime() + 20 * 60_000)
  vi.setSystemTime(later)
  await runCallScriptReports(later)
  expect(await CallScriptReport.countDocuments()).toBe(3)
  expect(await CallScriptReport.countDocuments({ status: 'READY' })).toBe(3)
  expect(prompts).toHaveLength(6)
  expect(sendMail).toHaveBeenCalledTimes(3)
})

it('réglages : bloc entier, destinataires de l’équipe ou de l’entreprise seulement', async () => {
  const patch = (body: object) => request(app).patch('/api/admin/crm/settings').set('Cookie', alice.cookie).send(body)
  const block = { ...DEFAULT_CALL_SCRIPT_REPORT_SETTINGS, enabled: true }
  expect((await patch({ 'callScriptReport.recipients': ['x@gmail.com'] })).status).toBe(400)
  expect((await patch({ callScriptReport: { ...block, recipients: ['prospect@gmail.com'] } })).body.field).toBe(
    'callScriptReport.recipients',
  )
  expect((await patch({ callScriptReport: { ...block, maxInputTokens: 10 } })).status).toBe(400)
  const ok = await patch({
    callScriptReport: { ...block, recipients: ['Carl@venio.paris'], model: 'claude-sonnet-5-5' },
  })
  expect(ok.status).toBe(200)
  expect(ok.body.settings.callScriptReport).toMatchObject({
    recipients: ['carl@venio.paris'],
    model: 'claude-sonnet-5-5',
  })
})
